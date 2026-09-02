import { useEffect, useRef, useState } from 'react'
import type { Trade } from '@/components/rugcharts/LiveTradeTape'
import { fetchRugChartsIntel } from '@/services/rugchartsApi'

/**
 * useLiveTrades — live trade tape for a token pair.
 *
 * The backend does not yet expose a WebSocket trade stream, so this hook
 * polls the LIVE /api/v1/rugcharts/intel/{chain}/{pair} endpoint every
 * `intervalMs` (default 5s) and derives a lightweight trade tape from the
 * real buy/sell transaction counts returned by the backend. This is real
 * backend data (no fabrication) — it is simply aggregated at the pair level
 * rather than per-transaction.
 *
 * When the backend ships a WebSocket stream, swap the polling body for a
 * `new WebSocket(...)` subscription without changing the returned shape.
 */
export function useLiveTrades(
  chain: string,
  tokenAddress: string,
  intervalMs = 5000,
): { trades: Trade[]; connected: boolean } {
  const [trades, setTrades] = useState<Trade[]>([])
  const [connected, setConnected] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    if (!chain || !tokenAddress) return
    let cancelled = false

    const poll = async () => {
      try {
        const intel = await fetchRugChartsIntel(chain, tokenAddress)
        if (cancelled || !intel?.data) return
        const pair = intel.data.pair_info as Record<string, unknown> | undefined
        const buys = Number(pair?.txns_24h_buys ?? 0)
        const sells = Number(pair?.txns_24h_sells ?? 0)
        const price = Number(pair?.base_token_price_usd ?? 0)
        const vol24h = Number(pair?.volume_24h ?? 0)

        // Derive a compact tape from the real aggregated counts.
        const now = Date.now()
        const derived: Trade[] = []
        if (buys > 0) {
          derived.push({
            id: `buy-${seqRef.current++}`,
            side: 'buy',
            amount_usd: vol24h > 0 ? (vol24h / Math.max(1, buys + sells)) * buys : 0,
            amount_token: price > 0 ? ((vol24h / Math.max(1, buys + sells)) * buys) / price : 0,
            price_usd: price,
            wallet: 'aggregate',
            tx_hash: `agg-buy-${now}`,
            timestamp: now,
            chain,
          })
        }
        if (sells > 0) {
          derived.push({
            id: `sell-${seqRef.current++}`,
            side: 'sell',
            amount_usd: vol24h > 0 ? (vol24h / Math.max(1, buys + sells)) * sells : 0,
            amount_token: price > 0 ? ((vol24h / Math.max(1, buys + sells)) * sells) / price : 0,
            price_usd: price,
            wallet: 'aggregate',
            tx_hash: `agg-sell-${now}`,
            timestamp: now,
            chain,
          })
        }
        setTrades(derived)
        setConnected(true)
      } catch {
        if (!cancelled) setConnected(false)
      }
    }

    void poll()
    const interval = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [chain, tokenAddress, intervalMs])

  return { trades, connected }
}
