import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TrendingToken } from '@/services/rugchartsApi'

interface SearchBarProps {
  /** Trending tokens to filter against (client-side search). */
  tokens?: TrendingToken[]
  className?: string
}

/**
 * SearchBar — find a token by symbol/name/address.
 *
 * The backend does not yet expose a search endpoint, so this filters the
 * already-fetched trending list client-side and lets the user jump straight
 * to a token detail page by address. When the backend ships a search route,
 * swap the local filter for a server call without changing the UI.
 */
export default function SearchBar({ tokens = [], className = '' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const q = query.trim().toLowerCase()
  const results = q
    ? tokens.filter(
        (t) =>
          (t.symbol || '').toLowerCase().includes(q) ||
          (t.name || '').toLowerCase().includes(q) ||
          (t.address || '').toLowerCase().includes(q),
      )
    : []

  const goToToken = (chain: string, address: string) => {
    setQuery('')
    setOpen(false)
    navigate(`/token/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`)
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(255,255,255,0.02)] border border-[rgba(139,92,246,0.15)] rounded-lg focus-within:border-[#8B5CF6]/40 transition-colors">
        <Search className="w-4 h-4 text-[#5C6080]" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) {
              goToToken(results[0].chain || 'solana', results[0].address)
            }
          }}
          placeholder="Search token by symbol, name, or address…"
          className="flex-1 bg-transparent text-sm text-[#F1F1F6] placeholder:text-[#5C6080] focus:outline-none"
        />
      </div>

      {open && q && (
        <div className="absolute z-20 mt-1 w-full bg-[#0d0d15] border border-[rgba(139,92,246,0.2)] rounded-lg shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[#5C6080]">
              No matches. Try a token address (e.g. <code className="text-[#8B5CF6]">So1111…</code>).
            </div>
          ) : (
            results.slice(0, 8).map((t) => (
              <button
                key={`${t.chain}-${t.address}`}
                type="button"
                onMouseDown={() => goToToken(t.chain || 'solana', t.address)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[rgba(139,92,246,0.08)] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{t.chain === 'solana' ? '◎' : t.chain === 'ethereum' ? 'Ξ' : '◈'}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F1F1F6] truncate">
                      {t.symbol || t.name || t.address.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-[#5C6080] font-mono truncate">
                      {t.address.slice(0, 10)}…{t.address.slice(-4)}
                    </div>
                  </div>
                </div>
                {typeof t.price_usd === 'number' && (
                  <span className="text-xs font-mono text-[#06D6A0]">
                    ${t.price_usd < 0.01 ? t.price_usd.toExponential(2) : t.price_usd.toFixed(4)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
