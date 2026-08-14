import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo } from 'react'
import { BrowserRouter } from 'react-router-dom'
import AISignals from './components/rugcharts/AISignals'
import LiveTradeTape from './components/rugcharts/LiveTradeTape'
import MultiChainCompare from './components/rugcharts/MultiChainCompare'
import RugChartsPluginViewer from './components/rugcharts/PluginViewer'
import RugPullWarning from './components/rugcharts/RugPullWarning'
import ScamRiskMeter from './components/rugcharts/ScamRiskMeter'
import TaCandleChart from './components/rugcharts/TaCandleChart'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

const DEMO_CHAIN = 'solana'
const DEMO_TOKEN = 'So11111111111111111111111111111111111111112'

/** Deterministic random-walk OHLCV series for the demo TA candle chart. */
function makeDemoCandles(count: number) {
  const candles = []
  // Non-zero seed: 0 is a fixed point of xorshift32.
  let seed = 0x9e3779b9
  const next = () => {
    // xorshift32 — deterministic across renders, no Math.random
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4294967296
  }
  let close = 140
  const start = Date.now() - count * 86_400_000
  for (let i = 0; i < count; i++) {
    const drift = (next() - 0.48) * 0.06
    const open = close
    close = open * (1 + drift)
    const high = Math.max(open, close) * (1 + next() * 0.02)
    const low = Math.min(open, close) * (1 - next() * 0.02)
    candles.push({
      timestamp: start + i * 86_400_000,
      open,
      high,
      low,
      close,
      volume: Math.round(1_000_000 + next() * 4_000_000),
    })
  }
  return candles
}

export default function App() {
  const demoCandles = useMemo(() => makeDemoCandles(240), [])
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-surface-900 text-text-primary">
          <header className="border-b border-[rgba(139,92,246,0.1)] px-4 py-3">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center text-white font-bold text-sm">
                  RC
                </div>
                <h1 className="text-lg font-bold tracking-tight">RugCharts</h1>
              </div>
              <nav className="flex items-center gap-4 text-sm text-text-secondary">
                <span className="text-xs uppercase tracking-wider font-semibold">Demo Mode</span>
              </nav>
            </div>
          </header>

          <main className="max-w-7xl mx-auto p-4 space-y-6">
            {/* Top: ScamRiskMeter + RugPullWarning */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ScamRiskMeter
                chain={DEMO_CHAIN}
                tokenAddress={DEMO_TOKEN}
                riskFactors={[
                  {
                    category: 'liquidity',
                    severity: 'low',
                    title: 'LP Locked',
                    description: 'Liquidity is locked for 12 months',
                  },
                  {
                    category: 'contract',
                    severity: 'medium',
                    title: 'Mint Enabled',
                    description: 'Owner can mint new tokens (not renounced)',
                  },
                  {
                    category: 'holder',
                    severity: 'low',
                    title: 'Distribution',
                    description: 'Top 10 hold 8.2% — healthy',
                  },
                ]}
              />
              <RugPullWarning
                chain={DEMO_CHAIN}
                tokenAddress={DEMO_TOKEN}
                initialWarnings={[
                  {
                    id: '1',
                    level: 'CAUTION',
                    category: 'contract',
                    title: 'Contract Not Renounced',
                    description: 'Owner retains mint authority and can modify contract parameters.',
                    confidence: 55,
                    detected_at: Date.now() / 1000,
                    recommended_action: 'Monitor contract for changes',
                  },
                ]}
              />
            </div>

            {/* Live Trade Tape */}
            <LiveTradeTape chain={DEMO_CHAIN} tokenAddress={DEMO_TOKEN} initialTrades={[]} />

            {/* AI Signals + Plugin Viewer */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AISignals
                chain={DEMO_CHAIN}
                tokenAddress={DEMO_TOKEN}
                initialSignals={[
                  {
                    id: 's1',
                    type: 'buy',
                    timestamp: Date.now() / 1000 - 3600,
                    price_at_signal: 142.5,
                    confidence: 78,
                    title: 'Accumulation Pattern',
                    reasoning:
                      'Multiple large buys from fresh wallets after consolidation at support. RSI divergence confirms.',
                    indicators: ['RSI Divergence', 'Volume Spike', 'Support Hold'],
                    target_price: 185.0,
                    stop_loss: 128.0,
                    timeframe: '4h',
                    outcome: 'pending',
                  },
                  {
                    id: 's2',
                    type: 'warning',
                    timestamp: Date.now() / 1000 - 7200,
                    price_at_signal: 138.2,
                    confidence: 82,
                    title: 'Cluster Sell Pressure',
                    reasoning:
                      'Bundled wallets showing coordinated distribution pattern. 12 wallets funded from same source.',
                    indicators: ['Bundle Detection', 'Cluster Analysis'],
                    outcome: 'hit',
                  },
                ]}
              />
              <div className="rounded-xl border border-[rgba(139,92,246,0.15)] bg-surface-800 p-4">
                <RugChartsPluginViewer chain={DEMO_CHAIN} tokenAddress={DEMO_TOKEN} />
              </div>
            </div>

            {/* Multi-Chain Compare */}
            <MultiChainCompare
              initialTokens={[
                {
                  chain: 'solana',
                  address: 'So11111111111111111111111111111111111111112',
                  symbol: 'SOL',
                  name: 'Wrapped SOL',
                  price_usd: 142.5,
                  price_change_24h: 5.2,
                  volume_24h: 245000000,
                  liquidity_usd: 12500000,
                  holder_count: 154200,
                  top_holder_pct: 8.2,
                  risk_score: 22,
                  risk_level: 'low',
                  market_cap: 64200000000,
                },
                {
                  chain: 'ethereum',
                  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                  price_usd: 3320.4,
                  price_change_24h: -1.8,
                  volume_24h: 890000000,
                  liquidity_usd: 45000000,
                  holder_count: 421000,
                  top_holder_pct: 12.5,
                  risk_score: 15,
                  risk_level: 'low',
                  market_cap: 398000000000,
                },
              ]}
            />

            {/* Technical Analysis — KLineChart + kand indicators */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Technical Analysis
                </h2>
                <span className="text-xs text-text-muted">EMA · MACD · RSI — computed in-browser</span>
              </div>
              <TaCandleChart data={demoCandles} ticker="SOL/USDC" />
            </div>
          </main>

          <footer className="border-t border-[rgba(139,92,246,0.06)] px-4 py-4 text-center">
            <p className="text-xs text-text-muted">
              RugCharts v0.1.0 · Multi-Chain Token Intelligence · Powered by Rug Munch Media LLC
            </p>
          </footer>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
