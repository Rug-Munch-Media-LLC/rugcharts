// Signal vocabulary for the AI Trade Signals panel.
//
// Owns the AISignal shape, per-type presentation meta, the formatters and the
// normalizer that maps the live /api/v1/rugcharts/signals payload onto the
// component shape. Pure data + pure functions: no JSX, no fetching.

import { Activity, AlertTriangle, type LucideIcon, Target, TrendingDown, TrendingUp } from 'lucide-react'
import type { SignalEntry } from '@/services/rugchartsApi'

export type SignalType = 'buy' | 'sell' | 'warning' | 'opportunity' | 'exit'
export type SignalOutcome = 'hit' | 'miss' | 'pending'

export interface AISignal {
  id: string
  type: SignalType
  timestamp: number
  price_at_signal: number
  confidence: number // 0-100
  title: string
  reasoning: string
  indicators: string[]
  target_price?: number
  stop_loss?: number
  timeframe?: string
  outcome?: SignalOutcome
  actual_price?: number
}

export interface SignalTypeMeta {
  color: string
  bg: string
  icon: LucideIcon
  label: string
  arrow: string
}

export const TYPE_META: Record<SignalType, SignalTypeMeta> = {
  buy: { color: '#06D6A0', bg: 'rgba(6,214,160,0.15)', icon: TrendingUp, label: 'BUY', arrow: '\u2191' },
  sell: { color: '#FF3366', bg: 'rgba(255,51,102,0.15)', icon: TrendingDown, label: 'SELL', arrow: '\u2193' },
  warning: { color: '#FFB800', bg: 'rgba(255,184,0,0.15)', icon: AlertTriangle, label: 'WARNING', arrow: '!' },
  opportunity: { color: '#22D3EE', bg: 'rgba(34,211,238,0.15)', icon: Target, label: 'OPPORTUNITY', arrow: '\u25c6' },
  exit: { color: '#FF8C42', bg: 'rgba(255,140,66,0.15)', icon: Activity, label: 'EXIT', arrow: '\u23cf' },
}

export const SIGNAL_TYPES: readonly SignalType[] = ['buy', 'sell', 'warning', 'opportunity', 'exit']

export const FILTER_TYPES = ['all', ...SIGNAL_TYPES] as const
export type SignalFilter = (typeof FILTER_TYPES)[number]

export function isSignalType(value: unknown): value is SignalType {
  return typeof value === 'string' && (SIGNAL_TYPES as readonly string[]).includes(value)
}

export function isSignalOutcome(value: unknown): value is SignalOutcome {
  return value === 'hit' || value === 'miss' || value === 'pending'
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 75) return '#06D6A0'
  if (confidence >= 50) return '#FFB800'
  return '#FF8C42'
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() / 1000 - timestamp
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function formatPrice(value: number | undefined): string {
  if (value === undefined) return '?'
  if (value < 0.0001) return `$${value.toExponential(2)}`
  if (value < 1) return `$${value.toFixed(6)}`
  return `$${value.toFixed(4)}`
}

/** Normalize the live signals feed onto the panel shape. Unknown types fall
 * back to `buy` so a TYPE_META lookup can never miss. */
export function normalizeSignals(raw: SignalEntry[] | undefined): AISignal[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry, index) => ({
    id: entry.id || String(index),
    type: isSignalType(entry.type) ? entry.type : isSignalType(entry.signal_type) ? entry.signal_type : 'buy',
    timestamp: Number(entry.timestamp || entry.time || Date.now() / 1000),
    price_at_signal: Number(entry.price_at_signal || entry.price || 0),
    confidence: Number(entry.confidence || entry.score || 50),
    title: entry.title || entry.summary || '',
    reasoning: entry.reasoning || entry.reason || '',
    indicators: Array.isArray(entry.indicators) ? entry.indicators : entry.indicator ? [entry.indicator] : [],
    target_price: entry.target_price || entry.target,
    stop_loss: entry.stop_loss || entry.stop,
    timeframe: entry.timeframe || entry.horizon,
    outcome: isSignalOutcome(entry.outcome) ? entry.outcome : undefined,
    actual_price: entry.actual_price,
  }))
}
