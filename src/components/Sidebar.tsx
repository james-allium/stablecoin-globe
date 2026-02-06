"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
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
    const startMs = new Date(range.startDate.replace(" ", "T") + "Z").getTime();
    const endMs = new Date(range.endDate.replace(" ", "T") + "Z").getTime();
    const hours = (endMs - startMs) / (1000 * 60 * 60);
    if (hours <= 1.1) return "Live · 1h";
    if (hours <= 6.1) return "Live · 6h";
    if (hours <= 24.1) return "Live · 24h";
    if (hours <= 168.1) return "Live · 7d";
    if (hours <= 720.1) return "Live · 30d";
    return "Live";
  }
  const start = range.startDate.slice(0, 10);
  const end = range.endDate.slice(0, 10);
  if (start === end) return start;
  return `${start} — ${end}`;
}

function toDateTimeInputValue(isoish: string): string {
  return isoish.slice(0, 10) + "T" + isoish.slice(11, 16);
}

function fromDateTimeInput(value: string): string {
  return value.replace("T", " ") + ":00";
}

// ── Shared styles ──

const SECTION_PAD = "px-5 py-4";
const LABEL = "text-[10px] uppercase tracking-widest text-stone-400 font-medium";
const DIVIDER = "border-b border-stone-300/40";

// ── DateRangePicker ──

