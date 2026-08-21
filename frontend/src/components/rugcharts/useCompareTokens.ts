import { useMemo, useState } from 'react'
import { type ComparisonToken, computeWinnerScore } from './compare-tokens'
import { fetchCompareAnalyze } from '@/services/rugchartsApi'

export interface AnalyzeResponse {
  symbol?: string
  token_symbol?: string
  name?: string
  token_name?: string
  price_usd?: number | string
  price?: number | string
  price_change_24h?: number | string
  priceChange24h?: number | string
  volume_24h?: number | string
  volume?: number | string
  liquidity_usd?: number | string
  liquidity?: number | string
  holder_count?: number | string
  holders?: number | string
  top_holder_pct?: number | string
  top10Pct?: number | string
  risk_score?: number | string
  riskScore?: number | string
  risk_level?: string
  riskLevel?: string
  market_cap?: number | string
  fdv?: number | string
  age_hours?: number | string
  ageHours?: number | string
}

export interface RankedToken {
  token: ComparisonToken
  idx: number
  score: number
  reasons: string[]
}

/** State machine for the comparison table: token list, quick-add, ranking, pagination. */
export function useCompareTokens(initialTokens: ComparisonToken[]) {
  const [tokens, setTokens] = useState<ComparisonToken[]>(initialTokens)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)

  const perPage = 4

  // Add token by chain+address — typed API layer (services/rugchartsApi.ts)
  // targets /api/v1/rugcharts/analyze/{address} and returns null on any
  // failure, so a dead backend degrades to "token not added" instead of
  // throwing.
  const addToken = async (chain: string, address: string) => {
    if (!chain || !address) return
    setLoading(true)
    try {
      const body = await fetchCompareAnalyze(address, chain)
      if (body) {
        const data = body as unknown as AnalyzeResponse
        const token: ComparisonToken = {
          chain,
          address,
          symbol: data.symbol || data.token_symbol || address.slice(0, 6),
          name: data.name || data.token_name,
          price_usd: Number(data.price_usd || data.price || 0),
          price_change_24h: Number(data.price_change_24h || data.priceChange24h || 0),
          volume_24h: Number(data.volume_24h || data.volume || 0),
          liquidity_usd: Number(data.liquidity_usd || data.liquidity || 0),
          holder_count: Number(data.holder_count || data.holders || 0),
          top_holder_pct: Number(data.top_holder_pct || data.top10Pct || 0),
          risk_score: Number(data.risk_score || data.riskScore || 0),
          risk_level: data.risk_level || data.riskLevel,
          market_cap: Number(data.market_cap || data.fdv || 0),
          age_hours: Number(data.age_hours || data.ageHours || 0),
        }
        setTokens((prev) => [...prev, token])
      }
    } catch (e) {
      console.error('[MultiChainCompare] add failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const removeToken = (idx: number) => {
    setTokens((prev) => prev.filter((_, i) => i !== idx))
  }

  // Quick-add via search
  const handleAdd = () => {
    // Parse "chain:address" or just address
    let chain = 'solana'
    let addr = search.trim()
    if (addr.includes(':')) {
      ;[chain, addr] = addr.split(':', 2)
    }
    if (addr) {
      addToken(chain, addr)
      setSearch('')
    }
  }

  // Compute winner ranking
  const ranked = useMemo<RankedToken[]>(() => {
    return tokens.map((t, idx) => ({ token: t, idx, ...computeWinnerScore(t) })).sort((a, b) => b.score - a.score)
  }, [tokens])

  const winner = ranked[0]

  const visiblePage = ranked.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.ceil(ranked.length / perPage)

  return {
    search,
    setSearch,
    loading,
    page,
    setPage,
    addToken,
    removeToken,
    handleAdd,
    ranked,
    winner,
    visiblePage,
    totalPages,
  }
}
