export interface StablecoinFlow {
  from_country: string;
  to_country: string;
  token_symbol: string;
  transfer_count: number;
  total_usd: number;
  last_seen: string;
}

export interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  stroke: number;
  label: string;
  totalUsd: number;
  tokenSymbol: string;
  fromCountry: string;
  toCountry: string;
  transferCount: number;
  dashOffset: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface BridgeFlow {
  source_chain: string;
  destination_chain: string;
  token_symbol: string;
  transfer_count: number;
  total_usd: number;
}

export interface CountryCoord {
  lat: number;
  lng: number;
}

// ── Wallet Explorer types ──

export interface WalletAssetTransfer {
  transfer_type: string;
  from_address: string;
  to_address: string;
  asset: {
    type: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  amount: {
    amount: number | string;
    amount_str?: string;
    raw_amount?: string;
  };
}

export interface WalletTransaction {
  hash: string;
  chain: string;
  block_timestamp: string;
  from_address: string;
  to_address: string;
  labels: string[];
  asset_transfers: WalletAssetTransfer[];
}

export interface EntityLabel {
  chain: string;
  address: string;
  category: string;
  project: string;
  name: string;
}

export interface EnrichedCounterparty {
  address: string;
  chain: string;
  entity: EntityLabel | null;
  totalSent: number;
  totalReceived: number;
  transferCount: number;
  tokens: string[];
  firstSeen?: string;
}

export interface WalletData {
  address: string;
  chain: string;
  transactions: WalletTransaction[];
  counterparties: EnrichedCounterparty[];
}
