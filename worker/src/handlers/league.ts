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
