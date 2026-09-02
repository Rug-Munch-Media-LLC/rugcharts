import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import AISignals from '@/components/rugcharts/AISignals'
import LiveTradeTape from '@/components/rugcharts/LiveTradeTape'
import RugPullWarning from '@/components/rugcharts/RugPullWarning'
import ScamRiskMeter from '@/components/rugcharts/ScamRiskMeter'
import TaCandleChart from '@/components/rugcharts/TaCandleChart'
import { useLiveTrades } from '@/hooks/useLiveTrades'
import { fetchOhlcv, type OhlcvCandle } from '@/services/rugchartsApi'

/**
 * TokenDetailPage — the full token intelligence view.
 *
 * Assembles the existing RugCharts components against the live backend:
 *   - TaCandleChart  ← /api/v1/rugcharts/ohlcv/{chain}/{pair}
 *   - ScamRiskMeter  ← /api/v1/rugcharts/intel/{chain}/{pair}
 *   - RugPullWarning ← /api/v1/rugcharts/intel/{chain}/{pair}
 *   - AISignals      ← /api/v1/rugcharts/signals/{token}?chain=
 *   - LiveTradeTape  ← useLiveTrades (5s polling; WS when backend ships it)
 */
export default function TokenDetailPage() {
  const { chain = 'solana', address = '' } = useParams<{ chain: string; address: string }>()

  const ohlcv = useQuery({
    queryKey: ['ohlcv', chain, address],
    queryFn: () => fetchOhlcv(chain, address, '1h', 240),
    staleTime: 60_000,
    enabled: Boolean(chain && address),
  })

  const { trades, connected } = useLiveTrades(chain, address, 5000)

  const candles: OhlcvCandle[] = ohlcv.data?.candles ?? []
  const pairInfo = (ohlcv.data?.pair_info ?? {}) as Record<string, unknown>
  const symbol = (pairInfo.name as string) || address.slice(0, 8)
  const ticker = symbol.includes('/') ? symbol : `${symbol}/USDC`

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-1 text-xs text-[#5C6080] hover:text-[#8B5CF6] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#5C6080] uppercase tracking-wider text-xs">{chain}</span>
          <span className="text-[#5C6080]">/</span>
          <span className="font-mono text-[#F1F1F6]">
            {address.slice(0, 8)}…{address.slice(-4)}
          </span>
        </div>
      </div>

      {/* Header stats */}
      <div className="bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#F1F1F6]">{symbol}</h2>
            <div className="text-[10px] text-[#5C6080] font-mono mt-0.5">{address}</div>
          </div>
          {ohlcv.data?.summary && (
            <div className="flex gap-6 text-right">
              <div>
                <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Price</div>
                <div className="text-lg font-bold text-[#F1F1F6] font-mono">
                  ${Number(ohlcv.data.summary.current_price ?? 0).toFixed(6)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">24h</div>
                <div
                  className={`text-lg font-bold font-mono ${
                    Number(ohlcv.data.summary.price_change_pct ?? 0) >= 0 ? 'text-[#06D6A0]' : 'text-[#FF3366]'
                  }`}
                >
                  {Number(ohlcv.data.summary.price_change_pct ?? 0) >= 0 ? '+' : ''}
                  {Number(ohlcv.data.summary.price_change_pct ?? 0).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Volume</div>
                <div className="text-lg font-bold text-[#F1F1F6] font-mono">
                  ${Number(ohlcv.data.summary.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risk + Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ScamRiskMeter chain={chain} tokenAddress={address} />
        <RugPullWarning chain={chain} tokenAddress={address} />
      </div>

      {/* Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Technical Analysis</h3>
          <span className="text-xs text-text-muted">EMA · MACD · RSI — computed in-browser</span>
        </div>
        {ohlcv.isLoading ? (
          <div className="flex items-center justify-center h-[460px] rounded-xl border border-white/10 bg-[#0d0d15]">
            <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" />
          </div>
        ) : candles.length === 0 ? (
          <div className="flex items-center justify-center h-[460px] rounded-xl border border-white/10 bg-[#0d0d15] text-[#5C6080] text-sm">
            No OHLCV data available for this pair.
          </div>
        ) : (
          <TaCandleChart data={candles} ticker={ticker} />
        )}
      </div>

      {/* Signals + Trade tape */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AISignals chain={chain} tokenAddress={address} />
        <LiveTradeTape chain={chain} tokenAddress={address} initialTrades={trades} />
      </div>

      {connected && (
        <p className="text-[10px] text-[#5C6080] text-center">
          Trade tape polling every 5s (WebSocket stream not yet available on the backend).
        </p>
      )}
    </div>
  )
}
