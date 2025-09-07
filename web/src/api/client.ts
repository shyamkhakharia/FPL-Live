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
