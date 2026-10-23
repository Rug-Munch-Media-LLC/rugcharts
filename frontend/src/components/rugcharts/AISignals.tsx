// AI Trade Signals panel.
//
// Data comes from the typed client (@/services/rugchartsApi) — never a raw
// fetch. Vocabulary, formatters and the payload normalizer live in signalMeta;
// one row renders as SignalCard. Export surface is unchanged: default panel +
// the AISignal type.

import { Brain } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchSignals } from '@/services/rugchartsApi'
import SignalCard from './SignalCard'
import { type AISignal, FILTER_TYPES, normalizeSignals, type SignalFilter, TYPE_META } from './signalMeta'

export type { AISignal } from './signalMeta'

interface AISignalsProps {
  chain: string
  tokenAddress: string
  initialSignals?: AISignal[]
  className?: string
}

const FILTER_BUTTON = 'flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider transition-colors'

function filterButtonClass(active: boolean): string {
  return `${FILTER_BUTTON} ${
    active ? 'bg-[#8B5CF6] text-white' : 'bg-[rgba(139,92,246,0.08)] text-[#5C6080] hover:text-[#F1F1F6]'
  }`
}

export default function AISignals({ chain, tokenAddress, initialSignals, className = '' }: AISignalsProps) {
  const [signals, setSignals] = useState<AISignal[]>(initialSignals || [])
  const [loading, setLoading] = useState(!initialSignals)
  const [filterType, setFilterType] = useState<SignalFilter>('all')
  const [minConfidence, setMinConfidence] = useState(0)

  useEffect(() => {
    if (initialSignals) {
      setSignals(initialSignals)
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const result = await fetchSignals(tokenAddress, chain)
      if (cancelled) return
      setSignals(normalizeSignals(result?.signals ?? result?.entries))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [chain, tokenAddress, initialSignals])

  // Stats: how many signals? win rate?
  const stats = {
    total: signals.length,
    hits: signals.filter((s) => s.outcome === 'hit').length,
    misses: signals.filter((s) => s.outcome === 'miss').length,
    pending: signals.filter((s) => s.outcome === 'pending' || !s.outcome).length,
  }
  const winRate = stats.hits + stats.misses > 0 ? (stats.hits / (stats.hits + stats.misses)) * 100 : 0
  const avgConfidence = signals.length > 0 ? signals.reduce((s, x) => s + x.confidence, 0) / signals.length : 0

  const filtered = signals
    .filter((s) => filterType === 'all' || s.type === filterType)
    .filter((s) => s.confidence >= minConfidence)
    .sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className={`bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.15)] bg-gradient-to-r from-[rgba(139,92,246,0.08)] to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#8B5CF6]" />
            <div>
              <h3 className="text-sm font-bold text-[#F1F1F6] uppercase tracking-wider">AI Trade Signals</h3>
              <p className="text-[10px] text-[#5C6080] mt-0.5">Pattern-matched entries, exits, and warnings</p>
            </div>
          </div>
          {signals.length > 0 && (
            <div className="text-right">
              <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Win rate</div>
              <div className="text-sm font-bold text-[#06D6A0]">
                {winRate > 0 ? `${winRate.toFixed(0)}%` : '—'}
                <span className="text-[10px] text-[#5C6080] ml-1">
                  ({stats.hits}/{stats.hits + stats.misses})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Stats bar */}
        {signals.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="bg-[rgba(255,255,255,0.02)] rounded px-2 py-1">
              <div className="text-[9px] text-[#5C6080] uppercase">Total</div>
              <div className="text-sm font-bold text-[#F1F1F6]">{stats.total}</div>
            </div>
            <div className="bg-[rgba(255,255,255,0.02)] rounded px-2 py-1">
              <div className="text-[9px] text-[#5C6080] uppercase">Pending</div>
              <div className="text-sm font-bold text-[#FFB800]">{stats.pending}</div>
            </div>
            <div className="bg-[rgba(255,255,255,0.02)] rounded px-2 py-1">
              <div className="text-[9px] text-[#5C6080] uppercase">Avg conf</div>
              <div className="text-sm font-bold text-[#8B5CF6]">{avgConfidence.toFixed(0)}%</div>
            </div>
          </div>
        )}
      </div>

      {/* Filter row */}
      <div className="px-4 py-2 border-b border-[rgba(139,92,246,0.08)] space-y-2">
        <div className="flex flex-wrap gap-1">
          {FILTER_TYPES.map((t) => {
            const Icon = t === 'all' ? null : TYPE_META[t].icon
            const count = t === 'all' ? signals.length : signals.filter((s) => s.type === t).length
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={filterButtonClass(filterType === t)}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {t}
                <span className="text-[9px] opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#5C6080]">
          <span>Min conf:</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="flex-1 accent-[#8B5CF6]"
          />
          <span className="font-mono text-[#F1F1F6] w-8 text-right">{minConfidence}%</span>
        </div>
      </div>

      {/* Signal list */}
      {loading ? (
        <div className="p-6 text-center text-[#5C6080] text-xs">Analyzing chart patterns...</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-[#5C6080] text-xs">
          No signals match filter. Try lowering confidence or different type.
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          {filtered.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  )
}
