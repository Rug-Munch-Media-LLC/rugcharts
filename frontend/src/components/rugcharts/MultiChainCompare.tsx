import ComparePagination from './ComparePagination'
import QuickAddBar from './QuickAddBar'
import TokenRow from './TokenRow'
import { useCompareTokens } from './useCompareTokens'
import WinnerBanner from './WinnerBanner'

export type { ComparisonToken } from './compare-tokens'

interface MultiChainCompareProps {
  initialTokens?: ComparisonToken[]
  className?: string
}

export default function MultiChainCompare({ initialTokens = [], className = '' }: MultiChainCompareProps) {
  const { search, setSearch, loading, page, setPage, removeToken, handleAdd, ranked, winner, visiblePage, totalPages } =
    useCompareTokens(initialTokens)

  return (
    <div className={`bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.15)] bg-gradient-to-r from-[rgba(139,92,246,0.08)] to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#F1F1F6] uppercase tracking-wider">Multi-Chain Comparison</h3>
            <p className="text-[10px] text-[#5C6080] mt-0.5">
              Compare up to 4 tokens · AI picks winner based on safety + momentum
            </p>
          </div>
          {winner && (
            <div className="text-right">
              <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Best pick</div>
              <div className="text-sm font-bold text-[#06D6A0] flex items-center gap-1">
                {winner.token.symbol} <span className="text-[10px] text-[#FFB800]">{winner.score}/100</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-add bar */}
      <QuickAddBar value={search} onChange={setSearch} loading={loading} onAdd={handleAdd} />

      {/* Comparison grid */}
      {ranked.length === 0 ? (
        <div className="p-8 text-center text-[#5C6080] text-xs">
          Add tokens to compare. Format: <code className="text-[#8B5CF6]">chain:address</code> · Default chain is
          solana.
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-wider text-[#5C6080] font-bold pb-1 border-b border-[rgba(139,92,246,0.08)]">
            <div className="col-span-2">Token</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-1 text-right">24h</div>
            <div className="col-span-2 text-right">Volume</div>
            <div className="col-span-2 text-right">Liquidity</div>
            <div className="col-span-1 text-right">Holders</div>
            <div className="col-span-1 text-right">Risk</div>
            <div className="col-span-1 text-right"></div>
          </div>

          {/* Token rows */}
          {visiblePage.map(({ token, idx }) => (
            <TokenRow
              key={`${token.chain}-${token.address}-${idx}`}
              token={token}
              idx={idx}
              isWinner={winner?.idx === idx}
              onRemove={removeToken}
            />
          ))}

          {/* Pagination */}
          <ComparePagination
            page={page}
            totalPages={totalPages}
            count={ranked.length}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          />
        </div>
      )}

      {/* Winner explanation */}
      {winner && <WinnerBanner winner={winner} />}
    </div>
  )
}
