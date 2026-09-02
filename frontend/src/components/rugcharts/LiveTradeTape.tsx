import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, Eye, Wallet, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface Trade {
  id: string
  side: 'buy' | 'sell'
  amount_usd: number
  amount_token: number
  price_usd: number
  wallet: string
  wallet_label?: 'whale' | 'sniper' | 'bot' | 'fresh' | 'insider' | 'bundle' | 'dev'
  tx_hash: string
  timestamp: number
  chain: string
  is_liquidity?: boolean
}

interface LiveTradeTapeProps {
  chain: string
  tokenAddress: string
  initialTrades?: Trade[]
  className?: string
}

// Wallet label color/icon mapping
const LABEL_STYLES: Record<
  NonNullable<Trade['wallet_label']>,
  { color: string; bg: string; icon: any; label: string }
> = {
  whale: { color: '#FFB800', bg: 'rgba(255,184,0,0.15)', icon: Eye, label: 'WHALE' },
  sniper: { color: '#FF3366', bg: 'rgba(255,51,102,0.15)', icon: Zap, label: 'SNIPER' },
  bot: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', icon: Bot, label: 'BOT' },
  fresh: { color: '#5C6080', bg: 'rgba(92,96,128,0.15)', icon: Wallet, label: 'FRESH' },
  insider: { color: '#FF6B6B', bg: 'rgba(255,107,107,0.2)', icon: AlertTriangle, label: 'INSIDER' },
  bundle: { color: '#EC4899', bg: 'rgba(236,72,153,0.15)', icon: Bot, label: 'BUNDLE' },
  dev: { color: '#F59E0B', bg: 'rgba(245,158,11,0.2)', icon: AlertTriangle, label: 'DEV' },
}

const EXPLORERS: Record<string, string> = {
  solana: 'https://solscan.io/tx/',
  ethereum: 'https://etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
  bsc: 'https://bscscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
}

