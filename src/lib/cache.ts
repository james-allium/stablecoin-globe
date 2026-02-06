const inflight = new Map<string, Promise<unknown>>();

/**
 * Cloudflare Cache API — persists across all Worker isolates in the same colo.
 * Uses the actual request URL as cache key so identical client requests hit cache.
 * Falls back gracefully on local dev where caches.default doesn't exist.
 */
async function getCfCache(): Promise<Cache | null> {
  try {
    return (caches as unknown as { default: Cache }).default ?? null;
  } catch {
    return null;
  }
}

/**
 * Try to serve a response from the CF edge cache for the given request URL.
 * Returns the cached JSON data, or null on miss.
 */
export async function cfCacheMatch(url: string): Promise<unknown | null> {
  const cache = await getCfCache();
  if (!cache) return null;
  try {
    const res = await cache.match(new Request(url));
    if (!res) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Store JSON data in the CF edge cache keyed by request URL.
 */
export async function cfCachePut(url: string, data: unknown, ttlSec: number): Promise<void> {
  const cache = await getCfCache();
  if (!cache) return;
  try {
    const res = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttlSec}`,
      },
    });
    await cache.put(new Request(url), res);
  } catch {
    // Ignore — local dev doesn't have CF Cache API
  }
}

/**
 * Deduplicated fetch within the same isolate.
 * Prevents concurrent requests from triggering duplicate Allium queries.
 */
export async function dedup<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    console.log(`[cache] Dedup hit for ${key}`);
    return existing as Promise<T>;
  }

  console.log(`[cache] Starting fetch for ${key}`);
  const promise = fetcher().then((result) => {
    inflight.delete(key);
    return result;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

export function cacheKey(queryId: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${queryId}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

/**
 * Snap a timestamp string to the nearest hour boundary (floor).
 * "2025-01-07 14:32:15" → "2025-01-07 14:00:00"
 */
export function snapToHour(dateStr: string): string {
  return dateStr.slice(0, 13) + ":00:00";
}

/**
 * Determine an appropriate cache TTL based on the date range span.
 * Larger ranges change less frequently and can be cached longer.
 */
export function ttlForRange(startDate: string, endDate: string): number {
  const startMs = new Date(startDate.replace(" ", "T") + "Z").getTime();
  const endMs = new Date(endDate.replace(" ", "T") + "Z").getTime();
  const spanHours = (endMs - startMs) / (3600 * 1000);

  if (spanHours >= 7 * 24) return 6 * 60 * 60 * 1000;  // 7d+: cache 6 hours
  if (spanHours >= 24) return 2 * 60 * 60 * 1000;       // 24h+: cache 2 hours
  return 1 * 60 * 60 * 1000;                             // <24h: cache 1 hour
}
