// Presentation helpers for the trending board. Pure functions, no React.
import type { TrendingItem } from '@/services/trendingApi'

/** Shown via title/aria on every em dash so a gap always has a stated reason. */
export const MISSING_REASON = 'Not reported by this source'

export const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'SUSD'])

export const CHAIN_META: Record<string, { icon: string; label: string; color: string }> = {
  solana: { icon: '◎', label: 'Solana', color: '#14F195' },
  ethereum: { icon: 'Ξ', label: 'Ethereum', color: '#A78BFA' },
  base: { icon: '◈', label: 'Base', color: '#3B82F6' },
  bsc: { icon: '⬢', label: 'BNB', color: '#F0B90B' },
  arbitrum: { icon: '◭', label: 'Arbitrum', color: '#22D3EE' },
  tron: { icon: '⟁', label: 'Tron', color: '#FF3366' },
}

export function chainMeta(chain: string) {
  return CHAIN_META[chain] ?? { icon: '◈', label: chain, color: '#5C6080' }
}

export function formatPrice(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.0001) return `$${value.toExponential(2)}`
  if (value < 0.01) return `$${value.toFixed(6)}`
  if (value < 1) return `$${value.toFixed(4)}`
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`
}

export function formatCount(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(Math.round(value))
}

export function shortToken(token: string): string {
  return token.length <= 12 ? token : `${token.slice(0, 6)}…${token.slice(-4)}`
}

export function isStablecoin(symbol: string | null): boolean {
  return symbol ? STABLECOINS.has(symbol.toUpperCase()) : false
}

export type RiskBand = 'low' | 'elevated' | 'high'

export function riskBand(score: number): RiskBand {
  if (score < 30) return 'low'
  if (score < 60) return 'elevated'
  return 'high'
}

export const RISK_COPY: Record<RiskBand, { label: string; className: string }> = {
  low: { label: 'Low risk', className: 'bg-[rgba(6,214,160,0.15)] text-[#06D6A0]' },
  elevated: { label: 'Elevated', className: 'bg-[rgba(255,184,0,0.15)] text-[#FFB800]' },
  high: { label: 'High risk', className: 'bg-[rgba(255,51,102,0.15)] text-[#FF3366]' },
}

export function itemTitle(item: TrendingItem): string {
  return item.symbol ?? item.name ?? shortToken(item.token)
}
