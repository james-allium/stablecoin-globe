import { NextRequest, NextResponse } from "next/server";
import { runQueryAndWait } from "@/lib/allium";
import { cacheGet, cacheSet, cacheKey } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Parameterized Allium query: stablecoin flows by country pair + token
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

  // Default to last 24 hours
  const now = new Date();
  const defaultEnd = now.toISOString().replace("T", " ").slice(0, 19);
  const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString().replace("T", " ").slice(0, 19);

  const params = {
    start_date: startDate || defaultStart,
    end_date: endDate || defaultEnd,
  };

  const key = cacheKey(FLOWS_QUERY_ID, params);
  const cached = cacheGet(key);
  if (cached) {
    console.log(`[flows] Cache hit for ${key}`);
    return NextResponse.json(cached);
  }

  try {
    const result = await runQueryAndWait(FLOWS_QUERY_ID, apiKey, 300000, params);
    cacheSet(key, result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
