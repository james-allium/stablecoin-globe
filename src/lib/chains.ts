export interface ChainInfo {
  lat: number;
  lng: number;
  color: string;
  label: string;
}

/**
 * ~30 chains evenly distributed across the globe for visual balance.
 * Colors match common chain branding where possible.
 */
export const CHAIN_COORDS: Record<string, ChainInfo> = {
  // North America
  ethereum:    { lat: 40.7,  lng: -74.0,  color: "#627EEA", label: "Ethereum" },
  base:        { lat: 37.8,  lng: -122.4, color: "#0052FF", label: "Base" },
  arbitrum:    { lat: 33.4,  lng: -112.1, color: "#28A0F0", label: "Arbitrum" },
  optimism:    { lat: 47.6,  lng: -122.3, color: "#FF0420", label: "Optimism" },
  solana:      { lat: 25.8,  lng: -80.2,  color: "#00FFA3", label: "Solana" },

  // South America
  polygon:     { lat: -23.5, lng: -46.6,  color: "#8247E5", label: "Polygon" },
  avalanche:   { lat: -34.6, lng: -58.4,  color: "#E84142", label: "Avalanche" },

  // Europe
  zksync:      { lat: 48.9,  lng: 2.35,   color: "#4E529A", label: "zkSync" },
  linea:       { lat: 51.5,  lng: -0.12,  color: "#61DFFF", label: "Linea" },
  scroll:      { lat: 52.5,  lng: 13.4,   color: "#FFEEDA", label: "Scroll" },
  starknet:    { lat: 41.9,  lng: 12.5,   color: "#EC796B", label: "Starknet" },
  gnosis:      { lat: 59.3,  lng: 18.1,   color: "#04795B", label: "Gnosis" },
  mantle:      { lat: 46.2,  lng: 6.1,    color: "#000000", label: "Mantle" },

  // Africa
  celo:        { lat: 6.5,   lng: 3.4,    color: "#FCFF52", label: "Celo" },
  fantom:      { lat: -1.3,  lng: 36.8,   color: "#1969FF", label: "Fantom" },
  sonic:       { lat: -33.9, lng: 18.4,   color: "#5B6DEF", label: "Sonic" },

  // Middle East / Central Asia
  sei:         { lat: 25.3,  lng: 55.3,   color: "#9B1B1B", label: "Sei" },
  bsc:         { lat: 41.0,  lng: 29.0,   color: "#F3BA2F", label: "BNB Chain" },

  // East / Southeast Asia
  sui:         { lat: 1.35,  lng: 103.8,  color: "#6FBCF0", label: "Sui" },
  aptos:       { lat: 35.7,  lng: 139.7,  color: "#2DD8A3", label: "Aptos" },
  near:        { lat: 37.6,  lng: 127.0,  color: "#00C08B", label: "NEAR" },
  ton:         { lat: 22.3,  lng: 114.2,  color: "#0098EA", label: "TON" },
  kaia:        { lat: 13.8,  lng: 100.5,  color: "#BFF009", label: "Kaia" },
  tron:        { lat: 31.2,  lng: 121.5,  color: "#FF0013", label: "Tron" },

  // Oceania
  moonbeam:    { lat: -33.9, lng: 151.2,  color: "#53CBC9", label: "Moonbeam" },
  manta:       { lat: -41.3, lng: 174.8,  color: "#1A6BEF", label: "Manta" },

  // Additional chains (spread into less dense regions)
  blast:       { lat: 64.1,  lng: -21.9,  color: "#FCFC03", label: "Blast" },
  mode:        { lat: 55.7,  lng: 37.6,   color: "#DFFE00", label: "Mode" },
  taiko:       { lat: 60.2,  lng: 24.9,   color: "#E81899", label: "Taiko" },
  hyperliquid: { lat: -8.7,  lng: 115.2,  color: "#6CFFB4", label: "Hyperliquid" },

  // Aliases for data variations
  polygon_zkevm: { lat: -15.8, lng: -48.0, color: "#8247E5", label: "Polygon zkEVM" },
  plasma:      { lat: 19.4,  lng: -99.1,  color: "#627EEA", label: "Plasma" },
  unichain:    { lat: 45.5,  lng: -73.6,  color: "#FF007A", label: "Unichain" },
  worldchain:  { lat: 48.2,  lng: 16.4,   color: "#000000", label: "Worldchain" },
  soneium:     { lat: 34.7,  lng: 135.5,  color: "#6B4EFF", label: "Soneium" },
  immutable:   { lat: -27.5, lng: 153.0,  color: "#24B8FF", label: "Immutable" },
};
