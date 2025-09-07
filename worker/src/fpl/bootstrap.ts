import { endpoints, fetchJSON } from './fetch';
import { resolveCurrentEventId } from './eventStatus';

export async function getBootstrap(eventOverride: number | null = null) {
  const bootstrap = await fetchJSON(endpoints.bootstrap());
  const currentEventId = eventOverride ?? await resolveCurrentEventId(bootstrap);
  const fixtures = await fetchJSON(endpoints.fixturesFor(currentEventId));
  return { bootstrap, fixtures, currentEventId };
}
