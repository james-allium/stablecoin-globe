import { NextRequest, NextResponse } from "next/server";
import { runQueryAndWait } from "@/lib/allium";
import { cfCacheMatch, cfCachePut, dedup } from "@/lib/cache";
import type {
  EntityLabel,
  EnrichedCounterparty,
  WalletData,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// Pre-saved Allium query: joins wallet transactions with entity labels
// Parameters: {{wallet_address}}, {{chain}}
const WALLET_QUERY_ID = "uOYFdeodat5P0qaLVW2t";

export async function GET(request: NextRequest) {
  const apiKey = process.env.ALLIUM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ALLIUM_API_KEY" }, { status: 500 });
  }

  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address");
  const chain = searchParams.get("chain") || "ethereum";

  if (!address) {
    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  }

  const cacheUrl = `https://cache.internal/api/wallet?address=${address.toLowerCase()}&chain=${chain}`;

  // Check CF edge cache for the fully processed response
  const cached = await cfCacheMatch(cacheUrl);
  if (cached) {
    console.log(`[wallet] CF cache hit`);
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  }

  try {
    console.log(`[wallet] Querying labeled counterparties for ${address} on ${chain}...`);
    const walletKey = `wallet:${address.toLowerCase()}:${chain}`;
    const result = await dedup(walletKey, () =>
      runQueryAndWait(WALLET_QUERY_ID, apiKey, 60000, {
        wallet_address: address.toLowerCase(),
        chain,
      })
    );

    const rows = result?.data || result || [];
    console.log(`[wallet] Got ${Array.isArray(rows) ? rows.length : 0} rows`);

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({
        address,
        chain,
        transactions: [],
        counterparties: [],
      });
    }

    // Aggregate rows into counterparties (same address may appear as both sent/received)
    const cpMap = new Map<
      string,
      {
        entity: EntityLabel;
        sent: number;
        received: number;
        tokens: Set<string>;
        firstSeen: string | undefined;
      }
    >();

    for (const row of rows) {
      const addr = (row.COUNTERPARTY_ADDRESS || row.counterparty_address || "").toLowerCase();
      const direction = row.DIRECTION || row.direction || "";
      const txCount = Number(row.TX_COUNT || row.tx_count || 0);
      const category = row.CATEGORY || row.category || "unknown";
      const project = row.PROJECT || row.project || "";
      const name = row.NAME || row.name || "";
      const firstSeen = row.FIRST_SEEN || row.first_seen || undefined;

      // Skip self-references
      if (addr === address.toLowerCase()) continue;

      const existing = cpMap.get(addr) || {
        entity: { chain, address: addr, category, project, name },
        sent: 0,
        received: 0,
        tokens: new Set<string>(),
        firstSeen: undefined as string | undefined,
      };

      if (direction === "sent") {
        existing.sent += txCount;
      } else {
        existing.received += txCount;
      }
      existing.tokens.add(category);

      // Track earliest firstSeen across sent/received rows for the same address
      if (firstSeen && (!existing.firstSeen || firstSeen < existing.firstSeen)) {
        existing.firstSeen = firstSeen;
      }

      cpMap.set(addr, existing);
    }

    const counterparties: EnrichedCounterparty[] = Array.from(cpMap.entries())
      .map(([addr, data]) => ({
        address: addr,
        chain,
        entity: data.entity,
        totalSent: data.sent,
        totalReceived: data.received,
        transferCount: data.sent + data.received,
        tokens: Array.from(data.tokens),
        firstSeen: data.firstSeen,
      }))
      .sort((a, b) => b.transferCount - a.transferCount);

    console.log(`[wallet] Returning ${counterparties.length} labeled counterparties`);

    const response: WalletData = {
      address,
      chain,
      transactions: [],
      counterparties,
    };

    await cfCachePut(cacheUrl, response, 3600);

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[wallet] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
