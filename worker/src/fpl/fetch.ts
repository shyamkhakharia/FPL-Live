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
