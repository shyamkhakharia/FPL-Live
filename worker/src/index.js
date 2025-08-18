/**
 * Cloudflare Worker: Free proxy + scoring API for FPL-Live
 * - Bypasses cloud IP blocking by egressing via Cloudflare network
 * - Adds CORS headers
 * - Caches aggressively to stay within free tier
 * - Implements live scoring, provisional bonus via BPS, and formation-aware auto-subs
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), env);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/proxy/')) {
        return await handleProxy(request, env, ctx);
      }

      if (url.pathname === '/api/bootstrap') {
        return await handleBootstrap(env, ctx);
      }

      if (url.pathname.startsWith('/api/manager/')) {
        const [, , , id, sub] = url.pathname.split('/');
        const params = Object.fromEntries(url.searchParams.entries());
        if (sub === 'live') {
          return await handleLiveManager(id, params, env, ctx);
        } else if (!sub) {
          return await handleManager(id, env, ctx);
        }
      }

      if (url.pathname.startsWith('/api/leagues/')) {
        const [, , , leagueId] = url.pathname.split('/');
        const params = Object.fromEntries(url.searchParams.entries());
        return await handleLeague(leagueId, params, env, ctx);
      }

      return cors(json({ ok: true, message: 'FPL-Live Worker: see /api/*' }), env);
    } catch (err) {
      return cors(json({ ok: false, error: err.message || String(err) }, 500), env);
    }
  }
};

const FPL = 'https://fantasy.premierleague.com';

async function handleProxy(request, env, ctx) {
  const url = new URL(request.url);
  const fplPath = url.pathname.replace('/proxy', '');
  if (!fplPath.startsWith('/api/')) {
    return cors(json({ ok: false, error: 'Only /api/* may be proxied' }, 400), env);
  }
  const target = `${FPL}${fplPath}${url.search}`;
  const cache = caches.default;
  const cacheKey = new Request(target, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cors(cloneWithCORS(cached), env);

  const res = await fetch(target, { headers: { 'user-agent': UA() } });
  const copy = new Response(await res.arrayBuffer(), { status: res.status, headers: res.headers });
  if (res.ok) {
    copy.headers.set('Cache-Control', `public, s-maxage=${env.CACHE_TTL_MED || 300}`);
    ctx.waitUntil(cache.put(cacheKey, copy.clone()));
  }
  return cors(copy, env);
}

async function handleBootstrap(env, ctx) {
  const cache = caches.default;
  const key = new Request('https://worker/bootstrap');
  const cached = await cache.match(key);
  if (cached) return cors(cloneWithCORS(cached), env);

  const [bootstrap, eventStatus] = await Promise.all([
    fetchJSON(`${FPL}/api/bootstrap-static/`),
    fetchJSON(`${FPL}/api/event-status/`)
  ]);

  const currentEvent = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next) || bootstrap.events[0];
  const fixtures = await fetchJSON(`${FPL}/api/fixtures/?event=${currentEvent.id}`);

  const payload = { bootstrap, eventStatus, fixtures, currentEventId: currentEvent.id };
  const res = json(payload);
  res.headers.set('Cache-Control', `public, s-maxage=${env.CACHE_TTL_MED || 300}`);
  ctx.waitUntil(cache.put(key, res.clone()));
  return cors(res, env);
}

async function handleManager(entryId, env, ctx) {
  const { currentEventId } = await getBootstrap();

  // leagues come from the entry object; there is no /entry/:id/leagues endpoint
  const [entry, picks] = await Promise.all([
    fetchJSON(`${FPL}/api/entry/${entryId}/`),
    fetchJSON(`${FPL}/api/entry/${entryId}/event/${currentEventId}/picks/`)
  ]);

  const summary = {
    id: entry.id,
    player_first_name: entry.player_first_name,
    player_last_name: entry.player_last_name,
    name: entry.name,
    overall_rank: entry.summary_overall_rank,
    total_points: entry.summary_overall_points,
  };

  const leagues = entry.leagues || { classic: [], h2h: [] };

  return cors(json({ ok: true, summary, picks, leagues, currentEventId }), env);
}

async function handleLiveManager(entryId, params, env, ctx) {
  const autosubs = (params.autosubs || 'on') !== 'off';
  const { bootstrap, fixtures, currentEventId } = await getBootstrap();
  const [picks, live] = await Promise.all([
    fetchJSON(`${FPL}/api/entry/${entryId}/event/${currentEventId}/picks/`),
    fetchJSON(`${FPL}/api/event/${currentEventId}/live/`)
  ]);

  const teamIndex = indexBy(bootstrap.teams, 'id');
  const playerIndex = indexBy(bootstrap.elements, 'id');

  const activeChip = picks.active_chip || null; // 'bboost' | '3xc' | 'freehit' | 'wildcard' | null

  const projected = buildProjected(live, fixtures);

  const picksByPos = [...picks.picks].sort((a,b) => a.position - b.position);
  const starters = picksByPos.filter(p => p.position <= 11);
  const bench = picksByPos.filter(p => p.position >= 12);

  const benchBoost = activeChip === 'bboost';
  const tcActive = activeChip === '3xc';

  let usedBenchIds = new Set();
  let effectivePicks = starters.map(s => ({...s}));

  const playerPlayed = (elId) => (projected[elId]?.minutes || 0) > 0;

  const teamFixturesFinished = (fixturesArr, teamId) => {
    for (const f of fixturesArr) {
      if (f.team_h === teamId || f.team_a === teamId) {
        if (!(f.finished || f.finished_provisional)) return false;
      }
    }
    return true;
  };

  const surelyAbsent = (elId) => {
    const minutes = projected[elId]?.minutes || 0;
    if (minutes > 0) return false;
    const teamId = playerIndex[elId]?.team;
    if (!teamId) return false;
    return teamFixturesFinished(fixtures, teamId);
  };

  if (!benchBoost && autosubs) {
    const startGK = effectivePicks.find(p => playerIndex[p.element]?.element_type === 1);
    if (startGK && surelyAbsent(startGK.element)) {
      const benchGK = bench.find(p => playerIndex[p.element]?.element_type === 1);
      if (benchGK) {
        usedBenchIds.add(benchGK.element);
        startGK.element = benchGK.element;
      }
    }

    const outfieldBench = bench.filter(p => playerIndex[p.element]?.element_type !== 1);

    const countFormation = () => {
      const counts = { DEF:0, MID:0, FWD:0 };
      for (const p of effectivePicks) {
        const et = playerIndex[p.element]?.element_type;
        if (et === 2) counts.DEF++;
        else if (et === 3) counts.MID++;
        else if (et === 4) counts.FWD++;
      }
      return counts;
    };

    const minFormation = { DEF:3, MID:2, FWD:1 };

    for (let i = 0; i < effectivePicks.length; i++) {
      const p = effectivePicks[i];
      const et = playerIndex[p.element]?.element_type;
      if (!surelyAbsent(p.element) || et === 1) continue;

      const formation = countFormation();
      for (const b of outfieldBench) {
        if (usedBenchIds.has(b.element)) continue;
        const bet = playerIndex[b.element]?.element_type;

        const removingRole = (et === 2 ? 'DEF' : et === 3 ? 'MID' : 'FWD');
        const incomingRole = (bet === 2 ? 'DEF' : bet === 3 ? 'MID' : 'FWD');

        const wouldFormation = { ...formation };
        wouldFormation[removingRole]--;
        wouldFormation[incomingRole]++;

        if (wouldFormation.DEF >= minFormation.DEF && wouldFormation.MID >= minFormation.MID && wouldFormation.FWD >= minFormation.FWD) {
          usedBenchIds.add(b.element);
          p.element = b.element;
          break;
        }
      }
    }
  }

  const benchFiltered = bench.filter(b => !usedBenchIds.has(b.element));

  const slots = [];
  let total = 0;
  let benchTotal = 0;
  let capElement = effectivePicks.find(p => p.is_captain)?.element;

  const capPlayed = capElement ? playerPlayed(capElement) || !surelyAbsent(capElement) : false;

  for (const slot of [...effectivePicks, ...benchFiltered]) {
    const elId = slot.element;
    const base = projected[elId]?.projected_total || 0;

    let mult = slot.multiplier || 0;

    if (benchBoost && slot.position >= 12) mult = 1;

    // Triple Captain transfers to VC at 3x; otherwise VC at 2x
    if (slot.is_vice_captain && !capPlayed) {
      mult = Math.max(mult, tcActive ? 3 : 2);
    }

    const slotPoints = base * mult;
    const info = {
      position: slot.position,
      element: elId,
      name: displayName(elId),
      team_short: '—', // UI enriches with bootstrap data; not needed here
      type: typeName(playerIndex[elId]?.element_type),
      is_captain: !!slot.is_captain,
      is_vice_captain: !!slot.is_vice_captain,
      on_bench: slot.position >= 12,
      projected_points: round2(base),
      multiplier: mult,
      total: round2(slotPoints),
      events: pickEventBadges(projected[elId])
    };

    if (slot.position <= 11) total += slotPoints; else benchTotal += slotPoints;
    slots.push(info);
  }

  const avg = await getEventAverage(currentEventId);
  const diffVsAvg = round2(total - avg);
  const trend = diffVsAvg > 5 ? 'up' : diffVsAvg < -5 ? 'down' : 'flat';

  const payload = {
    ok: true,
    entryId: Number(entryId),
    currentEventId,
    activeChip,
    autosubs: !!autosubs,
    team: slots.sort((a,b) => a.position - b.position),
    totals: { starters: round2(total), bench: round2(benchTotal), overall: round2(total + benchTotal) },
    live_average: avg,
    diff_vs_average: diffVsAvg,
    live_trend: trend
  };

  return cors(json(payload), env);
}

async function handleLeague(leagueId, params, env, ctx) {
  const mode = (params.mode || 'auto');
  const { bootstrap, fixtures, currentEventId } = await getBootstrap();

  // FIRST PAGE (metadata + size)
  const first = await fetchJSON(`${FPL}/api/leagues-classic/${leagueId}/standings/?page_standings=1`);
  const members = [...first.standings.results];
  const totalMembers = Number(first.standings.total) || members.length;

  // threshold now 100
  const MAX_FULL = 100;
  const doFull = mode === 'full' || (mode === 'auto' && totalMembers <= MAX_FULL);

  if (!doFull) {
    const table = members.map(m => ({
      entry: m.entry,
      player_name: m.player_name,
      entry_name: m.entry_name,
      rank: m.rank,
      last_rank: m.last_rank,
      event_total: m.event_total,
      total: m.total,
    }));
    return cors(json({ ok: true, league: first.league, mode: 'fast', page: 1, totalMembers, table }), env);
  }

  // fetch remaining pages (if any)
  let page = 1;
  while (first.standings.has_next) {
    page += 1;
    const more = await fetchJSON(`${FPL}/api/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
    members.push(...more.standings.results);
    if (!more.standings.has_next) break;
  }

  // PRE-FETCH EVENT LIVE ONCE
  const live = await fetchJSON(`${FPL}/api/event/${currentEventId}/live/`);
  const projected = buildProjected(live, fixtures);

  const playerIndex = indexBy(bootstrap.elements, 'id');

  const limiter = pLimit(12); // moderate concurrency

  const rows = await Promise.all(members.map(m => limiter(async () => {
    try {
      // picks are the only per-entry call: cache briefly (60s)
      const picks = await fetchJSONCached(`${FPL}/api/entry/${m.entry}/event/${currentEventId}/picks/`, 60);

      // compute total using precomputed projected map
      const picksByPos = [...picks.picks].sort((a,b) => a.position - b.position);
      const starters = picksByPos.filter(p => p.position <= 11);
      const bench = picksByPos.filter(p => p.position >= 12);
      const benchBoost = picks.active_chip === 'bboost';

      // absence = 0 minutes and no more fixtures for their team
      const teamFixturesFinished = (fixturesArr, teamId) => {
        for (const f of fixturesArr) {
          if (f.team_h === teamId || f.team_a === teamId) {
            if (!(f.finished || f.finished_provisional)) return false;
          }
        }
        return true;
      };
      const surelyAbsent = (elId) => {
        const mnts = projected[elId]?.minutes || 0;
        if (mnts > 0) return false;
        const teamId = playerIndex[elId]?.team;
        if (!teamId) return false;
        return teamFixturesFinished(fixtures, teamId);
      };

      let effective = starters.map(s => ({...s}));

      if (!benchBoost) {
        const startGK = effective.find(p => playerIndex[p.element]?.element_type === 1);
        if (startGK && surelyAbsent(startGK.element)) {
          const benchGK = bench.find(p => playerIndex[p.element]?.element_type === 1);
          if (benchGK) startGK.element = benchGK.element;
        }
        const outfieldBench = bench.filter(p => playerIndex[p.element]?.element_type !== 1);
        const countFormation = () => {
          const c = {2:0,3:0,4:0};
          for (const p of effective) { const et = playerIndex[p.element]?.element_type; if (et>=2) c[et]++; }
          return c;
        };
        const min = {2:3,3:2,4:1};
        const used = new Set();
        for (const p of effective) {
          const et = playerIndex[p.element]?.element_type;
          if (et===1 || !surelyAbsent(p.element)) continue;
          const formation = countFormation();
          for (const b of outfieldBench) {
            if (used.has(b.element)) continue;
            const bet = playerIndex[b.element]?.element_type;
            const next = { ...formation };
            next[et]--; next[bet]++;
            if (next[2] >= min[2] && next[3] >= min[3] && next[4] >= min[4]) { p.element = b.element; used.add(b.element); break; }
          }
        }
      }

      let total = 0;
      for (const s of effective) {
        const base = projected[s.element]?.projected_total || 0;
        total += base * (s.multiplier || 0);
      }
      if (benchBoost) {
        for (const b of bench) total += (projected[b.element]?.projected_total || 0);
      }

      const avg = await getEventAverage(currentEventId);
      const diffVsAvg = total - avg;

      return {
        entry: m.entry,
        player_name: m.player_name,
        entry_name: m.entry_name,
        rank: m.rank,
        last_rank: m.last_rank,
        live_gw: round2(total),
        total: m.total - m.event_total + round2(total),
        diff_vs_avg: round2(diffVsAvg),
      };
    } catch (e) {
      return {
        entry: m.entry,
        player_name: m.player_name,
        entry_name: m.entry_name,
        rank: m.rank,
        last_rank: m.last_rank,
        live_gw: m.event_total,
        total: m.total,
        error: e.message || String(e),
      };
    }
  })));

  rows.sort((a,b) => b.total - a.total);
  rows.forEach((r, i) => r.live_rank = i + 1);

  return cors(json({ ok: true, league: first.league, mode: 'full', totalMembers: members.length, table: rows }), env);
}

// ------------------------
// Helpers
// ------------------------

async function getBootstrap() {
  const res = await fetch(`${FPL}/api/bootstrap-static/`, { headers: { 'user-agent': UA() } });
  const bootstrap = await res.json();
  const currentEvent = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next) || bootstrap.events[0];
  const fixturesRes = await fetch(`${FPL}/api/fixtures/?event=${currentEvent.id}`, { headers: { 'user-agent': UA() } });
  const fixtures = await fixturesRes.json();
  return { bootstrap, fixtures, currentEventId: currentEvent.id };
}

async function getEventAverage(eventId) {
  const { bootstrap } = await getBootstrap();
  const ev = bootstrap.events.find(e => e.id === Number(eventId));
  return Number(ev?.average_entry_score || 0);
}

function buildProjected(live, fixtures) {
  const provisionalBonus = computeProvisionalBonus(live.elements, fixtures);
  const projected = {};
  for (const el of live.elements) {
    const id = el.id;
    const stats = el.stats || {};
    const base = Number(stats.total_points || 0);
    const hasAwardedBonus = Number(stats.bonus || 0) > 0;
    const bonusAdd = hasAwardedBonus ? 0 : (provisionalBonus[id] || 0);
    projected[id] = {
      projected_total: base + bonusAdd,
      minutes: Number(stats.minutes || 0),
      goals_scored: Number(stats.goals_scored || 0),
      assists: Number(stats.assists || 0),
      clean_sheets: Number(stats.clean_sheets || 0),
      yellow_cards: Number(stats.yellow_cards || 0),
      red_cards: Number(stats.red_cards || 0),
      saves: Number(stats.saves || 0),
      bps: Number(stats.bps || 0)
    };
  }
  return projected;
}

function computeProvisionalBonus(liveElements, fixtures) {
  const byFixture = new Map();
  for (const el of liveElements) {
    const bps = Number(el.stats?.bps || 0);
    const stints = el.explain || [];
    for (const s of stints) {
      if (!s.fixture) continue;
      if (!byFixture.has(s.fixture)) byFixture.set(s.fixture, []);
      byFixture.get(s.fixture).push({ id: el.id, bps });
    }
  }

  const fixtureState = Object.fromEntries(fixtures.map(f => [f.id, { finished: !!(f.finished || f.finished_provisional) }]));
  const bonusByPlayer = {};
  for (const [fxId, players] of byFixture.entries()) {
    const finished = fixtureState[fxId]?.finished;
    if (finished) continue;

    players.sort((a,b) => b.bps - a.bps);
    const ranks = assignRanks(players.map(p => p.bps));

    for (let i = 0; i < players.length; i++) {
      const rank = ranks[i];
      let bonus = 0;
      if (rank === 1) bonus = 3;
      else if (rank === 2) bonus = 2;
      else if (rank === 3) bonus = 1;
      if (!bonusByPlayer[players[i].id]) bonusByPlayer[players[i].id] = 0;
      bonusByPlayer[players[i].id] = Math.max(bonusByPlayer[players[i].id], bonus);
    }
  }
  return bonusByPlayer;
}

function assignRanks(values) {
  const ranks = [];
  let rank = 0;
  let lastVal = null;
  let seen = 0;
  for (const v of values) {
    seen += 1;
    if (v !== lastVal) {
      rank = seen;
      lastVal = v;
    }
    ranks.push(rank);
  }
  return ranks.map(r => (r <= 1 ? 1 : r <= 2 ? 2 : r <= 3 ? 3 : 4));
}

function displayName(elId) { return `#${elId}`; }
function typeName(t) { return t === 1 ? 'GK' : t === 2 ? 'DEF' : t === 3 ? 'MID' : 'FWD'; }

function pickEventBadges(p) {
  const badges = [];
  if (!p) return badges;
  if (p.goals_scored) badges.push(`⚽ x${p.goals_scored}`);
  if (p.assists) badges.push(`🅰️ x${p.assists}`);
  if (p.clean_sheets) badges.push('🧼');
  if (p.saves) badges.push(`🧤 ${Math.floor(p.saves/3)}SP`);
  if (p.yellow_cards) badges.push('🟨');
  if (p.red_cards) badges.push('🟥');
  if (p.projected_bonus) badges.push(`⭐ +${p.projected_bonus}`);
  return badges;
}

function indexBy(arr, key) { const o = {}; for (const x of arr) o[x[key]] = x; return o; }
function round2(x) { return Math.round((Number(x)||0) * 100) / 100; }

function UA() { return 'Mozilla/5.0 (compatible; FPL-Live/1.0; +https://example.com)'; }

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA() } });
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${url}`);
  return res.json();
}

// Small cached fetch to avoid hammering the same picks repeatedly
async function fetchJSONCached(url, ttlSeconds = 60) {
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return await hit.json();

  const res = await fetch(url, { headers: { 'user-agent': UA() } });
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${url}`);
  const jsonData = await res.json();

  const copy = new Response(JSON.stringify(jsonData), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'Cache-Control': `public, s-maxage=${ttlSeconds}` }
  });
  await cache.put(key, copy.clone());
  return jsonData;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function cors(res, env) {
  const origin = env.ALLOWED_ORIGINS || '*';
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}

function cloneWithCORS(res) {
  const copy = new Response(res.body, res);
  copy.headers.set('Access-Control-Allow-Origin', '*');
  return copy;
}

function pLimit(concurrency) {
  const queue = [];
  let activeCount = 0;
  const next = () => { activeCount--; if (queue.length > 0) queue.shift()(); };
  const run = async (fn, resolve, args) => { activeCount++; try { resolve(await fn(...args)); } finally { next(); } };
  const enqueue = (fn, resolve, args) => { queue.push(() => run(fn, resolve, args)); (async () => { await Promise.resolve(); if (activeCount < concurrency && queue.length > 0) queue.shift()(); })(); };
  return (fn, ...args) => new Promise((resolve) => enqueue(fn, resolve, args));
}