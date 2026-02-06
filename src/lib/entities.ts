import { CHAIN_COORDS } from "./chains";
import type { EntityLabel } from "./types";

// ── CEX HQ coordinates ──

export const CEX_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  binance:    { lat: 35.9,  lng: 14.4,  label: "Binance (Malta)" },
  coinbase:   { lat: 37.77, lng: -122.4, label: "Coinbase (SF)" },
  kraken:     { lat: 37.77, lng: -122.4, label: "Kraken (SF)" },
  okx:        { lat: -4.68, lng: 55.49,  label: "OKX (Seychelles)" },
  bybit:      { lat: 25.2,  lng: 55.27,  label: "Bybit (Dubai)" },
  kucoin:     { lat: -4.68, lng: 55.49,  label: "KuCoin (Seychelles)" },
  gate:       { lat: 1.35,  lng: 103.82, label: "Gate.io (Singapore)" },
  "gate.io":  { lat: 1.35,  lng: 103.82, label: "Gate.io (Singapore)" },
  htx:        { lat: -4.68, lng: 55.49,  label: "HTX (Seychelles)" },
  huobi:      { lat: -4.68, lng: 55.49,  label: "Huobi (Seychelles)" },
  bitfinex:   { lat: 22.28, lng: 114.15, label: "Bitfinex (HK)" },
  gemini:     { lat: 40.71, lng: -74.01, label: "Gemini (NYC)" },
  bitstamp:   { lat: 46.05, lng: 14.51,  label: "Bitstamp (Ljubljana)" },
  bitget:     { lat: -4.68, lng: 55.49,  label: "Bitget (Seychelles)" },
  mexc:       { lat: 1.35,  lng: 103.82, label: "MEXC (Singapore)" },
  crypto_com: { lat: 1.35,  lng: 103.82, label: "Crypto.com (Singapore)" },
  "crypto.com": { lat: 1.35, lng: 103.82, label: "Crypto.com (Singapore)" },
  celsius:      { lat: 40.75, lng: -73.99, label: "Celsius (NYC)" },
  celsius_network: { lat: 40.75, lng: -73.99, label: "Celsius (NYC)" },
  alphapo:      { lat: 52.52, lng: 13.41, label: "AlphaPo (Berlin)" },
  bitvavo:      { lat: 52.37, lng: 4.90,  label: "Bitvavo (Amsterdam)" },
  revolut:      { lat: 51.51, lng: -0.13, label: "Revolut (London)" },
  coindcx:      { lat: 19.08, lng: 72.88, label: "CoinDCX (Mumbai)" },
  coinmetro:    { lat: 59.44, lng: 24.75, label: "Coinmetro (Tallinn)" },
  binance_us:   { lat: 37.77, lng: -122.4, label: "Binance US (SF)" },
  paxos:        { lat: 40.71, lng: -74.01, label: "Paxos (NYC)" },
  anchorage_digital: { lat: 37.77, lng: -122.4, label: "Anchorage (SF)" },
  lcx:          { lat: 47.14, lng: 9.52,  label: "LCX (Liechtenstein)" },
  oobit:        { lat: 32.07, lng: 34.77, label: "Oobit (Tel Aviv)" },
};

// ── Category → arc color ──

export const CATEGORY_COLORS: Record<string, string> = {
  cex:                   "#e74c3c",
  exchange:              "#e74c3c",
  lending_centralized:   "#e74c3c",
  dex:                   "#3498db",
  dex_aggregator:        "#3498db",
  dex_settler:           "#3498db",
  lending:               "#e67e22",
  lending_decentralized: "#e67e22",
  staking:               "#e67e22",
  yield:                 "#e67e22",
  cdp:                   "#e67e22",
  defi:                  "#e67e22",
  bridge:                "#9b59b6",
  rollup:                "#9b59b6",
  nft:                   "#1abc9c",
  gaming:                "#1abc9c",
  dao:                   "#2ecc71",
  fund:                  "#f39c12",
  fund_decentralized:    "#f39c12",
  market_maker:          "#f39c12",
  solvers:               "#3498db",
  hacker:                "#c0392b",
  mixer:                 "#c0392b",
  mev:                   "#8e44ad",
  liquid_staking:        "#e67e22",
  stablecoin:            "#7a9e8f",
  meme:                  "#1abc9c",
  native_transfer:       "#95a5a6",
  real_world_assets:     "#f39c12",
  developer_tools:       "#95a5a6",
  misc:                  "#95a5a6",
  contract:              "#95a5a6",
  unknown:               "#7f8c8d",
};

// ── Deterministic hash for address → angle ──

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Radius offset by category ──

const CATEGORY_RADIUS: Record<string, number> = {
  dex:                   3,
  dex_aggregator:        3,
  dex_settler:           3,
  solvers:               3,
  lending:               4,
  lending_decentralized: 4,
  lending_centralized:   4,
  bridge:                5,
  rollup:                5,
  nft:                   6,
  gaming:                6,
  dao:                   7,
  fund:                  4,
  fund_decentralized:    4,
  market_maker:          4,
  staking:               4,
  yield:                 4,
  cdp:                   4,
  defi:                  4,
  hacker:                8,
  mixer:                 8,
  mev:                   3,
  liquid_staking:        4,
  stablecoin:            3,
  meme:                  6,
  real_world_assets:     5,
};

/**
 * Resolve a counterparty address to a geographic position for the globe.
 *
 * Resolution order:
 * 1. CEX with known HQ → use CEX_COORDS
 * 2. Has chain in CHAIN_COORDS → chain coords + deterministic offset
 * 3. Fallback → hash-based position
 */
export function resolveCounterpartyPosition(
  address: string,
  chain: string,
  entity: EntityLabel | null
): { lat: number; lng: number; label: string } {
  // 1. CEX with known HQ
  if (entity) {
    const project = entity.project?.toLowerCase().replace(/[\s.]/g, "_") ?? "";
    const category = entity.category?.toLowerCase() ?? "";

    if (category === "cex" || category === "exchange") {
      const rawProject = entity.project?.toLowerCase() ?? "";
      const cex = CEX_COORDS[project] || CEX_COORDS[rawProject];
      if (cex) return cex;
    }
  }

  // 2. Chain coords + deterministic offset
  const chainInfo = CHAIN_COORDS[chain.toLowerCase()];
  if (chainInfo) {
    const hash = simpleHash(address);
    const angle = (hash % 360) * (Math.PI / 180);
    const category = entity?.category?.toLowerCase() ?? "unknown";
    const radius = CATEGORY_RADIUS[category] ?? 10;

    return {
      lat: chainInfo.lat + Math.cos(angle) * radius,
      lng: chainInfo.lng + Math.sin(angle) * radius,
      label: entity?.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
    };
  }

  // 3. Fallback: hash-based position
  const hash = simpleHash(address);
  const lat = ((hash % 1800) / 10) - 90;
  const lng = (((hash >> 8) % 3600) / 10) - 180;
  return {
    lat,
    lng,
    label: entity?.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
  };
}
