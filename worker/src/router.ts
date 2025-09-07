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
