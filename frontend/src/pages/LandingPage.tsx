import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Droplet, Flame, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import SearchBar from '@/components/rugcharts/SearchBar'
import { fetchTrending, type TrendingToken } from '@/services/rugchartsApi'

function formatPrice(usd: number | undefined): string {
  if (usd === undefined) return '—'
  if (usd < 0.01) return `$${usd.toExponential(2)}`
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

function formatUsd(n: number | undefined): string {
  if (n === undefined) return '—'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function TrendingRow({ token }: { token: TrendingToken }) {
  const chain = token.chain || 'solana'
  const address = token.pair_address || token.address
  const change = token.change_24h ?? 0
  return (
    <Link
      to={`/token/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`}
      className="grid grid-cols-12 gap-2 items-center text-[11px] py-2 px-2 rounded hover:bg-[rgba(139,92,246,0.04)] transition-colors"
    >
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span className="text-sm">{chain === 'solana' ? '◎' : chain === 'ethereum' ? 'Ξ' : '◈'}</span>
        <div className="min-w-0">
          <div className="font-bold text-[#F1F1F6] truncate">{token.symbol || token.name || '—'}</div>
          <div className="text-[9px] text-[#5C6080] font-mono truncate">
            {token.address.slice(0, 8)}…{token.address.slice(-4)}
          </div>
        </div>
      </div>
      <div className="col-span-2 text-right font-mono text-[#F1F1F6]">{formatPrice(token.price_usd)}</div>
      <div
        className={`col-span-2 text-right font-mono font-semibold flex items-center justify-end gap-0.5 ${
          change >= 0 ? 'text-[#06D6A0]' : 'text-[#FF3366]'
        }`}
      >
        {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(change).toFixed(1)}%
      </div>
      <div className="col-span-2 text-right font-mono text-[#F1F1F6]">{formatUsd(token.volume_24h)}</div>
      <div className="col-span-2 text-right font-mono text-[#F1F1F6] flex items-center justify-end gap-1">
        <Droplet className="w-3 h-3 text-[#22D3EE]" />
        {formatUsd(token.liquidity_usd)}
      </div>
    </Link>
  )
}

export default function LandingPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trending', 'solana'],
    queryFn: () => fetchTrending('solana', 30),
    staleTime: 60_000,
  })

  const tokens = data?.tokens ?? []

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-gradient-to-br from-[rgba(139,92,246,0.08)] to-transparent p-8">
        <div className="flex items-center gap-2 text-[#8B5CF6] mb-3">
          <Flame className="w-5 h-5" />
          <span className="text-xs uppercase tracking-widest font-semibold">Multi-Chain Token Intelligence</span>
        </div>
        <h2 className="text-3xl font-bold text-[#F1F1F6] mb-2">Spot the rug before it pulls.</h2>
        <p className="text-sm text-[#5C6080] max-w-xl mb-6">
          Live OHLCV charts, AI trade signals, scam-risk scoring, and rug-pull warnings across Solana, Ethereum, Base,
          and more.
        </p>
        <div className="max-w-md">
          <SearchBar tokens={tokens} />
        </div>
      </section>

      {/* Trending */}
      <section className="bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.15)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#8B5CF6]" />
            <h3 className="text-sm font-bold text-[#F1F1F6] uppercase tracking-wider">Trending on Solana</h3>
          </div>
          <Link to="/trending" className="text-xs text-[#8B5CF6] hover:underline">
            View all →
          </Link>
        </div>

        <div className="px-2 py-1">
          <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-wider text-[#5C6080] font-bold px-2 py-1">
            <div className="col-span-4">Token</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">24h</div>
            <div className="col-span-2 text-right">Volume</div>
            <div className="col-span-2 text-right">Liquidity</div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-[#5C6080] text-xs">Loading trending tokens…</div>
          ) : isError || tokens.length === 0 ? (
            <div className="p-8 text-center text-[#5C6080] text-xs">
              No trending data available right now. Try the{' '}
              <Link to="/trending" className="text-[#8B5CF6] hover:underline">
                trending page
              </Link>
              .
            </div>
          ) : (
            tokens.slice(0, 10).map((t) => <TrendingRow key={`${t.chain}-${t.address}`} token={t} />)
          )}
        </div>
      </section>
    </div>
  )
}
