export function indexBy<T extends Record<string, any>>(arr: T[], key: keyof T): Record<string | number, T> {
  const out: Record<string | number, T> = {};
  for (const it of arr || []) out[String(it[key])] = it;
  return out;
}
