#!/usr/bin/env bash
set -euo pipefail

# FPL‑Live modular bootstrapper — COMPLETE
# Run from repo root:  bash scripts/setup_modular.sh
# This creates worker/ (Cloudflare Worker) and web/ (Vite + React + MUI)
# with all source files so both dev servers start immediately.

ROOT_DIR=$(pwd)
echo "Scaffolding FPL‑Live at: $ROOT_DIR"

mkdir -p scripts

# =====================================================================
# worker/
# =====================================================================
mkdir -p worker/src/{http,util,fpl,compute,handlers}

cat > worker/package.json <<'JSON'
{
  "name": "fpl-live-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.80.0",
    "typescript": "^5.5.4"
  }
}
JSON

cat > worker/wrangler.toml <<'TOML'
name = "fpl-live-worker"
main = "src/router.ts"
compatibility_date = "2024-09-01"

[vars]
ALLOWED_ORIGINS = "*"
TOML

# http helpers
cat > worker/src/http/response.ts <<'TS'
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function errorJson(err: unknown, status = 500): Response {
  const msg = typeof err === 'string' ? err : (err as any)?.stack || String(err);
  return json({ ok: false, error: msg }, status);
}
TS

cat > worker/src/http/cors.ts <<'TS'
export function withCORS(res: Response, env: any): Response {
  const h = new Headers(res.headers);
  const origin = env?.ALLOWED_ORIGINS || '*';
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(res.body, { status: res.status, headers: h });
}
TS

# utils
cat > worker/src/util/indexBy.ts <<'TS'
export function indexBy<T extends Record<string, any>>(arr: T[], key: keyof T): Record<string | number, T> {
  const out: Record<string | number, T> = {};
  for (const it of arr || []) out[String(it[key])] = it;
  return out;
}
TS

cat > worker/src/util/math.ts <<'TS'
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
TS

# FPL fetch + endpoints
cat > worker/src/fpl/fetch.ts <<'TS'
const FPL = 'https://fantasy.premierleague.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export async function fetchJSON<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

export const endpoints = {
  bootstrap: () => `${FPL}/api/bootstrap-static/`,
  fixturesFor: (eventId: number) => `${FPL}/api/fixtures/?event=${eventId}`,
  eventLive: (eventId: number) => `${FPL}/api/event/${eventId}/live/`,
  eventStatus: () => `${FPL}/api/event-status/`,
  entry: (entryId: string | number) => `${FPL}/api/entry/${entryId}/`,
  picks: (entryId: string | number, eventId: number) => `${FPL}/api/entry/${entryId}/event/${eventId}/picks/`,
  leagueClassic: (leagueId: string | number, page = 1) => `${FPL}/api/leagues-classic/${leagueId}/standings/?page_standings=${page}`
};
TS

cat > worker/src/fpl/eventStatus.ts <<'TS'
import { endpoints, fetchJSON } from './fetch';

export async function resolveCurrentEventId(bootstrap: any): Promise<number> {
  try {
    const s = await fetchJSON<any>(endpoints.eventStatus());
    const fromArray = Array.isArray(s.status) && s.status.length ? s.status[0]?.event : null;
    const fromField = typeof s.current_event === 'number' ? s.current_event : null;
    const id = fromArray ?? fromField;
    if (id) return id;
  } catch {}

  // Fallback by deadlines
  const now = Date.now();
  const eventsSorted = [...bootstrap.events].sort((a, b) => new Date(a.deadline_time).getTime() - new Date(b.deadline_time).getTime());
  let current = eventsSorted[0];
  for (let i = 0; i < eventsSorted.length; i++) {
    const ev = eventsSorted[i];
    const dl = new Date(ev.deadline_time).getTime();
    if (dl > now) { current = i > 0 ? eventsSorted[i - 1] : eventsSorted[0]; break; }
    if (i === eventsSorted.length - 1) current = ev;
  }
  return current.id;
}
TS

cat > worker/src/fpl/bootstrap.ts <<'TS'
import { endpoints, fetchJSON } from './fetch';
import { resolveCurrentEventId } from './eventStatus';

