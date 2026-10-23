import { ArrowDownRight, ArrowUpRight, Droplet, Flame, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { TrendingItem } from '@/services/trendingApi'
import { RiskBadge, SourceBadge, StablecoinBadge } from './TrendingBadges'
import {
  chainMeta,
  formatCompactUsd,
  formatCount,
  formatPercent,
  formatPrice,
  isStablecoin,
  MISSING_REASON,
  shortToken,
} from './trending-format'

/** Em dash for a missing metric — always carries the reason for the gap. */
export function Dash({ reason }: { reason?: string }) {
  return (
    <span title={reason ?? MISSING_REASON} className="cursor-help">
      —<span className="sr-only"> not available: {reason ?? MISSING_REASON}</span>
    </span>
  )
}

function BondingCell({ progress }: { progress: number | null }) {
  if (progress === null) {
    return <Dash reason="No launchpad bonding curve for this pair" />
  }
  const pct = Math.max(0, Math.min(100, progress))
  return (
    <span className="inline-flex items-center gap-1.5 justify-end w-full">
      <span
        className="h-1 w-10 rounded-full bg-[rgba(139,92,246,0.15)] overflow-hidden"
        role="img"
        aria-label={`bonding ${pct.toFixed(0)} percent`}
      >
        <span className="block h-full rounded-full bg-accent-cyan" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-[10px] text-text-secondary">{pct.toFixed(0)}%</span>
    </span>
  )
}

export default function TrendingRow({ item, rank }: { item: TrendingItem; rank: number }) {
  const meta = chainMeta(item.chain)
  const changePositive = (item.price_change ?? 0) >= 0
  const activity =
    item.buys === null && item.sells === null
      ? null
      : `${formatCount(item.buys ?? 0)} / ${formatCount(item.sells ?? 0)}`

  return (
    <tr className="border-b border-[rgba(139,92,246,0.06)] hover:bg-[rgba(139,92,246,0.05)] transition-colors">
      <td className="py-2 pl-2 pr-1 text-right font-mono text-[10px] text-text-muted tabular-nums">{rank}</td>

      <td className="py-2 pr-2 min-w-0 max-w-[13rem]">
        <Link
          to={`/token/${encodeURIComponent(item.chain)}/${encodeURIComponent(item.token)}`}
          className="flex items-center gap-2 min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          <span aria-hidden="true" className="text-sm shrink-0" style={{ color: meta.color }}>
            {meta.icon}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-text-primary text-xs truncate">
                {shortToken(item.symbol ?? item.token)}
              </span>
              {isStablecoin(item.symbol) && <StablecoinBadge />}
            </span>
            <span className="block text-[9px] text-text-secondary font-mono truncate">
              {item.name ?? chainMeta(item.chain).label}
            </span>
          </span>
        </Link>
      </td>

      <td className="py-2 px-2 text-right font-mono text-xs text-text-primary tabular-nums">
        {item.price === null ? <Dash /> : formatPrice(item.price)}
      </td>

      <td className="py-2 px-2 text-right">
        {item.price_change === null ? (
          <Dash />
        ) : (
          <span
            className={`inline-flex items-center justify-end gap-0.5 font-mono font-semibold text-xs tabular-nums ${
              changePositive ? 'text-accent-green' : 'text-accent-red'
            }`}
          >
            {changePositive ? (
              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
            )}
            {formatPercent(item.price_change)}
          </span>
        )}
      </td>

      <td className="hidden sm:table-cell py-2 px-2 text-right font-mono text-xs text-text-primary tabular-nums">
        {item.volume === null ? <Dash /> : formatCompactUsd(item.volume)}
      </td>

      <td className="hidden lg:table-cell py-2 px-2 text-right font-mono text-xs text-text-primary tabular-nums">
        {item.liquidity === null ? (
          <Dash />
        ) : (
          <span className="inline-flex items-center justify-end gap-1">
            <Droplet className="w-3 h-3 text-accent-cyan" aria-hidden="true" />
            {formatCompactUsd(item.liquidity)}
          </span>
        )}
      </td>

      <td className="hidden xl:table-cell py-2 px-2 text-right font-mono text-xs text-text-primary tabular-nums">
        {item.mcap === null ? <Dash /> : formatCompactUsd(item.mcap)}
      </td>

      <td className="hidden lg:table-cell py-2 px-2 text-right font-mono text-xs tabular-nums">
        {activity === null ? (
          <Dash />
        ) : (
          <span className="inline-flex items-center justify-end gap-1 text-text-primary">
            <Users className="w-3 h-3 text-text-secondary" aria-hidden="true" />
            {activity}
          </span>
        )}
      </td>

      <td className="hidden lg:table-cell py-2 px-2 text-right">
        <BondingCell progress={item.bonding_progress} />
      </td>

      <td className="py-2 px-2 text-right">
        {item.score === null ? (
          <Dash reason="Not enough data to score this token" />
        ) : (
          <span className="inline-flex items-center gap-1 justify-end">
            <Flame className="w-3 h-3 text-accent-orange" aria-hidden="true" />
            <RiskBadge score={item.score} />
          </span>
        )}
      </td>

      <td className="hidden xl:table-cell py-2 pl-2 pr-2 text-right">
        {item.source === null ? <Dash /> : <SourceBadge source={item.source} />}
      </td>
    </tr>
  )
}
