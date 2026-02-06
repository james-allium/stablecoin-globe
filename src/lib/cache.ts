const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const store = new Map<string, CacheEntry>();

export function cacheGet(key: string): unknown | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet(key: string, data: unknown): void {
  store.set(key, { data, timestamp: Date.now() });
}

export function cacheKey(queryId: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${queryId}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}