export async function getBootstrap(eventOverride: number | null = null) {
  const bootstrap = await fetchJSON(endpoints.bootstrap());
  const currentEventId = eventOverride ?? await resolveCurrentEventId(bootstrap);
  const fixtures = await fetchJSON(endpoints.fixturesFor(currentEventId));
  return { bootstrap, fixtures, currentEventId };
}
TS

# Compute
cat > worker/src/compute/projection.ts <<'TS'
export type Projected = Record<number, {
  minutes: number;
  projected_total: number;
  goals_scored?: number;
  assists?: number;
  clean_sheets?: number;
  goals_conceded?: number;
  saves?: number;
  bonus?: number;
  bps?: number;
  yellow_cards?: number;
  red_cards?: number;
  penalties_missed?: number;
  penalties_saved?: number;
}>;

export function buildProjected(live: any): Projected {
  const map: Projected = {};
  for (const el of live.elements || []) {
    const s = el.stats || {};
    map[el.id] = {
      minutes: s.minutes || 0,
      projected_total: typeof s.total_points === 'number' ? s.total_points : 0,
      goals_scored: s.goals_scored || 0,
      assists: s.assists || 0,
      clean_sheets: s.clean_sheets || 0,
      goals_conceded: s.goals_conceded || 0,
      saves: s.saves || 0,
      bonus: s.bonus || 0,
      bps: s.bps || 0,
      yellow_cards: s.yellow_cards || 0,
      red_cards: s.red_cards || 0,
      penalties_missed: s.penalties_missed || 0,
      penalties_saved: s.penalties_saved || 0,
    };
  }
  return map;
}

export function pickEventBadges(p: any = {}): string[] {
  const out: string[] = [];
  if (p.goals_scored) out.push(`⚽ x${p.goals_scored}`);
  if (p.assists) out.push(`🅰️ x${p.assists}`);
  if (p.clean_sheets) out.push('🧼 CS');
  if (p.saves >= 3) out.push(`🧤 ${Math.floor(p.saves / 3)}SP`);
  if (p.bonus) out.push(`⭐ +${p.bonus}`);
  if (p.yellow_cards) out.push('🟨');
  if (p.red_cards) out.push('🟥');
  if (p.penalties_missed) out.push('❌ PK');
  if (p.penalties_saved) out.push('🧤 PKS');
  return out;
}
TS

cat > worker/src/compute/autosubs.ts <<'TS'
export function applyAutosubs(
  starters: any[],
  bench: any[],
  playersById: any,
  formationGuard: boolean,
  surelyAbsent: (elId: number) => boolean
) {
  const usedBench = new Set<number>();
  const effective = starters.map(s => ({ ...s }));
  if (!formationGuard) return { effective, usedBench };

  // GK first
  const startGK = effective.find(p => playersById[p.element]?.element_type === 1);
  if (startGK && surelyAbsent(startGK.element)) {
    const benchGK = bench.find(p => playersById[p.element]?.element_type === 1);
    if (benchGK) { usedBench.add(benchGK.element); startGK.element = benchGK.element; }
  }

  // Outfield (3-2-1)
  const outfieldBench = bench.filter(p => playersById[p.element]?.element_type !== 1);
  const min = { DEF: 3, MID: 2, FWD: 1 } as const;
  const countFormation = () => {
    const c = { DEF:0, MID:0, FWD:0 } as Record<'DEF'|'MID'|'FWD', number>;
    for (const p of effective) {
      const et = playersById[p.element]?.element_type;
      if (et === 2) c.DEF++; else if (et === 3) c.MID++; else if (et === 4) c.FWD++;
    }
    return c;
  };

  for (const p of effective) {
    const et = playersById[p.element]?.element_type;
    if (et === 1 || !surelyAbsent(p.element)) continue;
    const formation = countFormation();
    for (const b of outfieldBench) {
      if (usedBench.has(b.element)) continue;
      const bet = playersById[b.element]?.element_type;
      const oldRole = et === 2 ? 'DEF' : et === 3 ? 'MID' : 'FWD';
      const newRole = bet === 2 ? 'DEF' : bet === 3 ? 'MID' : 'FWD';
      const next = { ...formation }; next[oldRole]--; next[newRole]++;
      if (next.DEF >= min.DEF && next.MID >= min.MID && next.FWD >= min.FWD) {
        usedBench.add(b.element); p.element = b.element; break;
      }
    }
  }

  return { effective, usedBench };
}
TS

