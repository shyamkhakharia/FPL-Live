import { getBootstrap } from '../fpl/bootstrap';
import { endpoints, fetchJSON } from '../fpl/fetch';
import { indexBy } from '../util/indexBy';
import { round2 } from '../util/math';
import { buildProjected, pickEventBadges } from '../compute/projection';
import { makePlayStateBuilder } from '../compute/playState';
import { applyAutosubs } from '../compute/autosubs';
import { json } from '../http/response';

export async function liveManagerHandler(entryId: string, params: Record<string, string>) {
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
  const playStateFor = makePlayStateBuilder(fixtures, playersById);

  const sorted = [...picks.picks].sort((a,b) => a.position - b.position);
  const starters = sorted.filter(p => p.position <= 11);
  const bench = sorted.filter(p => p.position >= 12);

  const activeChip = picks.active_chip || null;
  const benchBoost = activeChip === 'bboost';
  const tcActive = activeChip === '3xc';

  const surelyAbsent = (elId: number) => {
    const m = projectedById[elId]?.minutes || 0;
    if (m > 0) return false;
    const st = playStateFor(elId, m);
    return st.team_finished && m === 0;
  };

  const { effective, usedBench } = applyAutosubs(
    starters,
    bench,
    playersById,
    !benchBoost && autosubs,
    surelyAbsent
  );

  const benchFiltered = bench.filter(b => !usedBench.has(b.element));

  const typeName = (t: number) => (t===1?'GK':t===2?'DEF':t===3?'MID':'FWD');

  const capEl = effective.find(p => p.is_captain)?.element;
  const capPlayed = capEl ? ((projectedById[capEl]?.minutes || 0) > 0 || !surelyAbsent(capEl)) : false;

  const slots: any[] = [];
  let startersSum = 0, benchSum = 0;

  for (const slot of [...effective, ...benchFiltered]) {
    const elId = slot.element;
    const player = playersById[elId] || {};
    const team = teamsById[player.team] || {};
    const proj = projectedById[elId] || {};
    const base = proj.projected_total || 0;

    let mult = slot.multiplier || 0;
    if (benchBoost && slot.position >= 12) mult = 1;
    if (slot.is_vice_captain && !capPlayed) mult = Math.max(mult, tcActive ? 3 : 2);

    const slotPoints = base * mult;

    const info = {
      position: slot.position,
      element: elId,
      on_bench: slot.position >= 12,
      name: player.web_name || `#${elId}`,
      team_short: team.short_name || '',
      type: typeName(player.element_type),
      projected_points: round2(base),
      total: round2(slotPoints),
      multiplier: mult,
      is_captain: !!slot.is_captain,
      is_vice_captain: !!slot.is_vice_captain,
      events: pickEventBadges(proj) || [],
      bps: proj.bps || 0, // <-- expose live BPS
      play_state: { ...playStateFor(elId, proj.minutes || 0), came_on: slot.position >= 12 && (proj.minutes || 0) > 0 }
    };

    if (slot.position <= 11) startersSum += slotPoints; else benchSum += slotPoints;
    slots.push(info);
  }

  const liveAvg = (bootstrap.events.find((e: any) => e.id === Number(currentEventId)) || {}).average_entry_score ?? 0;
  const diffVsAvg = round2(startersSum - liveAvg);
  const trend = diffVsAvg > 5 ? 'up' : diffVsAvg < -5 ? 'down' : 'flat';

  return json({
    ok: true,
    entryId: Number(entryId),
    currentEventId,
    activeChip,
    autosubs: !!autosubs,
    team: slots.sort((a,b) => a.position - b.position),
    totals: { starters: round2(startersSum), bench: round2(benchSum), overall: round2(startersSum + benchSum) },
    live_average: liveAvg,
    diff_vs_average: diffVsAvg,
    live_trend: trend
  });
}