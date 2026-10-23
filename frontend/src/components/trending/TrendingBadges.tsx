import { RISK_COPY, riskBand } from './trending-format'

/** Risk band badge. Never color-only: the text label carries the meaning. */
export function RiskBadge({ score }: { score: number }) {
  const band = riskBand(score)
  const copy = RISK_COPY[band]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${copy.className}`}>
      <span aria-hidden="true">●</span>
      <span>{copy.label}</span>
      <span className="font-mono font-normal opacity-80">{Math.round(score)}</span>
    </span>
  )
}

/** Marks quote assets so a $1.00 "token" is never mistaken for a fresh launch. */
export function StablecoinBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[rgba(34,211,238,0.12)] text-[#22D3EE] border border-[rgba(34,211,238,0.3)]">
      Stable
    </span>
  )
}

/** Provenance of the row (dexscreener, pumpfun, internal, …). */
export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-text-secondary bg-[rgba(139,92,246,0.08)]">
      {source}
    </span>
  )
}
