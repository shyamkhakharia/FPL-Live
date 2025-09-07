export function withCORS(res: Response, env: any): Response {
  const h = new Headers(res.headers);
  const origin = env?.ALLOWED_ORIGINS || '*';
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(res.body, { status: res.status, headers: h });
}
