"use client";

import { useRef, useEffect, useState } from "react";
import type { ArcData, WalletData } from "@/lib/types";
import type { ActiveView, DateRange } from "@/app/page";
import { CATEGORY_COLORS } from "@/lib/entities";
import { CHAIN_COORDS } from "@/lib/chains";
import { COUNTRY_FLAGS } from "@/lib/countries";

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export interface WalletTimelineState {
  playing: boolean;
  progress: { index: number; total: number };
  speed: 1 | 2 | 5;
}

// ── Quick-select presets ──

type QuickPreset = { label: string; hours: number };

const QUICK_PRESETS: QuickPreset[] = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 7 * 24 },
  { label: "30d", hours: 30 * 24 },
];

function formatRangeLabel(range: DateRange, isLive: boolean): string {
  if (isLive) {
    // Determine the preset from the range duration
    const startMs = new Date(range.startDate.replace(" ", "T") + "Z").getTime();
    const endMs = new Date(range.endDate.replace(" ", "T") + "Z").getTime();
    const hours = (endMs - startMs) / (1000 * 60 * 60);
    if (hours <= 1.1) return "Live · Last 1h";
    if (hours <= 6.1) return "Live · Last 6h";
    if (hours <= 24.1) return "Live · Last 24h";
    if (hours <= 168.1) return "Live · Last 7d";
    if (hours <= 720.1) return "Live · Last 30d";
    return "Live";
  }
  // Custom range — show compact dates
  const start = range.startDate.slice(0, 10);
  const end = range.endDate.slice(0, 10);
  if (start === end) return start;
  return `${start} — ${end}`;
}

function toDateInputValue(isoish: string): string {
  // "2025-01-01 00:00:00" → "2025-01-01"
  return isoish.slice(0, 10);
}

function toDateTimeInputValue(isoish: string): string {
  // "2025-01-01 00:00:00" → "2025-01-01T00:00"
  return isoish.slice(0, 10) + "T" + isoish.slice(11, 16);
}

function fromDateTimeInput(value: string): string {
  // "2025-01-01T00:00" → "2025-01-01 00:00:00"
  return value.replace("T", " ") + ":00";
}

// ── DateRangePicker component ──

