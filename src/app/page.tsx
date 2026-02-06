"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import { COUNTRY_COORDS } from "@/lib/countries";
import { CHAIN_COORDS } from "@/lib/chains";
import { resolveCounterpartyPosition, CATEGORY_COLORS } from "@/lib/entities";
import type { ArcData, StablecoinFlow, WalletData } from "@/lib/types";

const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

const TOKEN_COLORS: Record<string, string> = {
  USDC: "#7a8fa3",
  USDT: "#7a9e8f",
  DAI: "#b89e6e",
  BUSD: "#b8a36e",
  PYUSD: "#8393a8",
  RLUSD: "#c5bfb5",
  XUSD: "#9a8aad",
  USDS: "#8a8aad",
  USDe: "#8a9e8f",
  WETH: "#627EEA",
  WBTC: "#F7931A",
  ETH: "#627EEA",
};

export interface DateRange {
  startDate: string; // ISO timestamp string e.g. "2025-01-01 00:00:00"
  endDate: string;
}

function flowsToArcs(flows: StablecoinFlow[]): ArcData[] {
  const maxUsd = Math.max(...flows.map((f) => f.total_usd), 1);

  return flows
    .filter((f) => {
      const from = COUNTRY_COORDS[f.from_country];
      const to = COUNTRY_COORDS[f.to_country];
      return from && to;
    })
    .sort((a, b) => {
      // Sort by last_seen descending (newest first); fall back to volume
      if (a.last_seen && b.last_seen) return b.last_seen.localeCompare(a.last_seen);
      return b.total_usd - a.total_usd;
    })
    .map((f) => {
      const from = COUNTRY_COORDS[f.from_country];
      const to = COUNTRY_COORDS[f.to_country];
      const symbol = f.token_symbol.toUpperCase();
      const color = TOKEN_COLORS[symbol] || "#ffffff";
      const normalizedUsd = f.total_usd / maxUsd;
      const stroke = 0.3 + normalizedUsd * 3;

      return {
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
        color,
        stroke,
        label: `${f.from_country} → ${f.to_country}: $${(f.total_usd / 1e6).toFixed(1)}M ${f.token_symbol}`,
        totalUsd: f.total_usd,
        tokenSymbol: f.token_symbol,
        fromCountry: f.from_country,
        toCountry: f.to_country,
        transferCount: f.transfer_count,
        dashOffset: Math.random(),
        lastSeen: f.last_seen || undefined,
      };
    });
}

function walletDataToArcs(data: WalletData): ArcData[] {
  const chainInfo = CHAIN_COORDS[data.chain.toLowerCase()];
  if (!chainInfo) return [];

  const walletLat = chainInfo.lat;
  const walletLng = chainInfo.lng;

  const maxTransfers = Math.max(
    ...data.counterparties.map((c) => c.transferCount),
    1
  );

  const unsorted = data.counterparties
    .map((cp) => {
      const pos = resolveCounterpartyPosition(cp.address, cp.chain, cp.entity);
      const category = cp.entity?.category?.toLowerCase() ?? "unknown";
      const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
      const normalized = cp.transferCount / maxTransfers;
      const stroke = 0.5 + normalized * 2.5;
      const totalValue = cp.totalSent + cp.totalReceived;
      const entityName = cp.entity?.name || `${cp.address.slice(0, 6)}...${cp.address.slice(-4)}`;
      const isSend = cp.totalSent > cp.totalReceived;

      return {
        startLat: isSend ? walletLat : pos.lat,
        startLng: isSend ? walletLng : pos.lng,
        endLat: isSend ? pos.lat : walletLat,
        endLng: isSend ? pos.lng : walletLng,
        color,
        stroke,
        label: `${isSend ? "→" : "←"} ${entityName}: ${cp.transferCount} transfers (${cp.tokens.join(", ")})`,
        totalUsd: totalValue,
        tokenSymbol: cp.tokens[0] || "ETH",
        fromCountry: isSend ? data.address.slice(0, 8) : pos.label,
        toCountry: isSend ? pos.label : data.address.slice(0, 8),
        transferCount: cp.transferCount,
        dashOffset: Math.random(),
        firstSeen: cp.firstSeen,
      };
    })
    .slice(0, 150);

  // Sort by firstSeen ascending (undefined goes last)
  return unsorted.sort((a, b) => {
    if (!a.firstSeen && !b.firstSeen) return 0;
    if (!a.firstSeen) return 1;
    if (!b.firstSeen) return -1;
    return a.firstSeen.localeCompare(b.firstSeen);
  });
}