cat > worker/src/compute/playState.ts <<'TS'
export function makePlayStateBuilder(fixtures: any[], playersById: any) {
  const teamFinished = (teamId: number) => {
    for (const f of fixtures) {
      if (f.team_h === teamId || f.team_a === teamId) {
        if (!(f.finished || f.finished_provisional)) return false;
      }
    }
    return true;
  };

  return function playStateFor(elId: number, minutes: number) {
    const teamId = playersById[elId]?.team;
    const finishedAll = teamFinished(teamId);
    const teamFixtures = fixtures.filter(f => f.team_h === teamId || f.team_a === teamId);
    const finishedCount = teamFixtures.filter(f => f.finished || f.finished_provisional).length;
    const maxRegMinutes = finishedCount * 90;

    let status: 'unused'|'subbed_off'|'played_full'|'not_started'|'playing_or_off_unk';
    if (finishedAll) {
      if (minutes === 0) status = 'unused';
      else if (minutes < maxRegMinutes) status = 'subbed_off';
      else status = 'played_full';
    } else {
      status = minutes === 0 ? 'not_started' : 'playing_or_off_unk';
    }

    return { minutes, team_finished: finishedAll, status };
  }
}
TS

# Handlers
cat > worker/src/handlers/manager.ts <<'TS'
import { getBootstrap } from '../fpl/bootstrap';
import { endpoints, fetchJSON } from '../fpl/fetch';
import { json } from '../http/response';

export async function managerHandler(entryId: string, params: Record<string, string>) {
  const eventOverride = params.event ? Number(params.event) : null;
  const { bootstrap, fixtures, currentEventId } = await getBootstrap(eventOverride);

  const [entry, picks] = await Promise.all([
    fetchJSON(endpoints.entry(entryId)),
    fetchJSON(endpoints.picks(entryId, currentEventId))
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

  return json({ ok: true, summary, picks, leagues, currentEventId });
}
TS

cat > worker/src/handlers/liveManager.ts <<'TS'
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
TS

cat > worker/src/handlers/league.ts <<'TS'
import { endpoints, fetchJSON } from '../fpl/fetch';
import { json } from '../http/response';

export async function leagueHandler(leagueId: string, params: Record<string, string>) {
  const page = Number(params.page || 1);
  const res = await fetchJSON(endpoints.leagueClassic(leagueId, page));
  const members = res.standings?.results || [];
  const table = members.map((m: any) => ({
    entry: m.entry,
    player_name: m.player_name,
    entry_name: m.entry_name,
    rank: m.rank,
    last_rank: m.last_rank,
    live_gw: m.event_total,
    total: m.total
  }));
  return json({ ok: true, league: res.league, totalMembers: res.standings?.total || table.length, mode: 'fast', table });
}
TS

cat > worker/src/router.ts <<'TS'
import { withCORS } from './http/cors';
import { json, errorJson } from './http/response';
import { getBootstrap } from './fpl/bootstrap';
import { managerHandler } from './handlers/manager';
import { liveManagerHandler } from './handlers/liveManager';
import { leagueHandler } from './handlers/league';

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/' || url.pathname === '/api/health') {
        return withCORS(json({ ok: true, service: 'fpl-live-worker' }), env);
      }

      if (url.pathname === '/api/bootstrap') {
        const eventParam = url.searchParams.get('event');
        const data = await getBootstrap(eventParam ? Number(eventParam) : null);
        return withCORS(json({ ok: true, ...data }), env);
      }

      if (url.pathname.startsWith('/api/manager/')) {
        const parts = url.pathname.split('/');
        const entryId = parts[3];
        const sub = parts[4] || '';
        const params = Object.fromEntries(url.searchParams.entries());
        if (!entryId) return withCORS(json({ ok: false, error: 'Missing entryId' }, 400), env);
        if (sub === 'live') return withCORS(await liveManagerHandler(entryId, params), env);
        return withCORS(await managerHandler(entryId, params), env);
      }

      if (url.pathname.startsWith('/api/leagues/')) {
        const parts = url.pathname.split('/');
        const leagueId = parts[3];
        const params = Object.fromEntries(url.searchParams.entries());
        return withCORS(await leagueHandler(leagueId, params), env);
      }

      return withCORS(json({ ok: false, error: 'Not found' }, 404), env);
    } catch (err) {
      return withCORS(errorJson(err), env);
    }
  }
};
TS