function DateRangePicker({
  dateRange,
  isLive,
  loading,
  defaultHours,
  onChange,
}: {
  dateRange: DateRange;
  isLive: boolean;
  loading: boolean;
  defaultHours: number;
  onChange: (range: DateRange, isLive: boolean) => void;
}) {
  const [localStart, setLocalStart] = useState(toDateTimeInputValue(dateRange.startDate));
  const [localEnd, setLocalEnd] = useState(toDateTimeInputValue(dateRange.endDate));

  // Sync local state when parent range changes (e.g. from live refresh)
  useEffect(() => {
    if (isLive) {
      setLocalStart(toDateTimeInputValue(dateRange.startDate));
      setLocalEnd(toDateTimeInputValue(dateRange.endDate));
    }
  }, [dateRange, isLive]);

  const handleQuickSelect = (hours: number) => {
    const now = new Date();
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const range: DateRange = {
      startDate: start.toISOString().replace("T", " ").slice(0, 19),
      endDate: now.toISOString().replace("T", " ").slice(0, 19),
    };
    setLocalStart(toDateTimeInputValue(range.startDate));
    setLocalEnd(toDateTimeInputValue(range.endDate));
    onChange(range, true);
  };

  const handleLoadCustom = () => {
    if (!localStart || !localEnd) return;
    const range: DateRange = {
      startDate: fromDateTimeInput(localStart),
      endDate: fromDateTimeInput(localEnd),
    };
    onChange(range, false);
  };

  // Detect which preset matches current live range
  const activePresetHours = (() => {
    if (!isLive) return null;
    const startMs = new Date(dateRange.startDate.replace(" ", "T") + "Z").getTime();
    const endMs = new Date(dateRange.endDate.replace(" ", "T") + "Z").getTime();
    const hours = (endMs - startMs) / (1000 * 60 * 60);
    for (const p of QUICK_PRESETS) {
      if (Math.abs(hours - p.hours) < p.hours * 0.1) return p.hours;
    }
    return null;
  })();

  return (
    <div className="px-6 py-3 border-b border-stone-300/50 space-y-2">
      {/* Quick presets */}
      <div className="flex items-center gap-1.5">
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handleQuickSelect(p.hours)}
            disabled={loading}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              activePresetHours === p.hours
                ? "bg-stone-700 text-white"
                : "bg-stone-200/60 text-stone-500 hover:bg-stone-300/60 hover:text-stone-700"
            } disabled:opacity-40`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-stone-400 block mb-0.5">From</label>
          <input
            type="datetime-local"
            value={localStart}
            onChange={(e) => setLocalStart(e.target.value)}
            className="w-full px-2 py-1 text-[11px] bg-white/60 border border-stone-300 rounded text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-stone-400 block mb-0.5">To</label>
          <input
            type="datetime-local"
            value={localEnd}
            onChange={(e) => setLocalEnd(e.target.value)}
            className="w-full px-2 py-1 text-[11px] bg-white/60 border border-stone-300 rounded text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
        <button
          onClick={handleLoadCustom}
          disabled={loading || !localStart || !localEnd}
          className="px-3 py-1 text-[11px] font-medium bg-stone-700 text-white rounded hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {loading ? (
            <span className="inline-block w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            "Load"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Stats Panel ──

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  stablecoinArcs: ArcData[];
  walletArcs: ArcData[];
  stablecoinLoading: boolean;
  walletLoading: boolean;
  stablecoinError: string | null;
  walletError: string | null;
  walletData: WalletData | null;
  onWalletSearch: (address: string, chain: string) => void;
  walletTimeline: WalletTimelineState;
  onTimelinePlayPause: () => void;
  onTimelineRestart: () => void;
  onTimelineSpeedChange: (speed: 1 | 2 | 5) => void;
  stablecoinDateRange: DateRange;
  stablecoinIsLive: boolean;
  onStablecoinDateRangeChange: (range: DateRange, isLive: boolean) => void;
  spawnIndex: number;
}

function StatsPanel({ arcs, loading, error, corridorLabel, spawnIndex }: {
  arcs: ArcData[];
  loading: boolean;
  error: string | null;
  corridorLabel: string;
  spawnIndex: number;
}) {
  const totalVolume = arcs.reduce((sum, a) => sum + a.totalUsd, 0);
  const totalTransfers = arcs.reduce((sum, a) => sum + a.transferCount, 0);

  // Aggregate by corridor pair (sum across tokens)
  const pairMap = new Map<string, { from: string; to: string; usd: number; count: number }>();
  for (const arc of arcs) {
    const key = `${arc.fromCountry}→${arc.toCountry}`;
    const existing = pairMap.get(key);
    if (existing) {
      existing.usd += arc.totalUsd;
      existing.count += arc.transferCount;
    } else {
      pairMap.set(key, { from: arc.fromCountry, to: arc.toCountry, usd: arc.totalUsd, count: arc.transferCount });
    }
  }
  const topPairs = Array.from(pairMap.values())
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 12);

  // Aggregate by token
  const tokenMap = new Map<string, { symbol: string; usd: number; color: string }>();
  for (const arc of arcs) {
    const existing = tokenMap.get(arc.tokenSymbol);
    if (existing) {
      existing.usd += arc.totalUsd;
    } else {
      tokenMap.set(arc.tokenSymbol, { symbol: arc.tokenSymbol, usd: arc.totalUsd, color: arc.color });
    }
  }
  const tokens = Array.from(tokenMap.values()).sort((a, b) => b.usd - a.usd);
  const maxTokenUsd = tokens[0]?.usd || 1;

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 p-6 border-b border-stone-300/50">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
            Total Volume
          </div>
          <div className="text-2xl font-bold text-stone-800 tabular-nums">
            {loading ? "..." : formatUsd(totalVolume)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
            Transfers
          </div>
          <div className="text-2xl font-bold text-stone-800 tabular-nums">
            {loading ? "..." : totalTransfers.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Token breakdown */}
      <div className="p-6 border-b border-stone-300/50">
        <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-3">
          By Token
        </div>
        <div className="space-y-2">
          {tokens.slice(0, 6).map((t) => (
            <div key={t.symbol} className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: t.color }}
              />
              <div className="text-sm text-stone-600 w-14 truncate">{t.symbol}</div>
              <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(t.usd / maxTokenUsd) * 100}%`,
                    backgroundColor: t.color,
                  }}
                />
              </div>
              <div className="text-xs text-stone-500 w-16 text-right tabular-nums">
                {formatUsd(t.usd)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top corridors */}
      <div className="p-6 border-b border-stone-300/50">
        <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-3">
          {corridorLabel}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm bg-red-100 p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-1">
          {topPairs.map((pair, i) => (
            <div
              key={`${pair.from}-${pair.to}`}
              className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-stone-200/50 transition-colors"
            >
              <span className="text-stone-300 text-xs w-5 text-right tabular-nums">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-700 truncate">
                  {COUNTRY_FLAGS[pair.from] ?? ""} {pair.from} → {COUNTRY_FLAGS[pair.to] ?? ""} {pair.to}
                </div>
                <div className="text-xs text-stone-400">
                  {pair.count.toLocaleString()} transfers
                </div>
              </div>
              <div className="text-sm font-medium text-stone-800 tabular-nums">
                {formatUsd(pair.usd)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transfer log — streams in as arcs spawn, newest on top */}
      {arcs.length > 0 && <TransferLog arcs={arcs} spawnIndex={spawnIndex} />}
    </>
  );
}

// ── Transfer Log (streaming) ──

function formatTimeCompact(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.replace(" ", "T") + (dateStr.includes("Z") ? "" : "Z"));
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function TransferLog({ arcs, spawnIndex }: { arcs: ArcData[]; spawnIndex: number }) {
  // How many arcs have been spawned (capped at arcs.length)
  const shown = Math.min(spawnIndex, arcs.length);

  // Build the visible list — spawned arcs in reverse order (newest first)
  const visible = [];
  for (let i = shown - 1; i >= 0; i--) {
    visible.push({ arc: arcs[i % arcs.length], idx: i });
  }

  return (
    <div className="p-6">
      <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-3">
        Transfers
      </div>
      {/* capped at viewport height so it doesn't push sections infinitely */}
      <div className="max-h-[100vh] overflow-y-auto">
      <div className="space-y-0.5">
        {visible.map(({ arc, idx }) => {
          const isNewest = idx === shown - 1;
          return (
            <div
              key={`${arc.fromCountry}-${arc.toCountry}-${arc.tokenSymbol}-${idx}`}
              className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-all duration-300 ${
                isNewest
                  ? "bg-stone-300/60 ring-1 ring-stone-400/50"
                  : "opacity-80"
              }`}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: arc.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-stone-600 truncate">
                  {COUNTRY_FLAGS[arc.fromCountry] ?? ""} {arc.fromCountry} → {COUNTRY_FLAGS[arc.toCountry] ?? ""} {arc.toCountry}
                </div>
              </div>
              <div className="text-[11px] text-stone-400 shrink-0">
                {arc.tokenSymbol}
              </div>
              {arc.lastSeen && (
                <div className="text-[10px] text-stone-300 tabular-nums shrink-0">
                  {formatTimeCompact(arc.lastSeen)}
                </div>
              )}
              <div className="text-xs font-medium text-stone-700 tabular-nums shrink-0">
                {formatUsd(arc.totalUsd)}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ── Wallet Timeline ──

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function WalletTimeline({
  timeline,
  walletArcs,
  onPlayPause,
  onRestart,
  onSpeedChange,
}: {
  timeline: WalletTimelineState;
  walletArcs: ArcData[];
  onPlayPause: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: 1 | 2 | 5) => void;
}) {
  const { playing, progress, speed } = timeline;
  const { index, total } = progress;
  const isComplete = total > 0 && index >= total;
  const fraction = total > 0 ? index / total : 0;

  // Date labels from arc data
  const startDate = walletArcs.length > 0 ? formatDate(walletArcs[0].firstSeen) : "";
  const endDate = walletArcs.length > 0 ? formatDate(walletArcs[walletArcs.length - 1].firstSeen) : "";
  const currentIdx = Math.max(0, Math.min(index - 1, walletArcs.length - 1));
  const currentDate = walletArcs.length > 0 ? formatDate(walletArcs[currentIdx]?.firstSeen) : "";

  return (
    <div className="px-6 py-4 border-b border-stone-300/50 space-y-2">
      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Play/Pause button */}
        <button
          onClick={onPlayPause}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-200/60 transition-colors text-stone-600"
          title={playing ? "Pause" : "Play"}
        >
          {playing && !isComplete ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="1" width="3.5" height="12" rx="0.5" />
              <rect x="8.5" y="1" width="3.5" height="12" rx="0.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 1.5v11l9-5.5z" />
            </svg>
          )}
        </button>

        {/* Restart button */}
        <button
          onClick={onRestart}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-200/60 transition-colors text-stone-600"
          title="Restart"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 2v4h4" />
            <path d="M2.5 9a5 5 0 1 0 1-5.5L1.5 6" />
          </svg>
        </button>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden mx-1">
          <div
            className="h-full bg-stone-500 rounded-full transition-all duration-200"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>

        {/* Speed buttons */}
        {([1, 2, 5] as const).map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
              speed === s
                ? "bg-stone-700 text-white"
                : "text-stone-400 hover:text-stone-600 hover:bg-stone-200/60"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Date labels + counter */}
      <div className="flex items-center justify-between text-[10px] text-stone-400">
        <span>{startDate}</span>
        <span>
          {isComplete ? (
            <span className="text-stone-500">(complete)</span>
          ) : total > 0 ? (
            <>
              {currentDate && <span className="text-stone-500">{currentDate} · </span>}
              {index} / {total} counterparties
            </>
          ) : null}
        </span>
        <span>{endDate}</span>
      </div>
    </div>
  );
}

// ── Wallet Panel ──

const CHAIN_OPTIONS = Object.entries(CHAIN_COORDS)
  .filter(([key]) => !["polygon_zkevm", "plasma"].includes(key))
  .map(([key, info]) => ({ value: key, label: info.label }))
  .sort((a, b) => a.label.localeCompare(b.label));

function WalletPanel({
  walletData,
  walletLoading,
  walletError,
  onWalletSearch,
}: {
  walletData: WalletData | null;
  walletLoading: boolean;
  walletError: string | null;
  onWalletSearch: (address: string, chain: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    onWalletSearch(trimmed, chain);
  };

  // Category breakdown from counterparties
  const categoryStats = new Map<string, { count: number; transfers: number }>();
  if (walletData) {
    for (const cp of walletData.counterparties) {
      const cat = cp.entity?.category?.toLowerCase() ?? "unknown";
      const existing = categoryStats.get(cat) || { count: 0, transfers: 0 };
      existing.count += 1;
      existing.transfers += cp.transferCount;
      categoryStats.set(cat, existing);
    }
  }
  const categories = Array.from(categoryStats.entries())
    .sort((a, b) => b[1].transfers - a[1].transfers);
  const maxCatTransfers = categories[0]?.[1].transfers || 1;

  const totalSent = walletData?.counterparties.reduce((s, c) => s + c.totalSent, 0) ?? 0;
  const totalReceived = walletData?.counterparties.reduce((s, c) => s + c.totalReceived, 0) ?? 0;
  const totalTransfers = walletData?.counterparties.reduce((s, c) => s + c.transferCount, 0) ?? 0;

  return (
    <>
      {/* Search form */}
      <form onSubmit={handleSubmit} className="p-6 border-b border-stone-300/50 space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-stone-400 block mb-1">
            Wallet Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 text-sm bg-white/60 border border-stone-300 rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-wider text-stone-400 block mb-1">
              Chain
            </label>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white/60 border border-stone-300 rounded-lg text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-500"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={walletLoading || !address.trim()}
              className="px-4 py-2 text-sm font-medium bg-stone-700 text-white rounded-lg hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {walletLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
      {walletError && (
        <div className="mx-6 mt-4 text-red-600 text-sm bg-red-100 p-3 rounded-lg">
          {walletError}
        </div>
      )}

      {/* Loading */}
      {walletLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Results */}
      {walletData && !walletLoading && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 p-6 border-b border-stone-300/50">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                Total Sent
              </div>
              <div className="text-lg font-bold text-stone-800 tabular-nums">
                {totalSent.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                Total Received
              </div>
              <div className="text-lg font-bold text-stone-800 tabular-nums">
                {totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                Transfers
              </div>
              <div className="text-lg font-bold text-stone-800 tabular-nums">
                {totalTransfers.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                Counterparties
              </div>
              <div className="text-lg font-bold text-stone-800 tabular-nums">
                {walletData.counterparties.length}
              </div>
            </div>
          </div>

          {/* Category breakdown */}
          {categories.length > 0 && (
            <div className="p-6 border-b border-stone-300/50">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-3">
                By Category
              </div>
              <div className="space-y-2">
                {categories.slice(0, 6).map(([cat, stats]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown }}
                    />
                    <div className="text-sm text-stone-600 w-16 truncate capitalize">{cat}</div>
                    <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(stats.transfers / maxCatTransfers) * 100}%`,
                          backgroundColor: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown,
                        }}
                      />
                    </div>
                    <div className="text-xs text-stone-500 w-12 text-right tabular-nums">
                      {stats.transfers}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Counterparty list */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-3">
              Top Counterparties · {totalTransfers} transfers
            </div>
            <div className="space-y-1">
              {walletData.counterparties.slice(0, 20).map((cp, i) => {
                const cat = cp.entity?.category?.toLowerCase() ?? "unknown";
                const color = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown;
                const name = cp.entity?.name || `${cp.address.slice(0, 6)}...${cp.address.slice(-4)}`;
                return (
                  <div
                    key={cp.address}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-stone-200/50 transition-colors"
                  >
                    <span className="text-stone-300 text-xs w-5 text-right tabular-nums">
                      {i + 1}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-stone-700 truncate">{name}</div>
                      <div className="text-xs text-stone-400">
                        {cp.transferCount} transfers · {cp.tokens.slice(0, 3).join(", ")}
                      </div>
                    </div>
                    <div className="text-right">
                      {cp.totalSent > 0 && (
                        <div className="text-xs text-red-500 tabular-nums">
                          -{cp.totalSent.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      )}
                      {cp.totalReceived > 0 && (
                        <div className="text-xs text-green-600 tabular-nums">
                          +{cp.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!walletData && !walletLoading && !walletError && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-stone-400 text-sm">
            Enter a wallet address to explore its transaction history on the globe.
          </div>
        </div>
      )}
    </>
  );
}

export default function Sidebar({
  activeView,
  onViewChange,
  stablecoinArcs,
  walletArcs,
  stablecoinLoading,
  walletLoading,
  stablecoinError,
  walletError,
  walletData,
  onWalletSearch,
  walletTimeline,
  onTimelinePlayPause,
  onTimelineRestart,
  onTimelineSpeedChange,
  stablecoinDateRange,
  stablecoinIsLive,
  onStablecoinDateRangeChange,
  spawnIndex,
}: SidebarProps) {
  const stablecoinSectionRef = useRef<HTMLDivElement>(null);
  const walletSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver to auto-switch view when scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            if (entry.target === stablecoinSectionRef.current) {
              onViewChange("stablecoins");
            } else if (entry.target === walletSectionRef.current) {
              onViewChange("wallet");
            }
          }
        }
      },
      { root: container, threshold: 0.5 }
    );

    if (stablecoinSectionRef.current) observer.observe(stablecoinSectionRef.current);
    if (walletSectionRef.current) observer.observe(walletSectionRef.current);

    return () => observer.disconnect();
  }, [onViewChange]);

  // Scroll to section when tab is clicked
  const scrollToSection = (view: ActiveView) => {
    onViewChange(view);
    const target =
      view === "stablecoins"
        ? stablecoinSectionRef.current
        : walletSectionRef.current;
    target?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="w-[380px] shrink-0 h-full bg-[#f5f0e8]/80 backdrop-blur-xl border-l border-stone-300/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-stone-300/50">
        <h1 className="text-lg font-semibold text-stone-800 tracking-tight">
          Follow the Money
        </h1>
        <p className="text-xs text-stone-500 mt-1">
          Stablecoin flows & wallet explorer
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-300/50">
        <button
          onClick={() => scrollToSection("stablecoins")}
          className={`flex-1 px-4 py-3 text-xs font-medium tracking-wide transition-colors ${
            activeView === "stablecoins"
              ? "text-stone-800 border-b-2 border-stone-700"
              : "text-stone-400 hover:text-stone-600"
          }`}
        >
          Stablecoins
          {stablecoinLoading && (
            <span className="inline-block w-2 h-2 ml-2 border border-stone-400 border-t-stone-600 rounded-full animate-spin align-middle" />
          )}
        </button>
        <button
          onClick={() => scrollToSection("wallet")}
          className={`flex-1 px-4 py-3 text-xs font-medium tracking-wide transition-colors ${
            activeView === "wallet"
              ? "text-stone-800 border-b-2 border-stone-700"
              : "text-stone-400 hover:text-stone-600"
          }`}
        >
          Wallet
          {walletLoading && (
            <span className="inline-block w-2 h-2 ml-2 border border-stone-400 border-t-stone-600 rounded-full animate-spin align-middle" />
          )}
        </button>
      </div>

      {/* Scrollable content with all sections */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Stablecoin section */}
        <div ref={stablecoinSectionRef} className="min-h-full flex flex-col">
          <div className="px-6 pt-4 pb-2">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">
              Stablecoin Flows · {formatRangeLabel(stablecoinDateRange, stablecoinIsLive)}
            </div>
          </div>
          <DateRangePicker
            dateRange={stablecoinDateRange}
            isLive={stablecoinIsLive}
            loading={stablecoinLoading}
            defaultHours={24}
            onChange={onStablecoinDateRangeChange}
          />
          <StatsPanel
            arcs={stablecoinArcs}
            loading={stablecoinLoading}
            error={stablecoinError}
            corridorLabel="Top Country Corridors"
            spawnIndex={activeView === "stablecoins" ? spawnIndex : 0}
          />
        </div>

        {/* Wallet section */}
        <div ref={walletSectionRef} className="min-h-full flex flex-col border-t border-stone-300/50">
          <div className="px-6 pt-4 pb-2">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">
              Wallet Explorer
            </div>
          </div>
          {walletData && !walletLoading && walletArcs.length > 0 && (
            <WalletTimeline
              timeline={walletTimeline}
              walletArcs={walletArcs}
              onPlayPause={onTimelinePlayPause}
              onRestart={onTimelineRestart}
              onSpeedChange={onTimelineSpeedChange}
            />
          )}
          <WalletPanel
            walletData={walletData}
            walletLoading={walletLoading}
            walletError={walletError}
            onWalletSearch={onWalletSearch}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-stone-300/50 text-center">
        <span className="text-[10px] text-stone-400">
          Powered by Allium
        </span>
      </div>
    </div>
  );
}
