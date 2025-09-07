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
