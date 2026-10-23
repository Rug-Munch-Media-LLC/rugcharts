import { TRENDING_WINDOWS, type TrendingWindow } from '@/services/trendingApi'

/** Segmented 1h / 6h / 24h window control. */
export default function WindowFilter({
  value,
  onChange,
}: {
  value: TrendingWindow
  onChange: (next: TrendingWindow) => void
}) {
  return (
    <fieldset className="flex m-0 p-0 border-0 min-w-0 rounded-lg overflow-hidden border border-[rgba(139,92,246,0.2)]">
      <legend className="sr-only">Time window</legend>
      {TRENDING_WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          aria-pressed={value === w}
          onClick={() => onChange(w)}
          className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400 ${
            value === w ? 'bg-brand-500 text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {w}
        </button>
      ))}
    </fieldset>
  )
}
