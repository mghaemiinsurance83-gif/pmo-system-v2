// Lightweight API client with Persian-friendliness and caching.
const cache = new Map<string, { data: any; ts: number }>();
const TTL = 30_000;

export async function apiFetch<T = any>(path: string, opts?: { force?: boolean }): Promise<T> {
  const cached = cache.get(path);
  const now = Date.now();
  if (!opts?.force && cached && now - cached.ts < TTL) {
    return cached.data as T;
  }
  const res = await fetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} → ${res.status}: ${text.slice(0, 120)}`);
  }
  const data = (await res.json()) as T;
  cache.set(path, { data, ts: now });
  return data;
}

export function invalidate(path?: string) {
  if (path) cache.delete(path);
  else cache.clear();
}
