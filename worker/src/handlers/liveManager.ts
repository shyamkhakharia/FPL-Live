import { getBootstrap } from '../fpl/bootstrap';
import { endpoints, fetchJSON } from '../fpl/fetch';
import { indexBy } from '../util/indexBy';
import { round2 } from '../util/math';
import { buildProjected } from '../compute/projection';
import { makePlayStateBuilder } from '../compute/playState';
import { applyAutosubs } from '../compute/autosubs';
import { applyProvisionalBonus } from '../compute/provisionalBonus';
import { json } from '../http/response';

export async function liveManagerHandler(entryId: string, params: Record<string,string>) {
  const autosubs = (params.autosubs || 'on') !== 'off';
  const eventOverride = params.event ? Number(params.event) : null;

  const { bootstrap, fixtures, currentEventId } = await getBootstrap(eventOverride);
  const [picks, live] = await Promise.all([
    fetchJSON(endpoints.picks(entryId, currentEventId)),
    fetchJSON(endpoints.eventLive(currentEventId))
  ]);

  const teamsById = indexBy(bootstrap.teams, 'id');
  const playersById = indexBy(bootstrap.elements, 'id');
  const projectedById = buildProjected(live);
  // ✅ add provisional (3/2/1) for unfinished fixtures
  applyProvisionalBonus(projectedById, fixtures, playersById);

  const playStateFor = makePlayStateBuilder(fixtures, playersById);
  const sorted = [...picks.picks].sort((a,b)=>a.position-b.position);
  const starters = sorted.filter(p=>p.position<=11);
  const bench = sorted.filter(p=>p.position>=12);

  const chip = picks.active_chip || null;
  const benchBoost = chip === 'bboost';
  const tcActive = chip === '3xc';

  const surelyAbsent = (elId:number)=>{
    const m = projectedById[elId]?.minutes || 0;
    const st = playStateFor(elId, m);
    return st.team_finished && m===0;
  };

  const { effective, usedBench } = applyAutosubs(starters, bench, playersById, !benchBoost && autosubs, surelyAbsent);
  const benchFiltered = bench.filter(b=>!usedBench.has(b.element));

  const typeName = (t:number)=>(t===1?'GK':t===2?'DEF':t===3?'MID':'FWD');
  const capEl = effective.find(p=>p.is_captain)?.element;
  const capPlayed = capEl ? ((projectedById[capEl]?.minutes||0)>0 || !surelyAbsent(capEl)) : false;

  const slots:any[] = [];
  let startersSum=0, benchSum=0;

  for (const slot of [...effective, ...benchFiltered]){
    const el = slot.element;
    const pl = playersById[el] || {};
    const team = teamsById[pl.team] || {};
    const proj = projectedById[el] || {};
    const base = proj.projected_total || 0;
    let mult = slot.multiplier || 0;
    if (benchBoost && slot.position>=12) mult = 1;
    if (slot.is_vice_captain && !capPlayed) mult = Math.max(mult, tcActive?3:2);
    const points = base * mult;

    const info = {
      position: slot.position,
      element: el,
      on_bench: slot.position>=12,
      name: pl.web_name || `#${el}`,
      team_short: team.short_name || '',
      type: typeName(pl.element_type),
      projected_points: round2(base),
      total: round2(points),
      multiplier: mult,
      is_captain: !!slot.is_captain,
      is_vice_captain: !!slot.is_vice_captain,
      bps: proj.bps || 0,
      play_state: { ...playStateFor(el, proj.minutes || 0) }
    };

    if (slot.position<=11) startersSum+=points; else benchSum+=points;
    slots.push(info);
  }

  const liveAvg = (bootstrap.events.find((e:any)=>e.id===Number(currentEventId))||{}).average_entry_score ?? 0;
  return json({
    ok:true,
    entryId: Number(entryId),
    currentEventId,
    activeChip: chip,
    team: slots.sort((a,b)=>a.position-b.position),
    totals: { starters: round2(startersSum), bench: round2(benchSum), overall: round2(startersSum+benchSum) },
    live_average: liveAvg,
    diff_vs_average: round2(startersSum - liveAvg)
  });
}