function DateRangePicker({
  dateRange,
  isLive,
  loading,
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

  useEffect(() => {
    if (isLive) {
      setLocalStart(toDateTimeInputValue(dateRange.startDate));
      setLocalEnd(toDateTimeInputValue(dateRange.endDate));
    }
  }, [dateRange, isLive]);

  const handleQuickSelect = (hours: number) => {
    // Snap to hour (or day for 7d/30d) boundary so cache keys stay stable
    const now = new Date();
    const snapMs = hours >= 24 * 7 ? 86400 * 1000 : 3600 * 1000;
    const end = new Date(Math.floor(now.getTime() / snapMs) * snapMs);
    const start = new Date(end.getTime() - hours * 3600 * 1000);
    const range: DateRange = {
      startDate: start.toISOString().replace("T", " ").slice(0, 19),
      endDate: end.toISOString().replace("T", " ").slice(0, 19),
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
    <div className={`${SECTION_PAD} ${DIVIDER} space-y-2`}>
      <div className="flex items-center gap-1">
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handleQuickSelect(p.hours)}
            disabled={loading}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
              activePresetHours === p.hours
                ? "bg-stone-800 text-white"
                : "bg-stone-200/50 text-stone-500 hover:bg-stone-300/50 hover:text-stone-700"
            } disabled:opacity-40`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-wider text-stone-400 block mb-0.5">From</label>
          <input
            type="datetime-local"
            value={localStart}
            onChange={(e) => setLocalStart(e.target.value)}
            className="w-full px-2 py-1 text-[11px] bg-white/50 border border-stone-200 rounded-md text-stone-700 focus:outline-none focus:border-stone-400"
          />
        </div>
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-wider text-stone-400 block mb-0.5">To</label>
          <input
            type="datetime-local"
            value={localEnd}
            onChange={(e) => setLocalEnd(e.target.value)}
            className="w-full px-2 py-1 text-[11px] bg-white/50 border border-stone-200 rounded-md text-stone-700 focus:outline-none focus:border-stone-400"
          />
        </div>
        <button
          onClick={handleLoadCustom}
          disabled={loading || !localStart || !localEnd}
          className="px-3 py-1 text-[11px] font-medium bg-stone-800 text-white rounded-md hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
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
  onTimelineSeek: (index: number) => void;
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
      {/* Summary stats */}
      <div className={`grid grid-cols-2 gap-4 ${SECTION_PAD} ${DIVIDER}`}>
        <div>
          <div className={LABEL}>Volume</div>
          <div className="text-xl font-semibold text-stone-800 tabular-nums mt-1">
            {loading ? "—" : formatUsd(totalVolume)}
          </div>
        </div>
        <div>
          <div className={LABEL}>Transfers</div>
          <div className="text-xl font-semibold text-stone-800 tabular-nums mt-1">
            {loading ? "—" : totalTransfers.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Token breakdown */}
      <div className={`${SECTION_PAD} ${DIVIDER}`}>
        <div className={`${LABEL} mb-3`}>Tokens</div>
        <div className="space-y-2">
          {tokens.slice(0, 6).map((t) => (
            <div key={t.symbol} className="flex items-center gap-2.5">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: t.color }}
              />
              <div className="text-[12px] text-stone-600 w-12 truncate">{t.symbol}</div>
              <div className="flex-1 h-1 bg-stone-200/80 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(t.usd / maxTokenUsd) * 100}%`,
                    backgroundColor: t.color,
                  }}
                />
              </div>
              <div className="text-[11px] text-stone-500 w-14 text-right tabular-nums">
                {formatUsd(t.usd)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top corridors */}
      <div className={`${SECTION_PAD} ${DIVIDER}`}>
        <div className={`${LABEL} mb-2`}>{corridorLabel}</div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-red-600 text-xs bg-red-50 p-2.5 rounded-md">
            {error}
          </div>
        )}

        <div className="space-y-0.5">
          {topPairs.map((pair, i) => (
            <div
              key={`${pair.from}-${pair.to}`}
              className="flex items-center gap-2.5 py-1.5 px-1.5 rounded-md hover:bg-stone-200/40 transition-colors"
            >
              <span className="text-stone-300 text-[11px] w-4 text-right tabular-nums">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-stone-700 truncate">
                  {COUNTRY_FLAGS[pair.from] ?? ""} {pair.from} → {COUNTRY_FLAGS[pair.to] ?? ""} {pair.to}
                </div>
                <div className="text-[10px] text-stone-400">
                  {pair.count.toLocaleString()} transfers
                </div>
              </div>
              <div className="text-[12px] font-medium text-stone-700 tabular-nums">
                {formatUsd(pair.usd)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transfer log */}
      {arcs.length > 0 && <TransferLog arcs={arcs} spawnIndex={spawnIndex} />}
    </>
  );
}

// ── Transfer Log ──

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
  const shown = Math.min(spawnIndex, arcs.length);

  const visible = [];
  for (let i = shown - 1; i >= 0; i--) {
    visible.push({ arc: arcs[i % arcs.length], idx: i });
  }

  return (
    <div className={SECTION_PAD}>
      <div className={`${LABEL} mb-2`}>Transfers</div>
      <div className="max-h-[100vh] overflow-y-auto">
        <div className="space-y-px">
          {visible.map(({ arc, idx }) => {
            const isNewest = idx === shown - 1;
            return (
              <div
                key={`${arc.fromCountry}-${arc.toCountry}-${arc.tokenSymbol}-${idx}`}
                className={`flex items-center gap-2 py-1.5 px-1.5 rounded-md transition-all duration-300 ${
                  isNewest ? "bg-stone-300/50" : "opacity-75"
                }`}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: arc.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-stone-600 truncate">
                    {COUNTRY_FLAGS[arc.fromCountry] ?? ""} {arc.fromCountry} → {COUNTRY_FLAGS[arc.toCountry] ?? ""} {arc.toCountry}
                  </div>
                </div>
                <div className="text-[10px] text-stone-400 shrink-0">
                  {arc.tokenSymbol}
                </div>
                {(arc.lastSeen || arc.firstSeen) && (
                  <div className="text-[10px] text-stone-300 tabular-nums shrink-0">
                    {formatTimeCompact(arc.lastSeen || arc.firstSeen)}
                  </div>
                )}
                <div className="text-[11px] font-medium text-stone-700 tabular-nums shrink-0">
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
  onSeek,
}: {
  timeline: WalletTimelineState;
  walletArcs: ArcData[];
  onPlayPause: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: 1 | 2 | 5) => void;
  onSeek: (index: number) => void;
}) {
  const { playing, progress, speed } = timeline;
  const { index, total } = progress;
  const isComplete = total > 0 && index >= total;
  const fraction = total > 0 ? index / total : 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const seekFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const track = trackRef.current;
    if (!track || total === 0) return;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const seekIdx = Math.round((x / rect.width) * total);
    onSeek(seekIdx);
  }, [total, onSeek]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      seekFromEvent(e);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [seekFromEvent]);

  const startDate = walletArcs.length > 0 ? formatDate(walletArcs[0].firstSeen) : "";
  const endDate = walletArcs.length > 0 ? formatDate(walletArcs[walletArcs.length - 1].firstSeen) : "";
  const currentIdx = Math.max(0, Math.min(index - 1, walletArcs.length - 1));
  const currentDate = walletArcs.length > 0 ? formatDate(walletArcs[currentIdx]?.firstSeen) : "";

  return (
    <div className={`${SECTION_PAD} ${DIVIDER} space-y-2`}>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPlayPause}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-stone-200/50 transition-colors text-stone-600"
          title={playing ? "Pause" : "Play"}
        >
          {playing && !isComplete ? (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="1" width="3.5" height="12" rx="0.5" />
              <rect x="8.5" y="1" width="3.5" height="12" rx="0.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 1.5v11l9-5.5z" />
            </svg>
          )}
        </button>

        <button
          onClick={onRestart}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-stone-200/50 transition-colors text-stone-600"
          title="Restart"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 2v4h4" />
            <path d="M2.5 9a5 5 0 1 0 1-5.5L1.5 6" />
          </svg>
        </button>

        <div
          ref={trackRef}
          className="flex-1 h-3 flex items-center mx-1 cursor-pointer group"
          onMouseDown={(e) => {
            draggingRef.current = true;
            seekFromEvent(e);
          }}
        >
          <div className="w-full h-1 bg-stone-200/80 rounded-full relative">
            <div
              className="h-full bg-stone-500 rounded-full"
              style={{ width: `${fraction * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-stone-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              style={{ left: `calc(${fraction * 100}% - 5px)` }}
            />
          </div>
        </div>

        {([1, 2, 5] as const).map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
              speed === s
                ? "bg-stone-800 text-white"
                : "text-stone-400 hover:text-stone-600 hover:bg-stone-200/50"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-stone-400">
        <span>{startDate}</span>
        <span>
          {isComplete ? (
            <span className="text-stone-400">complete</span>
          ) : total > 0 ? (
            <>
              {currentDate && <span className="text-stone-500">{currentDate} · </span>}
              {index}/{total}
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
  walletArcs,
  spawnIndex,
}: {
  walletData: WalletData | null;
  walletLoading: boolean;
  walletError: string | null;
  onWalletSearch: (address: string, chain: string) => void;
  walletArcs: ArcData[];
  spawnIndex: number;
}) {
  const [address, setAddress] = useState("0xdbf5e9c5206d0db70a90108bf936da60221dc080");
  const [chain, setChain] = useState("ethereum");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    onWalletSearch(trimmed, chain);
  };

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
      {/* Search */}
      <form onSubmit={handleSubmit} className={`${SECTION_PAD} ${DIVIDER} space-y-2.5`}>
        <div>
          <label className={`${LABEL} block mb-1`}>Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 text-[12px] bg-white/50 border border-stone-200 rounded-md text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-400"
          />
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1">
            <label className={`${LABEL} block mb-1`}>Chain</label>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full px-3 py-2 text-[12px] bg-white/50 border border-stone-200 rounded-md text-stone-800 focus:outline-none focus:border-stone-400"
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
              className="px-4 py-2 text-[12px] font-medium bg-stone-800 text-white rounded-md hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {walletLoading ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </div>
        </div>
      </form>

      {walletError && (
        <div className="mx-5 mt-3 text-red-600 text-xs bg-red-50 p-2.5 rounded-md">
          {walletError}
        </div>
      )}

      {walletLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="w-4 h-4 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
        </div>
      )}

      {walletData && !walletLoading && (
        <>
          {/* Stats */}
          <div className={`grid grid-cols-2 gap-4 ${SECTION_PAD} ${DIVIDER}`}>
            <div>
              <div className={LABEL}>Sent</div>
              <div className="text-base font-semibold text-stone-800 tabular-nums mt-1">
                {totalSent.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className={LABEL}>Received</div>
              <div className="text-base font-semibold text-stone-800 tabular-nums mt-1">
                {totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className={LABEL}>Transfers</div>
              <div className="text-base font-semibold text-stone-800 tabular-nums mt-1">
                {totalTransfers.toLocaleString()}
              </div>
            </div>
            <div>
              <div className={LABEL}>Counterparties</div>
              <div className="text-base font-semibold text-stone-800 tabular-nums mt-1">
                {walletData.counterparties.length}
              </div>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className={`${SECTION_PAD} ${DIVIDER}`}>
              <div className={`${LABEL} mb-3`}>Categories</div>
              <div className="space-y-2">
                {categories.slice(0, 6).map(([cat, stats]) => (
                  <div key={cat} className="flex items-center gap-2.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown }}
                    />
                    <div className="text-[12px] text-stone-600 w-14 truncate capitalize">{cat}</div>
                    <div className="flex-1 h-1 bg-stone-200/80 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(stats.transfers / maxCatTransfers) * 100}%`,
                          backgroundColor: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown,
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-stone-500 w-10 text-right tabular-nums">
                      {stats.transfers}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Counterparties */}
          <div className={`flex-1 overflow-y-auto ${SECTION_PAD}`}>
            <div className={`${LABEL} mb-2`}>Counterparties</div>
            <div className="space-y-0.5">
              {walletData.counterparties.slice(0, 20).map((cp, i) => {
                const cat = cp.entity?.category?.toLowerCase() ?? "unknown";
                const color = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown;
                const name = cp.entity?.name || `${cp.address.slice(0, 6)}...${cp.address.slice(-4)}`;
                return (
                  <div
                    key={cp.address}
                    className="flex items-center gap-2.5 py-1.5 px-1.5 rounded-md hover:bg-stone-200/40 transition-colors"
                  >
                    <span className="text-stone-300 text-[11px] w-4 text-right tabular-nums">
                      {i + 1}
                    </span>
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone-700 truncate">{name}</div>
                      <div className="text-[10px] text-stone-400">
                        {cp.transferCount} transfers · {cp.tokens.slice(0, 3).join(", ")}
                      </div>
                    </div>
                    <div className="text-right">
                      {cp.totalSent > 0 && (
                        <div className="text-[11px] text-red-500/80 tabular-nums">
                          -{cp.totalSent.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      )}
                      {cp.totalReceived > 0 && (
                        <div className="text-[11px] text-emerald-600/80 tabular-nums">
                          +{cp.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Streaming transfer log */}
          {walletArcs.length > 0 && <TransferLog arcs={walletArcs} spawnIndex={spawnIndex} />}
        </>
      )}

      {!walletData && !walletLoading && !walletError && (
        <div className="flex-1 flex items-center justify-center p-5">
          <div className="text-center text-stone-400 text-[12px]">
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
  onTimelineSeek,
  stablecoinDateRange,
  stablecoinIsLive,
  onStablecoinDateRangeChange,
  spawnIndex,
}: SidebarProps) {
  const stablecoinSectionRef = useRef<HTMLDivElement>(null);
  const walletSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const scrollToSection = (view: ActiveView) => {
    onViewChange(view);
    const target =
      view === "stablecoins"
        ? stablecoinSectionRef.current
        : walletSectionRef.current;
    target?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="w-[360px] shrink-0 h-full bg-[#f5f0e8]/80 backdrop-blur-xl border-l border-stone-300/40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-300/40">
        <h1 className="text-[15px] font-semibold text-stone-800 tracking-tight">
          Follow the Money
        </h1>
        <p className="text-[11px] text-stone-400 mt-0.5">
          Stablecoin flows & wallet explorer
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-300/40">
        <button
          onClick={() => scrollToSection("stablecoins")}
          className={`flex-1 py-2.5 text-[11px] font-medium tracking-wide transition-colors ${
            activeView === "stablecoins"
              ? "text-stone-800 border-b-2 border-stone-800"
              : "text-stone-400 hover:text-stone-600"
          }`}
        >
          Stablecoins
          {stablecoinLoading && (
            <span className="inline-block w-2 h-2 ml-1.5 border border-stone-400 border-t-stone-600 rounded-full animate-spin align-middle" />
          )}
        </button>
        <button
          onClick={() => scrollToSection("wallet")}
          className={`flex-1 py-2.5 text-[11px] font-medium tracking-wide transition-colors ${
            activeView === "wallet"
              ? "text-stone-800 border-b-2 border-stone-800"
              : "text-stone-400 hover:text-stone-600"
          }`}
        >
          Wallet
          {walletLoading && (
            <span className="inline-block w-2 h-2 ml-1.5 border border-stone-400 border-t-stone-600 rounded-full animate-spin align-middle" />
          )}
        </button>
      </div>

      {/* Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Stablecoin section */}
        <div ref={stablecoinSectionRef} className="min-h-full flex flex-col">
          <div className="px-5 pt-4 pb-1">
            <div className={LABEL}>
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
            corridorLabel="Top Corridors"
            spawnIndex={activeView === "stablecoins" ? spawnIndex : 0}
          />
        </div>

        {/* Wallet section */}
        <div ref={walletSectionRef} className="min-h-full flex flex-col border-t border-stone-300/40">
          <div className="px-5 pt-4 pb-1">
            <div className={LABEL}>Wallet Explorer</div>
          </div>
          {walletData && !walletLoading && walletArcs.length > 0 && (
            <WalletTimeline
              timeline={walletTimeline}
              walletArcs={walletArcs}
              onPlayPause={onTimelinePlayPause}
              onRestart={onTimelineRestart}
              onSpeedChange={onTimelineSpeedChange}
              onSeek={onTimelineSeek}
            />
          )}
          <WalletPanel
            walletData={walletData}
            walletLoading={walletLoading}
            walletError={walletError}
            onWalletSearch={onWalletSearch}
            walletArcs={walletArcs}
            spawnIndex={activeView === "wallet" ? spawnIndex : 0}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-stone-300/40 text-center">
        <span className="text-[10px] text-stone-400 tracking-wide">
          Powered by Allium
        </span>
      </div>
    </div>
  );
}
