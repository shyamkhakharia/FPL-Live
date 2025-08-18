const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

export async function api(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const getBootstrap = () => api('/api/bootstrap');
export const getManager = (id) => api(`/api/manager/${id}`);
export const getLiveManager = (id, autosubs='on') => api(`/api/manager/${id}/live?autosubs=${autosubs}`);
export const getLeague = (id, mode='auto') => api(`/api/leagues/${id}?mode=${mode}`);