export default function LiveTradeTape({ chain, tokenAddress, initialTrades = [], className = '' }: LiveTradeTapeProps) {
  const [trades, setTrades] = useState<Trade[]>(initialTrades)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<'all' | 'whale' | 'bot' | 'suspicious'>('all')
  const wsRef = useRef<WebSocket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sync externally-provided trades (e.g. from a polling hook) whenever they
  // change. Without this, initialTrades is only read once at mount and live
  // polling data would never appear.
  useEffect(() => {
    if (initialTrades.length > 0) {
      setTrades((prev) => {
        const merged = [...initialTrades, ...prev]
        const seen = new Set<string>()
        return merged
          .filter((t) => {
            if (seen.has(t.id)) return false
            seen.add(t.id)
            return true
          })
          .slice(0, 200)
      })
    }
  }, [initialTrades])

  useEffect(() => {
    // Subscribe to DataBus WebSocket for live trades
    const wsUrl = (window as any).DATA_WS_URL || `wss://${window.location.host}/ws/trades`
    let reconnectTimer: any
    let isMounted = true

    const connect = () => {
      try {
        const ws = new WebSocket(`${wsUrl}?chain=${chain}&token=${encodeURIComponent(tokenAddress)}`)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('[TradeTape] Connected', chain, tokenAddress)
        }

        ws.onmessage = (evt) => {
          if (paused || !isMounted) return
          try {
            const trade = JSON.parse(evt.data) as Trade
            setTrades((prev) => [trade, ...prev].slice(0, 200))
          } catch {
            /* ignore */
          }
        }

        ws.onclose = () => {
          if (isMounted) reconnectTimer = setTimeout(connect, 5000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      isMounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [chain, tokenAddress, paused])

  // Auto-scroll to top when new trade arrives
  useEffect(() => {
    if (!scrollRef.current || paused) return
    scrollRef.current.scrollTop = 0
  }, [paused])

  // Compute live stats
  const stats = trades.reduce(
    (acc, t) => {
      if (t.side === 'buy') acc.buyVol += t.amount_usd
      else acc.sellVol += t.amount_usd
      if (t.wallet_label && ['whale', 'insider', 'bundle'].includes(t.wallet_label)) acc.suspicious++
      return acc
    },
    { buyVol: 0, sellVol: 0, suspicious: 0 },
  )
  const netFlow = stats.buyVol - stats.sellVol
  const buyPressure = stats.buyVol / Math.max(1, stats.buyVol + stats.sellVol)

  const filtered = trades.filter((t) => {
    if (filter === 'all') return true
    if (filter === 'whale') return t.wallet_label === 'whale'
    if (filter === 'bot') return t.wallet_label === 'bot' || t.wallet_label === 'sniper'
    if (filter === 'suspicious') return t.wallet_label && ['insider', 'bundle', 'dev'].includes(t.wallet_label)
    return true
  })

  const explorer = EXPLORERS[chain] || EXPLORERS.ethereum

  return (
    <div className={`bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden ${className}`}>
      {/* Header stats bar */}
      <div className="grid grid-cols-4 gap-px bg-[rgba(139,92,246,0.08)] border-b border-[rgba(139,92,246,0.15)]">
        <div className="bg-[#0a0a0f] px-3 py-2">
          <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Buy Vol</div>
          <div className="text-sm font-semibold text-[#06D6A0]">
            ${stats.buyVol.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-[#0a0a0f] px-3 py-2">
          <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Sell Vol</div>
          <div className="text-sm font-semibold text-[#FF3366]">
            ${stats.sellVol.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-[#0a0a0f] px-3 py-2">
          <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Net Flow</div>
          <div className={`text-sm font-semibold ${netFlow >= 0 ? 'text-[#06D6A0]' : 'text-[#FF3366]'}`}>
            {netFlow >= 0 ? '+' : ''}${netFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-[#0a0a0f] px-3 py-2">
          <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Buy Pressure</div>
          <div className="text-sm font-semibold" style={{ color: buyPressure > 0.5 ? '#06D6A0' : '#FF3366' }}>
            {(buyPressure * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Filter & controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(139,92,246,0.08)]">
        <div className="flex gap-1">
          {(['all', 'whale', 'bot', 'suspicious'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
                filter === f
                  ? 'bg-[#8B5CF6] text-white'
                  : 'bg-[rgba(139,92,246,0.08)] text-[#5C6080] hover:text-[#F1F1F6]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#5C6080]">
          {stats.suspicious > 0 && (
            <span className="flex items-center gap-1 text-[#FF3366] animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              {stats.suspicious} SUSPICIOUS
            </span>
          )}
          <button
            onClick={() => setPaused((p) => !p)}
            className="px-2 py-0.5 bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.2)] rounded text-[10px]"
          >
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
        </div>
      </div>

      {/* Trade list */}
      <div ref={scrollRef} className="max-h-[500px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[#5C6080] text-sm">Waiting for trades...</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0a0a0f] border-b border-[rgba(139,92,246,0.08)]">
              <tr className="text-[#5C6080] text-[9px] uppercase tracking-wider">
                <th className="text-left px-2 py-1">Time</th>
                <th className="text-left px-2 py-1">Type</th>
                <th className="text-left px-2 py-1">Wallet</th>
                <th className="text-right px-2 py-1">USD</th>
                <th className="text-right px-2 py-1">Token</th>
                <th className="text-right px-2 py-1">Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const Style = t.wallet_label ? LABEL_STYLES[t.wallet_label] : null
                const Icon = Style?.icon
                const timeAgo = Math.max(0, Math.floor((Date.now() - t.timestamp) / 1000))
                const timeStr = timeAgo < 60 ? `${timeAgo}s` : `${Math.floor(timeAgo / 60)}m`
                return (
                  <tr
                    key={t.id}
                    className="border-b border-[rgba(139,92,246,0.04)] hover:bg-[rgba(139,92,246,0.04)] transition-colors"
                  >
                    <td className="px-2 py-1.5 text-[#5C6080] font-mono text-[10px]">{timeStr}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`flex items-center gap-1 font-semibold ${t.side === 'buy' ? 'text-[#06D6A0]' : 'text-[#FF3366]'}`}
                      >
                        {t.side === 'buy' ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <a
                        href={`${EXPLORERS[t.chain] || explorer}${t.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:underline"
                      >
                        <code className="text-[#F1F1F6] font-mono text-[10px]">
                          {t.wallet.slice(0, 4)}...{t.wallet.slice(-4)}
                        </code>
                        {Style && Icon && (
                          <span
                            className="px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5"
                            style={{ color: Style.color, background: Style.bg }}
                            title={Style.label}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {Style.label}
                          </span>
                        )}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-[#F1F1F6]">
                      ${t.amount_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[#5C6080]">
                      {t.amount_token.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[#5C6080]">${t.price_usd.toExponential(3)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
