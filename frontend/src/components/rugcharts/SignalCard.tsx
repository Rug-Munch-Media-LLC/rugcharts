// One AI Trade Signal row: arrow badge, type/timeframe chips, reasoning,
// indicators, take-profit / stop-loss and the confidence readout.
// Presentation only — filtering, fetching and stats live in AISignals.

import { Clock, Target, Zap } from 'lucide-react'
import { type AISignal, confidenceColor, formatPrice, formatTimeAgo, TYPE_META } from './signalMeta'

interface SignalCardProps {
  signal: AISignal
  className?: string
}

const INDICATOR_CHIP = 'px-1.5 py-0.5 rounded text-[9px] bg-[rgba(139,92,246,0.08)] text-[#8B5CF6] font-mono'

export default function SignalCard({ signal, className = '' }: SignalCardProps) {
  const meta = TYPE_META[signal.type]
  const visibleIndicators = signal.indicators.slice(0, 4)
  const hiddenCount = signal.indicators.length - visibleIndicators.length

  return (
    <div
      className={`px-4 py-3 border-b border-[rgba(139,92,246,0.04)] hover:bg-[rgba(139,92,246,0.04)] transition-colors ${className}`}
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
            {signal.timeframe && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[rgba(139,92,246,0.1)] text-[#8B5CF6] font-mono">
                {signal.timeframe}
              </span>
            )}
            <span className="text-[10px] text-[#5C6080] flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {formatTimeAgo(signal.timestamp)}
            </span>
          </div>

          {signal.title && <div className="text-[12px] font-semibold text-[#F1F1F6] mt-1">{signal.title}</div>}
          {signal.reasoning && <div className="text-[10px] text-[#5C6080] mt-1 line-clamp-3">{signal.reasoning}</div>}

          {/* Indicators */}
          {visibleIndicators.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {visibleIndicators.map((indicator) => (
                <span key={`${signal.id}-${indicator}`} className={INDICATOR_CHIP}>
                  {indicator}
                </span>
              ))}
              {hiddenCount > 0 && <span className="text-[9px] text-[#5C6080]">+{hiddenCount}</span>}
            </div>
          )}

          {/* Price targets */}
          {(signal.target_price || signal.stop_loss) && (
            <div className="flex items-center gap-3 mt-1.5 text-[10px]">
              {signal.target_price && (
                <span className="flex items-center gap-1 text-[#06D6A0]">
                  <Target className="w-3 h-3" />
                  TP {formatPrice(signal.target_price)}
                </span>
              )}
              {signal.stop_loss && (
                <span className="flex items-center gap-1 text-[#FF3366]">
                  <Zap className="w-3 h-3" />
                  SL {formatPrice(signal.stop_loss)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Confidence + outcome */}
        <div className="text-right flex-shrink-0">
          <div className="text-[9px] text-[#5C6080] uppercase">Conf</div>
          <div className="text-base font-bold" style={{ color: confidenceColor(signal.confidence) }}>
            {signal.confidence}%
          </div>
          {signal.outcome && signal.outcome !== 'pending' && (
            <div
              className={`text-[9px] font-bold uppercase mt-0.5 ${
                signal.outcome === 'hit' ? 'text-[#06D6A0]' : 'text-[#FF3366]'
              }`}
            >
              {signal.outcome}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
