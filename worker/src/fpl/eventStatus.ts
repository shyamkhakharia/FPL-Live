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