# =====================================================================
# web/
# =====================================================================
mkdir -p web/src/{api,components/{layout,cards,pitch,leagues}}

cat > web/package.json <<'JSON'
{
  "name": "fpl-live-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@emotion/react": "^11.11.4",
    "@emotion/styled": "^11.11.5",
    "@mui/icons-material": "^5.15.20",
    "@mui/material": "^5.15.20",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.2"
  }
}
JSON

cat > web/vite.config.ts <<'TS'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
})
TS

cat > web/tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
JSON

cat > web/index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FPL‑Live</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
HTML

cat > web/src/main.tsx <<'TSX'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './theme'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
TSX

cat > web/src/theme.ts <<'TS'
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#10b981' },
    secondary: { main: '#60a5fa' },
    error: { main: '#ef4444' },
    warning: { main: '#f59e0b' },
    success: { main: '#22c55e' }
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
    h4: { fontWeight: 700 }
  }
})
TS

cat > web/src/api/client.ts <<'TS'
const API_BASE = import.meta.env.VITE_API_BASE || ''

async function get(path: string) {
  const r = await fetch(`${API_BASE}${path}`)
  if (!r.ok) throw new Error(`${path} -> ${r.status}`)
  return r.json()
}

export const api = {
  bootstrap: () => get('/api/bootstrap'),
  manager: (id: string, event?: number) => get(`/api/manager/${id}${event?`?event=${event}`:''}`),
  live: (id: string, autosubs = 'on', event?: number) => get(`/api/manager/${id}/live?autosubs=${autosubs}${event?`&event=${event}`:''}`),
  league: (id: string, page = 1) => get(`/api/leagues/${id}?page=${page}`)
}
TS

# Components
cat > web/src/components/layout/AppShell.tsx <<'TSX'
import { AppBar, Box, Container, Toolbar, Typography } from '@mui/material'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>FPL‑Live</Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  )
}
TSX

cat > web/src/components/cards/SummaryCards.tsx <<'TSX'
import { Card, CardContent, Grid, Typography } from '@mui/material'

export default function SummaryCards({ summary, live }: any) {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Card variant="outlined"><CardContent>
          <Typography variant="overline">Live GW</Typography>
          <Typography variant="h4">{live?.totals?.overall ?? '—'}</Typography>
        </CardContent></Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <Card variant="outlined"><CardContent>
          <Typography variant="overline">Overall Rank</Typography>
          <Typography variant="h5">{summary?.overall_rank ?? '—'}</Typography>
        </CardContent></Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <Card variant="outlined"><CardContent>
          <Typography variant="overline">Live vs Avg</Typography>
          <Typography variant="h5">{live?.diff_vs_average ?? '—'}</Typography>
        </CardContent></Card>
      </Grid>
    </Grid>
  )
}
TSX

cat > web/src/components/pitch/PlayerStatusBadge.tsx <<'TSX'
import { Chip } from '@mui/material'

export default function PlayerStatusBadge({ ps, onBench }: { ps:any, onBench?:boolean }) {
  if (!ps) return null
  const m = ps.minutes ?? 0
  let label = m > 0 ? `⏱ ${m}’` : 'DNP'
  if (ps.team_finished) {
    if (ps.status === 'subbed_off') label += ' • OFF'
    if (ps.status === 'played_full') label += ' • FT'
    if (ps.status === 'unused') label = 'Unused'
  }
  if (onBench && m > 0) label += ' • ⬆'
  return <Chip size="small" label={label} variant="outlined" sx={{ borderColor: 'divider' }} />
}
TSX

cat > web/src/components/pitch/PlayerCard.tsx <<'TSX'
import { Card, CardContent, Stack, Typography } from '@mui/material'
import PlayerStatusBadge from './PlayerStatusBadge'

