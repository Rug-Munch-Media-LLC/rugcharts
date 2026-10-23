import { CloudOff, Inbox, RotateCw, TriangleAlert } from 'lucide-react'
import type { TrendingUnavailableReason } from '@/services/trendingApi'

const UNAVAILABLE_COPY: Record<TrendingUnavailableReason, { title: string; body: string }> = {
  not_deployed: {
    title: 'Trending feed not deployed',
    body: 'This deployment has no working GET /api/v1/trending route yet. Nothing is shown rather than placeholder rows.',
  },
  network: {
    title: 'Trending feed unreachable',
    body: 'The request failed before a response arrived — backend down, network error, or CORS blocked.',
  },
  bad_payload: {
    title: 'Unexpected trending payload',
    body: 'The route answered with a shape that does not match { items, generated_at }.',
  },
}

export function LoadingState({ columns }: { columns: number }) {
  return (
    <div role="status" aria-busy="true" className="p-2">
      <span className="sr-only">Loading trending board…</span>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div
          key={row}
          className="grid gap-3 items-center py-2.5 px-2 animate-pulse"
          style={{ gridTemplateColumns: `2rem repeat(${columns}, minmax(0, 1fr))` }}
        >
          <div className="h-2.5 rounded bg-[rgba(139,92,246,0.12)]" />
          {Array.from({ length: columns }, (_, col) => (
            <div
              key={col}
              className="h-2.5 rounded bg-[rgba(139,92,246,0.10)]"
              style={{ width: `${40 + ((row + col) % 4) * 12}%`, marginLeft: 'auto' }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ chain, window }: { chain: string; window: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 py-14 px-6 text-center">
      <Inbox className="w-6 h-6 text-text-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-text-primary">No ranked tokens</p>
      <p className="text-xs text-text-secondary max-w-sm">
        The board is live but empty for {chain} over the last {window}. Widen the chain or window filter.
      </p>
    </div>
  )
}

export function UnavailableState({
  reason,
  detail,
  onRetry,
  isRetrying,
}: {
  reason: TrendingUnavailableReason
  detail: string
  onRetry: () => void
  isRetrying: boolean
}) {
  const copy = UNAVAILABLE_COPY[reason]
  const Icon = reason === 'bad_payload' ? TriangleAlert : CloudOff
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-12 px-6 text-center">
      <Icon className="w-7 h-7 text-accent-yellow" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text-primary">{copy.title}</p>
        <p className="text-xs text-text-secondary max-w-md">{copy.body}</p>
      </div>
      <code className="text-[10px] font-mono text-text-muted bg-[rgba(139,92,246,0.08)] rounded px-2 py-1">
        reason={reason} · {detail}
      </code>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[rgba(139,92,246,0.15)] text-brand-300 hover:bg-[rgba(139,92,246,0.25)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
      >
        <RotateCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}
