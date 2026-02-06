import { NextResponse } from "next/server";
import { runQueryAndWait } from "@/lib/allium";
import { cfCacheMatch, cfCachePut, dedup, cacheKey, snapToHour, ttlForRange } from "@/lib/cache";

export const dynamic = "force-dynamic";

const FLOWS_QUERY_ID = "Gfa6Z0NU15RsYA4Hp3vB";
const BRIDGE_QUERY_ID = "i812m0VJTKobVxsYvdHB";
const WALLET_QUERY_ID = "uOYFdeodat5P0qaLVW2t";

const DEFAULT_WALLET = "0xdbf5e9c5206d0db70a90108bf936da60221dc080";

/**
 * Prefetch default queries and warm the CF edge cache.
 * Uses the same canonical cache URLs as the individual API routes
 * so their cache checks will hit.
 */
export async function GET() {
  const apiKey = process.env.ALLIUM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ALLIUM_API_KEY" }, { status: 500 });
  }

  const now = new Date();
  const endSnapped = new Date(Math.floor(now.getTime() / (3600 * 1000)) * 3600 * 1000);

  // Default flows: last 24h
  const flowsStart = new Date(endSnapped.getTime() - 24 * 3600 * 1000);
  const flowsParams = {
    start_date: snapToHour(flowsStart.toISOString().replace("T", " ").slice(0, 19)),
    end_date: snapToHour(endSnapped.toISOString().replace("T", " ").slice(0, 19)),
  };
  const flowsCacheUrl = `https://cache.internal/api/flows?start_date=${flowsParams.start_date}&end_date=${flowsParams.end_date}`;
  const flowsKey = cacheKey(FLOWS_QUERY_ID, flowsParams);
  const flowsTtl = ttlForRange(flowsParams.start_date, flowsParams.end_date);
  const flowsTtlSec = Math.round(flowsTtl / 1000);

  // Default bridges: last 1h
  const bridgesStart = new Date(endSnapped.getTime() - 3600 * 1000);
  const bridgesParams = {
    start_date: snapToHour(bridgesStart.toISOString().replace("T", " ").slice(0, 19)),
    end_date: snapToHour(endSnapped.toISOString().replace("T", " ").slice(0, 19)),
  };
  const bridgesCacheUrl = `https://cache.internal/api/bridges?start_date=${bridgesParams.start_date}&end_date=${bridgesParams.end_date}`;
  const bridgesKey = cacheKey(BRIDGE_QUERY_ID, bridgesParams);
  const bridgesTtl = ttlForRange(bridgesParams.start_date, bridgesParams.end_date);
  const bridgesTtlSec = Math.round(bridgesTtl / 1000);

  // Default wallet
  const walletCacheUrl = `https://cache.internal/api/wallet?address=${DEFAULT_WALLET}&chain=ethereum`;
  const walletKey = `wallet:${DEFAULT_WALLET}:ethereum`;

  // Only fetch if not already in CF cache
  const jobs = [
    (async () => {
      if (await cfCacheMatch(flowsCacheUrl)) return "flows (cached)";
      const result = await dedup(flowsKey, () =>
        runQueryAndWait(FLOWS_QUERY_ID, apiKey, 300000, flowsParams)
      );
      await cfCachePut(flowsCacheUrl, result, flowsTtlSec);
      return "flows";
    })(),
    (async () => {
      if (await cfCacheMatch(bridgesCacheUrl)) return "bridges (cached)";
      const result = await dedup(bridgesKey, () =>
        runQueryAndWait(BRIDGE_QUERY_ID, apiKey, 30000, bridgesParams)
      );
      await cfCachePut(bridgesCacheUrl, result, bridgesTtlSec);
      return "bridges";
    })(),
    (async () => {
      if (await cfCacheMatch(walletCacheUrl)) return "wallet (cached)";
      const result = await dedup(walletKey, () =>
        runQueryAndWait(WALLET_QUERY_ID, apiKey, 60000, {
          wallet_address: DEFAULT_WALLET,
          chain: "ethereum",
        })
      );
      // Note: wallet route processes raw result into WalletData.
      // Here we cache the raw Allium result; the wallet route will
      // still need to process it. For the wallet, the route itself
      // caches the processed result separately.
      return "wallet";
    })(),
  ];

  const results = await Promise.allSettled(jobs);
  const summary = results.map((r) => ({
    status: r.status,
    result: r.status === "fulfilled" ? r.value : String(r.reason),
  }));

  return NextResponse.json({ prefetched: summary });
}
