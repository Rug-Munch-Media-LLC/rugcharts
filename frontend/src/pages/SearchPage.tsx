import { useQueries } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTrending, type TrendingToken } from '@/services/rugchartsApi'

const CHAINS = ['solana', 'ethereum', 'base', 'bsc', 'arbitrum', 'tron']

function formatPrice(usd: number | undefined): string {
  if (usd === undefined) return '—'
  if (usd < 0.01) return `$${usd.toExponential(2)}`
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

/**
 * SearchPage — find a token by symbol, name, or address.
 *
 * The backend does not yet expose a search endpoint, so this fetches the
 * trending lists across the supported chains and filters them client-side.
 * A direct address query also links straight to the token detail page.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('')

  // Fetch trending across all chains so the client-side search has a corpus.
  const queries = useQueries({
    queries: CHAINS.map((chain) => ({
      queryKey: ['trending', chain],
      queryFn: () => fetchTrending(chain, 50),
      staleTime: 120_000,
    })),
  })

  const corpus = useMemo<TrendingToken[]>(() => {
    const seen = new Set<string>()
    const out: TrendingToken[] = []
    for (const q of queries) {
      for (const t of q.data?.tokens ?? []) {
        const key = `${t.chain}-${t.address}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push(t)
        }
      }
    }
    return out
  }, [queries])

  const q = query.trim().toLowerCase()
  const results = q
    ? corpus.filter(
        (t) =>
          (t.symbol || '').toLowerCase().includes(q) ||
          (t.name || '').toLowerCase().includes(q) ||
          (t.address || '').toLowerCase().includes(q),
      )
    : []

  const loading = queries.some((x) => x.isLoading)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#F1F1F6]">Search Tokens</h2>
        <p className="text-xs text-[#5C6080] mt-1">
          Search by symbol, name, or address across Solana, Ethereum, Base, BSC, Arbitrum, and Tron.
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(139,92,246,0.15)] rounded-lg focus-within:border-[#8B5CF6]/40 transition-colors">
        <Search className="w-4 h-4 text-[#5C6080]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. SOL, Pepe, or a token address…"
          className="flex-1 bg-transparent text-sm text-[#F1F1F6] placeholder:text-[#5C6080] focus:outline-none"
        />
      </div>

      <div className="bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#5C6080] text-xs">Loading token index…</div>
        ) : !q ? (
          <div className="p-8 text-center text-[#5C6080] text-xs">
            Type a symbol, name, or address to search. {corpus.length} tokens indexed.
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center text-[#5C6080] text-xs">
            No matches for “{query}”. If you have a token address, open it directly:
            <div className="mt-2">
              <Link
                to={`/token/solana/${encodeURIComponent(query)}`}
                className="text-[#8B5CF6] hover:underline font-mono text-[10px]"
              >
                /token/solana/{query}
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(139,92,246,0.06)]">
            {results.slice(0, 50).map((t) => {
              const chain = t.chain || 'solana'
              const address = t.pair_address || t.address
              return (
                <Link
                  key={`${t.chain}-${t.address}`}
                  to={`/token/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[rgba(139,92,246,0.04)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{chain === 'solana' ? '◎' : chain === 'ethereum' ? 'Ξ' : '◈'}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#F1F1F6] truncate">
                        {t.symbol || t.name || '—'}
                        <span className="text-[#5C6080] font-normal ml-1">
                          {t.name && t.name !== t.symbol ? t.name : ''}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#5C6080] font-mono truncate">
                        {t.address.slice(0, 12)}…{t.address.slice(-4)} · {chain}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-[#06D6A0]">{formatPrice(t.price_usd)}</div>
                    <div className="text-[10px] text-[#5C6080]">
                      {typeof t.volume_24h === 'number'
                        ? `$${t.volume_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol`
                        : ''}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
