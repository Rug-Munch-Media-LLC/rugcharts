import { Activity, AlertTriangle, Brain, Clock, Target, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface AISignal {
  id: string
  type: 'buy' | 'sell' | 'warning' | 'opportunity' | 'exit'
  timestamp: number
  price_at_signal: number
  confidence: number // 0-100
  title: string
  reasoning: string
  indicators: string[]
  target_price?: number
  stop_loss?: number
  timeframe?: string
  outcome?: 'hit' | 'miss' | 'pending'
  actual_price?: number
}

interface AISignalsProps {
  chain: string
  tokenAddress: string
  initialSignals?: AISignal[]
  className?: string
}

const TYPE_META: Record<AISignal['type'], { color: string; bg: string; icon: any; label: string; arrow: string }> = {
  buy: { color: '#06D6A0', bg: 'rgba(6,214,160,0.15)', icon: TrendingUp, label: 'BUY', arrow: '↑' },
  sell: { color: '#FF3366', bg: 'rgba(255,51,102,0.15)', icon: TrendingDown, label: 'SELL', arrow: '↓' },
  warning: { color: '#FFB800', bg: 'rgba(255,184,0,0.15)', icon: AlertTriangle, label: 'WARNING', arrow: '!' },
  opportunity: { color: '#22D3EE', bg: 'rgba(34,211,238,0.15)', icon: Target, label: 'OPPORTUNITY', arrow: '◆' },
  exit: { color: '#FF8C42', bg: 'rgba(255,140,66,0.15)', icon: Activity, label: 'EXIT', arrow: '⏏' },
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatPrice(n: number | undefined): string {
  if (n === undefined) return '?'
  if (n < 0.0001) return `$${n.toExponential(2)}`
  if (n < 1) return `$${n.toFixed(6)}`
  return `$${n.toFixed(4)}`
}

export default function AISignals({ chain, tokenAddress, initialSignals, className = '' }: AISignalsProps) {
  const [signals, setSignals] = useState<AISignal[]>(initialSignals || [])
  const [loading, setLoading] = useState(!initialSignals)
  const [filterType, setFilterType] = useState<'all' | AISignal['type']>('all')
  const [minConfidence, setMinConfidence] = useState(0)

  useEffect(() => {
    if (initialSignals) {
      setSignals(initialSignals)
      setLoading(false)
      return
    }
    const fetchSignals = async () => {
      try {
        const res = await fetch(`/api/v1/rugcharts/signals/${encodeURIComponent(tokenAddress)}?chain=${chain}`)
        if (res.ok) {
          const data = await res.json()
          const raw = data.signals || data.entries || []
          setSignals(
            raw.map((s: any, i: number) => ({
              id: s.id || String(i),
              type: s.type || s.signal_type || 'buy',
              timestamp: Number(s.timestamp || s.time || Date.now() / 1000),
              price_at_signal: Number(s.price_at_signal || s.price || 0),
              confidence: Number(s.confidence || s.score || 50),
              title: s.title || s.summary || '',
              reasoning: s.reasoning || s.reason || '',
              indicators: Array.isArray(s.indicators) ? s.indicators : s.indicator ? [s.indicator] : [],
              target_price: s.target_price || s.target,
              stop_loss: s.stop_loss || s.stop,
              timeframe: s.timeframe || s.horizon,
              outcome: s.outcome,
              actual_price: s.actual_price,
            })),
          )
        }
      } catch (e) {
        console.error('[AISignals] fetch failed:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchSignals()
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
          {(['all', 'buy', 'sell', 'warning', 'opportunity', 'exit'] as const).map((t) => {
            const meta = t === 'all' ? null : TYPE_META[t]
            const count = t === 'all' ? signals.length : signals.filter((s) => s.type === t).length
            return (
              <button
                key={t}
                onClick={() => setFilterType(t as any)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider transition-colors ${
                  filterType === t
                    ? 'bg-[#8B5CF6] text-white'
                    : 'bg-[rgba(139,92,246,0.08)] text-[#5C6080] hover:text-[#F1F1F6]'
                }`}
              >
                {meta && <meta.icon className="w-3 h-3" />}
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
          {filtered.map((sig) => {
            const meta = TYPE_META[sig.type]
            const _Icon = meta.icon
            const confColor = sig.confidence >= 75 ? '#06D6A0' : sig.confidence >= 50 ? '#FFB800' : '#FF8C42'
            return (
              <div
                key={sig.id}
                className="px-4 py-3 border-b border-[rgba(139,92,246,0.04)] hover:bg-[rgba(139,92,246,0.04)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Arrow indicator */}
                  <div
                    className="flex flex-col items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    <span className="text-2xl font-bold leading-none">{meta.arrow}</span>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: meta.color, background: meta.bg }}
                      >
                        {meta.label}
                      </span>
                      {sig.timeframe && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[rgba(139,92,246,0.1)] text-[#8B5CF6] font-mono">
                          {sig.timeframe}
                        </span>
                      )}
                      <span className="text-[10px] text-[#5C6080] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTimeAgo(sig.timestamp)}
                      </span>
                    </div>

                    {sig.title && <div className="text-[12px] font-semibold text-[#F1F1F6] mt-1">{sig.title}</div>}
                    {sig.reasoning && (
                      <div className="text-[10px] text-[#5C6080] mt-1 line-clamp-3">{sig.reasoning}</div>
                    )}

                    {/* Indicators */}
                    {sig.indicators.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {sig.indicators.slice(0, 4).map((ind, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-[rgba(139,92,246,0.08)] text-[#8B5CF6] font-mono"
                          >
                            {ind}
                          </span>
                        ))}
                        {sig.indicators.length > 4 && (
                          <span className="text-[9px] text-[#5C6080]">+{sig.indicators.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Price targets */}
                    {(sig.target_price || sig.stop_loss) && (
                      <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                        {sig.target_price && (
                          <span className="flex items-center gap-1 text-[#06D6A0]">
                            <Target className="w-3 h-3" />
                            TP {formatPrice(sig.target_price)}
                          </span>
                        )}
                        {sig.stop_loss && (
                          <span className="flex items-center gap-1 text-[#FF3366]">
                            <Zap className="w-3 h-3" />
                            SL {formatPrice(sig.stop_loss)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confidence + outcome */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-[9px] text-[#5C6080] uppercase">Conf</div>
                    <div className="text-base font-bold" style={{ color: confColor }}>
                      {sig.confidence}%
                    </div>
                    {sig.outcome && sig.outcome !== 'pending' && (
                      <div
                        className={`text-[9px] font-bold uppercase mt-0.5 ${
                          sig.outcome === 'hit' ? 'text-[#06D6A0]' : 'text-[#FF3366]'
                        }`}
                      >
                        {sig.outcome}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