function makeDefaultStablecoinDateRange(): DateRange {
  // Snap to current hour boundary so cache key stays stable
  const now = new Date();
  const end = new Date(Math.floor(now.getTime() / (3600 * 1000)) * 3600 * 1000);
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  return {
    startDate: start.toISOString().replace("T", " ").slice(0, 19),
    endDate: end.toISOString().replace("T", " ").slice(0, 19),
  };
}

export type ActiveView = "stablecoins" | "wallet";

export default function Home() {
  const [stablecoinArcs, setStablecoinArcs] = useState<ArcData[]>([]);
  const [walletArcs, setWalletArcs] = useState<ArcData[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>("stablecoins");
  const [stablecoinLoading, setStablecoinLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [stablecoinError, setStablecoinError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [, setHoveredArc] = useState<ArcData | null>(null);
  const [spawnIndex, setSpawnIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(true);
  const [timelineProgress, setTimelineProgress] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [timelineSpeed, setTimelineSpeed] = useState<1 | 2 | 5>(1);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const walletArcsRef = useRef<ArcData[]>([]);

  // Date range state
  const [stablecoinDateRange, setStablecoinDateRange] = useState<DateRange>(makeDefaultStablecoinDateRange);
  const [stablecoinIsLive, setStablecoinIsLive] = useState(true);

  const handleArcHover = useCallback((arc: ArcData | null) => {
    setHoveredArc(arc);
  }, []);

  const handleViewChange = useCallback((view: ActiveView) => {
    setActiveView(view);
  }, []);

  const handleSpawnProgress = useCallback((index: number, total: number) => {
    setSpawnIndex(index);
    setTimelineProgress({ index, total });
  }, []);

  const handleTimelinePlayPause = useCallback(() => {
    setTimelinePlaying((prev) => !prev);
  }, []);

  const handleTimelineRestart = useCallback(() => {
    // Briefly clear arcs to trigger Globe reset, then restore
    const saved = walletArcsRef.current;
    setWalletArcs([]);
    setTimelinePlaying(true);
    setTimelineProgress({ index: 0, total: saved.length });
    requestAnimationFrame(() => {
      setWalletArcs(saved);
    });
  }, []);

  const handleTimelineSpeedChange = useCallback((speed: 1 | 2 | 5) => {
    setTimelineSpeed(speed);
  }, []);

  const handleTimelineSeek = useCallback((index: number) => {
    setSeekTo(index);
    setSpawnIndex(index);
    setTimelineProgress((prev) => ({ ...prev, index }));
    // Clear seekTo after a tick so the same value can be sought again
    requestAnimationFrame(() => setSeekTo(null));
  }, []);

  const fetchWallet = useCallback(async (address: string, chain: string) => {
    setWalletLoading(true);
    setWalletError(null);
    setWalletData(null);
    setWalletArcs([]);
    setTimelinePlaying(true);
    setTimelineProgress({ index: 0, total: 0 });
    setTimelineSpeed(1);

    try {
      const res = await fetch(
        `/api/wallet?address=${encodeURIComponent(address)}&chain=${encodeURIComponent(chain)}&limit=50`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: WalletData = await res.json();
      setWalletData(data);
      const arcs = walletDataToArcs(data);
      walletArcsRef.current = arcs;
      setWalletArcs(arcs);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Failed to load wallet data");
    } finally {
      setWalletLoading(false);
    }
  }, []);

  // Fetch stablecoin data
  const fetchFlows = useCallback(async (dateRange?: DateRange) => {
    const range = dateRange || stablecoinDateRange;
    try {
      setStablecoinLoading(true);
      const url = `/api/flows?start_date=${encodeURIComponent(range.startDate)}&end_date=${encodeURIComponent(range.endDate)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      const flows: StablecoinFlow[] = (result.data || []).map(
        (row: Record<string, unknown>) => ({
          from_country: row.FROM_COUNTRY || row.from_country,
          to_country: row.TO_COUNTRY || row.to_country,
          token_symbol: row.TOKEN_SYMBOL || row.token_symbol,
          transfer_count: Number(row.TRANSFER_COUNT || row.transfer_count || 0),
          total_usd: Number(row.TOTAL_USD || row.total_usd || 0),
          last_seen: String(row.LAST_SEEN || row.last_seen || ""),
        })
      );
      setStablecoinArcs(flowsToArcs(flows));
      setStablecoinError(null);
    } catch (err) {
      setStablecoinError(err instanceof Error ? err.message : "Failed to load stablecoin data");
    } finally {
      setStablecoinLoading(false);
    }
  }, [stablecoinDateRange]);

  // Handle stablecoin date range change
  const handleStablecoinDateRangeChange = useCallback((range: DateRange, isLive: boolean) => {
    setStablecoinDateRange(range);
    setStablecoinIsLive(isLive);
    setStablecoinLoading(true);
    fetchFlows(range);
  }, [fetchFlows]);

  // Fetch stablecoin and default wallet data on mount
  useEffect(() => {
    // Fire-and-forget: warm server cache for default queries
    fetch("/api/prefetch").catch(() => {});
    fetchFlows();
    fetchWallet("0xdbf5e9c5206d0db70a90108bf936da60221dc080", "ethereum");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeArcs =
    activeView === "stablecoins"
      ? stablecoinArcs
      : walletArcs;

  const isLoading =
    activeView === "stablecoins"
      ? stablecoinLoading
      : walletLoading;

  const derivedSpawnInterval = Math.round(400 / timelineSpeed);

  return (
    <div className="flex h-screen w-screen bg-[#f5f0e8]">
      {/* Globe takes remaining space */}
      <div className="flex-1 relative min-w-0 overflow-hidden">
        {/* Allium logo */}
        <a href="https://allium.so" target="_blank" rel="noopener noreferrer" className="absolute top-5 left-5 z-10">
          <img src="/allium-logo.avif" alt="Allium" className="h-6 opacity-70 hover:opacity-100 transition-opacity" />
        </a>

        <Globe
          arcs={activeArcs}
          onArcHover={handleArcHover}
          loop={activeView !== "wallet"}
          paused={activeView === "wallet" ? !timelinePlaying : false}
          spawnInterval={activeView === "wallet" ? derivedSpawnInterval : 400}
          onSpawnProgress={handleSpawnProgress}
          seekTo={activeView === "wallet" ? seekTo : null}
        />

        {/* Loading text (no blur — onion shells provide visual loading state) */}
        {isLoading && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
            <div className="text-stone-400 text-sm">
              {activeView === "stablecoins"
                ? "Unpeeling stablecoin flows..."
                : "Unpeeling wallet transactions..."}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        stablecoinArcs={stablecoinArcs}
        walletArcs={walletArcs}
        stablecoinLoading={stablecoinLoading}
        walletLoading={walletLoading}
        stablecoinError={stablecoinError}
        walletError={walletError}
        walletData={walletData}
        onWalletSearch={fetchWallet}
        walletTimeline={{
          playing: timelinePlaying,
          progress: timelineProgress,
          speed: timelineSpeed,
        }}
        onTimelinePlayPause={handleTimelinePlayPause}
        onTimelineRestart={handleTimelineRestart}
        onTimelineSpeedChange={handleTimelineSpeedChange}
        onTimelineSeek={handleTimelineSeek}
        stablecoinDateRange={stablecoinDateRange}
        stablecoinIsLive={stablecoinIsLive}
        onStablecoinDateRangeChange={handleStablecoinDateRangeChange}
        spawnIndex={spawnIndex}
      />
    </div>
  );
}
