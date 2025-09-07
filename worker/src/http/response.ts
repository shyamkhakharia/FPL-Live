export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function errorJson(err: unknown, status = 500): Response {
  const msg = typeof err === 'string' ? err : (err as any)?.stack || String(err);
  return json({ ok: false, error: msg }, status);
}