export default function PlayerCard({ slot }: { slot:any }) {
  const { name, team_short, type, total, projected_points, is_captain, is_vice_captain, multiplier, events = [], on_bench, play_state } = slot
  const points = typeof total === 'number' ? total : (projected_points ?? 0)
  const dim = play_state?.status === 'subbed_off'
  const ribbon = is_captain ? (multiplier === 3 ? 'TC' : 'C') : (is_vice_captain ? 'VC' : null)

  return (
    <Card variant="outlined" sx={{ opacity: dim ? 0.7 : 1, position: 'relative' }}>
      {ribbon && (
        <Typography variant="caption" sx={{ position: 'absolute', right: 8, top: 8, bgcolor: 'secondary.main', color: 'white', px: 0.8, py: 0.2, borderRadius: 1 }}>{ribbon}</Typography>
      )}
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
          <Stack sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>{name || '—'}</Typography>
            <Typography variant="caption" color="text.secondary">{team_short || '—'} · {type || '—'}</Typography>
          </Stack>
          <Typography variant="h6">{points}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
          <PlayerStatusBadge ps={play_state} onBench={on_bench} />
          {events.map((e:string, i:number) => (
            <Typography key={i} variant="caption" sx={{ border: 1, borderColor: 'divider', px: 0.8, py: 0.2, borderRadius: 1 }}>{e}</Typography>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>x{multiplier || 0} = {points} pts</Typography>
      </CardContent>
    </Card>
  )
}
TSX

cat > web/src/components/pitch/Pitch.tsx <<'TSX'
import { Box, Grid, Typography } from '@mui/material'
import PlayerCard from './PlayerCard'

export default function Pitch({ team = [] as any[] }) {
  const starters = team.filter(p => !p.on_bench)
  const bench = team.filter(p => p.on_bench)
  const rows = {
    GK: starters.filter(p => p.type === 'GK'),
    DEF: starters.filter(p => p.type === 'DEF'),
    MID: starters.filter(p => p.type === 'MID'),
    FWD: starters.filter(p => p.type === 'FWD')
  }

  return (
    <Box>
      {(['GK','DEF','MID','FWD'] as const).map(line => (
        <Grid key={line} container spacing={2} justifyContent="center" sx={{ mb: 1 }}>
          {rows[line].map((p:any) => (
            <Grid key={p.element} item xs={12} sm={6} md={3} lg={3}><PlayerCard slot={p} /></Grid>
          ))}
        </Grid>
      ))}

      <Typography variant="overline" color="text.secondary">Bench</Typography>
      <Grid container spacing={2}>
        {bench.map((p:any) => (
          <Grid key={`b-${p.element}`} item xs={12} sm={6} md={3} lg={3}><PlayerCard slot={p} /></Grid>
        ))}
      </Grid>
    </Box>
  )
}
TSX

cat > web/src/components/leagues/LeagueSidebar.tsx <<'TSX'
import { List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material'

export default function LeagueSidebar({ leagues = [], selectedId, onSelect }: any) {
  return (
    <Paper variant="outlined" sx={{ p: 1 }}>
      <Typography variant="overline">Leagues</Typography>
      <List dense>
        {leagues.map((l:any) => (
          <ListItemButton key={l.id} selected={selectedId === l.id} onClick={() => onSelect(l.id)}>
            <ListItemText primary={l.name} secondary={`Members ${l.entry_count ?? ''}`} />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  )
}
TSX

cat > web/src/components/leagues/LeagueTable.tsx <<'TSX'
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

export default function LeagueTable({ table = [], loading, mode }: any) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Rank</TableCell>
            <TableCell>Manager</TableCell>
            <TableCell>Team</TableCell>
            <TableCell align="right">GW</TableCell>
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {table.map((r:any) => (
            <TableRow key={r.entry} hover>
              <TableCell>{r.rank}</TableCell>
              <TableCell>{r.player_name}</TableCell>
              <TableCell>{r.entry_name}</TableCell>
              <TableCell align="right">{r.live_gw}</TableCell>
              <TableCell align="right">{r.total}</TableCell>
            </TableRow>
          ))}
          {!table.length && (
            <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">{loading? 'Loading…' : 'No data'}</Typography></TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
TSX

# App
cat > web/src/App.tsx <<'TSX'
import { useEffect, useState } from 'react'
import { Grid, Paper, Stack, TextField, Button, ToggleButton, ToggleButtonGroup, Tabs, Tab, Box } from '@mui/material'
import AppShell from './components/layout/AppShell'
import { api } from './api/client'
import SummaryCards from './components/cards/SummaryCards'
import Pitch from './components/pitch/Pitch'
import LeagueSidebar from './components/leagues/LeagueSidebar'
import LeagueTable from './components/leagues/LeagueTable'

export default function App() {
  const [managerId, setManagerId] = useState(localStorage.getItem('managerId') || '')
  const [inputId, setInputId] = useState(managerId)
  const [autosubs, setAutosubs] = useState(localStorage.getItem('autosubs') || 'on')
  const [tab, setTab] = useState<'team'|'leagues'>('team')

  const [summary, setSummary] = useState<any>(null)
  const [live, setLive] = useState<any>(null)
  const [leagues, setLeagues] = useState<any[]>([])
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null)
  const [leagueData, setLeagueData] = useState<any>(null)
  const [leagueLoading, setLeagueLoading] = useState(false)

  async function loadManager(id: string) {
    const base = await api.manager(id)
    setSummary(base.summary)
    setLeagues(base.leagues?.classic || [])
    const l = await api.live(id, autosubs)
    setLive(l)
  }

  async function refreshLive() {
    if (!managerId) return
    try { setLive(await api.live(managerId, autosubs)) } catch {}
  }

  useEffect(() => { if (managerId) loadManager(managerId) }, [])
  useEffect(() => { const t = setInterval(refreshLive, 30000); return () => clearInterval(t) }, [managerId, autosubs])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputId) return
    localStorage.setItem('managerId', inputId)
    setManagerId(inputId)
    await loadManager(inputId)
  }

  async function loadLeague(lid: string) {
    setSelectedLeague(lid)
    setLeagueLoading(true)
    try { setLeagueData(await api.league(lid)) } finally { setLeagueLoading(false) }
  }

  return (
    <AppShell>
      <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ xs:'stretch', sm:'center' }} sx={{ mb: 2 }}>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
          <TextField size="small" label="FPL Manager ID" value={inputId} onChange={e=>setInputId(e.target.value)} />
          <Button variant="contained" type="submit" disabled={!inputId}>{summary? 'Reload' : 'Load'}</Button>
        </form>
        <ToggleButtonGroup size="small" exclusive value={autosubs} onChange={(_,v)=>{ if(!v) return; setAutosubs(v); localStorage.setItem('autosubs', v); refreshLive() }}>
          <ToggleButton value="on">Autosubs On</ToggleButton>
          <ToggleButton value="off">Autosubs Off</ToggleButton>
        </ToggleButtonGroup>
        <Tabs value={tab} onChange={(_,v)=>setTab(v)} sx={{ ml: 'auto' }}>
          <Tab label="My Team" value="team" />
          <Tab label="Leagues" value="leagues" />
        </Tabs>
      </Stack>

      {tab === 'team' && (
        <Stack spacing={2}>
          <SummaryCards summary={summary} live={live} />
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Pitch team={live?.team || []} />
          </Paper>
        </Stack>
      )}

      {tab === 'leagues' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <LeagueSidebar leagues={leagues} selectedId={selectedLeague} onSelect={loadLeague} />
          </Grid>
          <Grid item xs={12} md={8}>
            <Box sx={{ mb: 1, fontSize: 12, color: 'text.secondary' }}>Members: {leagueData?.totalMembers ?? '—'}</Box>
            <LeagueTable table={leagueData?.table} loading={leagueLoading} mode={leagueData?.mode} />
          </Grid>
        </Grid>
      )}
    </AppShell>
  )
}
TSX

# .env to point UI to worker during dev
cat > web/.env <<'ENV'
VITE_API_BASE=http://127.0.0.1:8787
ENV

# =====================================================================
# Wrap up
# =====================================================================

echo ""
echo "✅ Done. Next steps:"
echo "1) cd worker && npm i && npm run dev"
echo "2) In a new terminal: cd web && npm i && npm run dev"
echo "3) Open http://localhost:5173 (Vite) — UI should talk to http://127.0.0.1:8787"
