import { ArrowDownRight, ArrowUpRight, Droplet, Shield, ShieldAlert, Users } from 'lucide-react'
import { CHAIN_META, type ComparisonToken, EXPLORERS, formatNumber, formatPrice, formatUsd } from './compare-tokens'

interface TokenRowProps {
  token: ComparisonToken
  idx: number
  isWinner: boolean
  onRemove: (idx: number) => void
}

export default function TokenRow({ token, idx, isWinner, onRemove }: TokenRowProps) {
  const meta = CHAIN_META[token.chain] || CHAIN_META.solana
  return (
    <div
      className={`grid grid-cols-12 gap-2 items-center text-[11px] py-1.5 px-1 rounded transition-colors ${
        isWinner ? 'bg-[rgba(6,214,160,0.08)] border border-[rgba(6,214,160,0.3)]' : 'hover:bg-[rgba(139,92,246,0.04)]'
      }`}
    >
      <div className="col-span-2 flex items-center gap-1.5 min-w-0">
        <span className="text-sm" style={{ color: meta.color }}>
          {meta.icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-[#F1F1F6] truncate">{token.symbol}</span>
            {isWinner && <span className="text-[10px] text-[#06D6A0]">★</span>}
          </div>
          <a
            href={`${EXPLORERS[token.chain] || ''}${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-[#5C6080] hover:text-[#8B5CF6] truncate block font-mono"
          >
            {token.address.slice(0, 8)}...{token.address.slice(-4)}
          </a>
        </div>
      </div>
      <div className="col-span-2 text-right font-mono text-[#F1F1F6]">{formatPrice(token.price_usd)}</div>
      <div
        className={`col-span-1 text-right font-mono font-semibold flex items-center justify-end gap-0.5 ${
          token.price_change_24h >= 0 ? 'text-[#06D6A0]' : 'text-[#FF3366]'
        }`}
      >
        {token.price_change_24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(token.price_change_24h).toFixed(1)}%
      </div>
      <div className="col-span-2 text-right font-mono text-[#F1F1F6]">{formatUsd(token.volume_24h)}</div>
      <div className="col-span-2 text-right font-mono text-[#F1F1F6] flex items-center justify-end gap-1">
        <Droplet className="w-3 h-3 text-[#22D3EE]" />
        {formatUsd(token.liquidity_usd)}
      </div>
      <div className="col-span-1 text-right font-mono text-[#F1F1F6] flex items-center justify-end gap-1">
        <Users className="w-3 h-3 text-[#5C6080]" />
        {formatNumber(token.holder_count)}
      </div>
      <div className="col-span-1 text-right">
        <div
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
            token.risk_score < 30
              ? 'bg-[rgba(6,214,160,0.15)] text-[#06D6A0]'
              : token.risk_score < 60
                ? 'bg-[rgba(255,184,0,0.15)] text-[#FFB800]'
                : 'bg-[rgba(255,51,102,0.15)] text-[#FF3366]'
          }`}
        >
          {token.risk_score < 30 ? <Shield className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
          {token.risk_score}
        </div>
      </div>
      <div className="col-span-1 text-right">
        <button
          onClick={() => onRemove(idx)}
          className="text-[10px] text-[#5C6080] hover:text-[#FF3366] transition-colors"
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
