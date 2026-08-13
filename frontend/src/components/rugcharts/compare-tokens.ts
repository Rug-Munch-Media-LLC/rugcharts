export interface ComparisonToken {
  chain: string
  address: string
  symbol: string
  name?: string
  price_usd: number
  price_change_24h: number
  volume_24h: number
  liquidity_usd: number
  holder_count: number
  top_holder_pct: number
  risk_score: number
  risk_level?: string
  market_cap?: number
  age_hours?: number
}

export interface ChainMeta {
  name: string
  color: string
  icon: string
}

export const CHAIN_META: Record<string, ChainMeta> = {
  solana: { name: 'Solana', color: '#9945FF', icon: '◎' },
  ethereum: { name: 'Ethereum', color: '#627EEA', icon: 'Ξ' },
  base: { name: 'Base', color: '#0052FF', icon: '⊙' },
  bsc: { name: 'BSC', color: '#F0B90B', icon: '⬡' },
  arbitrum: { name: 'Arbitrum', color: '#28A0F0', icon: '◆' },
  optimism: { name: 'Optimism', color: '#FF0420', icon: '⬢' },
  polygon: { name: 'Polygon', color: '#8247E5', icon: '⬣' },
}

export const EXPLORERS: Record<string, string> = {
  solana: 'https://dexscreener.com/solana/',
  ethereum: 'https://dexscreener.com/ethereum/',
  base: 'https://dexscreener.com/base/',
  bsc: 'https://dexscreener.com/bsc/',
  arbitrum: 'https://dexscreener.com/arbitrum/',
  optimism: 'https://dexscreener.com/optimism/',
  polygon: 'https://dexscreener.com/polygon/',
}

export interface WinnerScore {
  score: number
  reasons: string[]
}

// Smart scoring: composite of safety, momentum, distribution
export function computeWinnerScore(t: ComparisonToken): WinnerScore {
  let score = 0
  const reasons: string[] = []

  // Risk score (lower is better) → +50 if low risk
  if (t.risk_score < 30) {
    score += 50
    reasons.push('Low risk (+50)')
  } else if (t.risk_score < 60) {
    score += 25
    reasons.push('Medium risk (+25)')
  } else {
    reasons.push('High risk (0)')
  }

  // Holder distribution (lower top holder % = healthier)
  if (t.top_holder_pct < 10) {
    score += 30
    reasons.push('Decentralized holders (+30)')
  } else if (t.top_holder_pct < 25) {
    score += 15
    reasons.push('Moderate concentration (+15)')
  } else {
    reasons.push('Concentrated (0)')
  }

  // Liquidity depth (higher = safer)
  if (t.liquidity_usd > 100000) {
    score += 20
    reasons.push('Deep liquidity (+20)')
  } else if (t.liquidity_usd > 10000) {
    score += 10
    reasons.push('Adequate liquidity (+10)')
  } else {
    reasons.push('Thin liquidity (0)')
  }

  // Volume trend (positive = momentum)
  if (t.price_change_24h > 10) {
    score += 15
    reasons.push('Strong momentum (+15)')
  } else if (t.price_change_24h > 0) {
    score += 8
    reasons.push('Mild momentum (+8)')
  } else if (t.price_change_24h > -10) {
    reasons.push('Slight decline (0)')
  } else {
    reasons.push('Heavy dump (0)')
  }

  return { score, reasons }
}

/** "$" + price, using exponential notation below $0.01 and 4 decimals below $1. */
export function formatPrice(usd: number): string {
  if (usd < 0.01) return `$${usd.toExponential(2)}`
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

/** "$" + integer with thousands separators. */
export function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/** Integer with thousands separators. */
export function formatNumber(n: number): string {
  return n.toLocaleString()
}
