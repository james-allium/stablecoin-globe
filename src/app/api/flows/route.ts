import { NextRequest, NextResponse } from "next/server";
import { runQueryAndWait } from "@/lib/allium";
import { cfCacheMatch, cfCachePut, dedup, cacheKey, snapToHour, ttlForRange } from "@/lib/cache";

export const dynamic = "force-dynamic";

const FLOWS_QUERY_ID = "Gfa6Z0NU15RsYA4Hp3vB";

export async function GET(request: NextRequest) {
  const apiKey = process.env.ALLIUM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ALLIUM_API_KEY" },
      { status: 500 }
    );
  }

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  // Default to last 24 hours snapped to hour boundary
  const now = new Date();
  const endSnapped = new Date(Math.floor(now.getTime() / (3600 * 1000)) * 3600 * 1000);
  const startSnapped = new Date(endSnapped.getTime() - 24 * 3600 * 1000);

  const defaultEnd = endSnapped.toISOString().replace("T", " ").slice(0, 19);
  const defaultStart = startSnapped.toISOString().replace("T", " ").slice(0, 19);

  const params = {
    start_date: snapToHour(startDate || defaultStart),
    end_date: snapToHour(endDate || defaultEnd),
  };

  // Build a canonical cache URL from snapped params (ensures stable key)
  const cacheUrl = `https://cache.internal/api/flows?start_date=${params.start_date}&end_date=${params.end_date}`;

  // 1. Check CF edge cache
  const cached = await cfCacheMatch(cacheUrl);
  if (cached) {
    console.log(`[flows] CF cache hit`);
    return NextResponse.json(cached);
  }

  // 2. Dedup + fetch
  const key = cacheKey(FLOWS_QUERY_ID, params);
  const ttl = ttlForRange(params.start_date, params.end_date);
  const ttlSec = Math.round(ttl / 1000);

  try {
    const result = await dedup(key, () =>
      runQueryAndWait(FLOWS_QUERY_ID, apiKey, 300000, params)
    );

    // 3. Store in CF edge cache
    await cfCachePut(cacheUrl, result, ttlSec);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": `public, s-maxage=${ttlSec}, stale-while-revalidate=${ttlSec * 2}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
