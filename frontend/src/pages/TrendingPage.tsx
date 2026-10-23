import { useQuery } from '@tanstack/react-query'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import TrendingBoardTable from '@/components/trending/TrendingBoardTable'
import { EmptyState, LoadingState, UnavailableState } from '@/components/trending/TrendingStates'
import WindowFilter from '@/components/trending/WindowFilter'
import {
  fetchTrendingBoard,
  TRENDING_CHAINS,
  type TrendingChain,
  TrendingUnavailable,
  type TrendingWindow,
} from '@/services/trendingApi'

const SKELETON_COLUMNS = 10

const controlClass =
  'bg-surface-800 border border-[rgba(139,92,246,0.2)] rounded-lg px-2.5 py-1 text-[11px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400'

export default function TrendingPage() {
  const [chain, setChain] = useState<TrendingChain | 'all'>('all')
  const [window, setWindow] = useState<TrendingWindow>('24h')

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['trending-board', chain, window],
    queryFn: ({ signal }) => fetchTrendingBoard({ chain, window, limit: 50 }, signal),
    staleTime: 60_000,
    retry: (failureCount, err) =>
      !(err instanceof TrendingUnavailable && err.reason === 'not_deployed') && failureCount < 1,
  })

  const unavailable =
    error instanceof TrendingUnavailable
      ? { reason: error.reason, detail: error.detail }
      : error
        ? { reason: 'network' as const, detail: error.message }
        : null

  const items = data?.items ?? []
  const generatedAt = data ? new Date(data.generated_at) : null

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-text-primary">
            <TrendingUp className="w-5 h-5 text-brand-500" aria-hidden="true" />
            Trending
          </h2>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {data
              ? `${items.length} ranked token${items.length === 1 ? '' : 's'} · generated ${generatedAt?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
              : 'Live ranking across chains'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="trending-chain" className="sr-only">
            Chain filter
          </label>
          <select
            id="trending-chain"
            value={chain}
            onChange={(e) => setChain(e.target.value as TrendingChain | 'all')}
            className={`${controlClass} capitalize`}
          >
            <option value="all">All chains</option>
            {TRENDING_CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <WindowFilter value={window} onChange={setWindow} />

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh trending board"
            className={`${controlClass} inline-flex items-center gap-1 text-text-secondary hover:text-text-primary disabled:opacity-50`}
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-surface-800 border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden">
        {isPending ? (
          <LoadingState columns={SKELETON_COLUMNS} />
        ) : unavailable ? (
          <UnavailableState
            reason={unavailable.reason}
            detail={unavailable.detail}
            onRetry={() => refetch()}
            isRetrying={isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState chain={chain === 'all' ? 'all chains' : chain} window={window} />
        ) : (
          <TrendingBoardTable items={items} window={window} />
        )}
      </div>
    </section>
  )
}
