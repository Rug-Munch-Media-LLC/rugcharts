import { Activity } from 'lucide-react'
import type { RankedToken } from './useCompareTokens'

interface WinnerBannerProps {
  winner: RankedToken
}

export default function WinnerBanner({ winner }: WinnerBannerProps) {
  return (
    <div className="px-4 py-3 border-t border-[rgba(139,92,246,0.08)] bg-[rgba(6,214,160,0.04)]">
      <div className="text-[10px] uppercase tracking-wider text-[#06D6A0] font-bold mb-1.5 flex items-center gap-1">
        <Activity className="w-3 h-3" /> Why {winner.token.symbol} wins ({winner.score}/100)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {winner.reasons.map((r, i) => (
          <span
            key={i}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(6,214,160,0.1)] text-[#06D6A0] border border-[rgba(6,214,160,0.2)]"
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  )
}
