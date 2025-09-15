import { json } from '../http/response';
import { endpoints, fetchJSON } from '../fpl/fetch';
import { getBootstrap } from '../fpl/bootstrap';
import { indexBy } from '../util/indexBy';
import { buildProjected } from '../compute/projection';
import { applyAutosubs } from '../compute/autosubs';
import { makePlayStateBuilder } from '../compute/playState';
import { applyProvisionalBonus } from '../compute/provisionalBonus';

const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
const delta = (prev?:number, now?:number)=>(!prev||!now)?0:(prev-now);

export async function leagueHandler(leagueId: string, params: Record<string,string>) {
  let mode = (params.mode || 'auto') as 'auto'|'live'|'fast';
  const page = Number(params.page || 1);
  const autosubs = (params.autosubs || 'on') !== 'off';

  // Ask FPL whether official points are "ready" (nightly refresh; 'r' = ready)
  let official_ready = false;
  try {
    const status = await fetchJSON<any>(endpoints.eventStatus());
    const pointsFlag = status?.status?.[0]?.points;
    official_ready = pointsFlag === 'r' || pointsFlag === true;
  } catch { /* non-fatal */ }

  const base = await fetchJSON<any>(endpoints.leagueClassic(leagueId, page));
  const members = base?.standings?.results || [];
  const totalMembers = base?.standings?.total || members.length;

  // Auto policy:
  // - If official points "ready", use fast (confirmed table)
  // - Else use live (computed), except for very large leagues where we keep fast for perf
  if (mode === 'auto') {
    if (official_ready) {
      mode = 'fast';
    } else {
      mode = (totalMembers > 150) ? 'fast' : 'live';
    }
  }

  if (mode === 'fast') {
    const table = members.map((m:any)=>({
      entry: m.entry,
      player_name: m.player_name,
      entry_name: m.entry_name,
      rank: m.rank,
      last_rank: m.last_rank,
      rank_delta: delta(m.last_rank, m.rank),
      live_gw: m.event_total,
      total: m.total
    }));
    return json({
      ok: true,
      league: base.league,
      totalMembers,
      mode: official_ready ? 'fast' : 'auto-fast',
      official_ready,
      table
    });
  }

  // LIVE path
  const { bootstrap, fixtures, currentEventId } = await getBootstrap(null);
  const live = await fetchJSON(endpoints.eventLive(currentEventId));
  const playersById = indexBy(bootstrap.elements, 'id');
  const projectedById = buildProjected(live);
  applyProvisionalBonus(projectedById, fixtures, playersById);
  const playStateFor = makePlayStateBuilder(fixtures, playersById);

  async function liveGW(entry:number){
    const picks = await fetchJSON<any>(endpoints.picks(entry, currentEventId));
    const sorted = [...picks.picks].sort((a:any,b:any)=>a.position-b.position);
    const starters = sorted.filter((p:any)=>p.position<=11);
    const bench = sorted.filter((p:any)=>p.position>=12);

    const chip = picks.active_chip || null;
    const bb = chip==='bboost';
    const tc = chip==='3xc';

    const capEl = starters.find((p:any)=>p.is_captain)?.element;
    const capMin = capEl ? (projectedById[capEl]?.minutes || 0) : 0;
    const capTeamFinished = capEl ? playStateFor(capEl, capMin).team_finished : false;
    const capPlayed = !!capEl && (capMin>0 || !capTeamFinished);

    const surelyAbsent = (elId:number)=>{
      const m = projectedById[elId]?.minutes || 0;
      const st = playStateFor(elId, m);
      return st.team_finished && m===0;
    };

    const { effective, usedBench } = applyAutosubs(starters, bench, playersById, autosubs && !bb, surelyAbsent);
    const benchRem = bench.filter((b:any)=>!usedBench.has(b.element));

    let total = 0;
    for (const slot of [...effective, ...benchRem]) {
      const base = projectedById[slot.element]?.projected_total || 0;
      let mult = slot.multiplier || 0;
      if (bb && slot.position>=12) mult = 1;
      if (slot.is_vice_captain && !capPlayed) mult = Math.max(mult, tc?3:2);
      total += base * mult;
    }
    return Math.round(total);
  }

  const poolSize = 8;
  const ids = members.map((m:any)=>m.entry);
  const totals: Array<{entry:number; gw:number}> = [];
  for (let i=0;i<ids.length;i+=poolSize){
    const chunk = ids.slice(i,i+poolSize);
    const res = await Promise.all(chunk.map(async id=>{
      try { return { entry:id, gw: await liveGW(id) }; } catch { return null; }
    }));
    res.filter(Boolean).forEach((r:any)=>totals.push(r));
    await sleep(200);
  }

  const liveById = new Map(totals.map(r=>[r.entry, r.gw]));
  const merged = members.map((m:any)=>{
    const before = m.total - m.event_total;
    const live_gw = liveById.get(m.entry) ?? m.event_total;
    const total = before + live_gw;
    return {
      entry: m.entry,
      player_name: m.player_name,
      entry_name: m.entry_name,
      last_rank: m.rank,
      base_rank: m.rank,
      live_gw,
      total
    };
  });

  merged.sort((a,b)=>b.total-a.total);
  merged.forEach((r:any,i:number)=>{ (r as any).rank = i+1; (r as any).rank_delta = delta(r.last_rank, r.rank); });

  const table = merged.map(r=>({
    entry:r.entry,
    player_name:r.player_name,
    entry_name:r.entry_name,
    rank:r.rank,
    last_rank:r.last_rank,
    rank_delta:r.rank_delta,
    live_gw:r.live_gw,
    total:r.total
  }));

  return json({
    ok: true,
    league: base.league,
    totalMembers,
    mode: 'live',
    official_ready,
    table
  });
}
