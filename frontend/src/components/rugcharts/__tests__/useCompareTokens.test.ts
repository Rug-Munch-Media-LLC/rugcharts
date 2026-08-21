import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCompareTokens } from '../useCompareTokens'
import { compareAnalyzeUrl } from '@/services/rugchartsApi'

// The compare table must add tokens through the typed API layer targeting
// /api/v1/rugcharts/analyze/{address} (backend HEAD; pending deploy) and map
// the flat snake_case payload into ComparisonToken rows.

const ADDR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const BACKEND_PAYLOAD = {
  chain: 'solana',
  address: ADDR,
  symbol: 'USDC',
  name: 'USD Coin',
  fallback_used: false,
  price_usd: 1.0,
  price_change_24h: 0.01,
  volume_24h: 123456,
  liquidity_usd: 99999,
  holder_count: 0,
  top_holder_pct: 0,
  market_cap: 30000000000,
  risk_score: 12,
  risk_level: 'LOW',
  age_hours: 0,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useCompareTokens.addToken', () => {
  it('fetches the typed compare-analyze URL and maps the payload', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => BACKEND_PAYLOAD })
    vi.stubGlobal('fetch', f)

    const { result } = renderHook(() => useCompareTokens([]))
    await act(async () => {
      await result.current.addToken('solana', ADDR)
    })

    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0]?.[0]).toContain('/api/v1/rugcharts/analyze/')
    const { ranked } = result.current
    expect(ranked).toHaveLength(1)
    const token = ranked[0]?.token
    expect(token?.symbol).toBe('USDC')
    expect(token?.price_usd).toBe(1)
    expect(token?.volume_24h).toBe(123456)
    expect(token?.risk_score).toBe(12)
    expect(token?.risk_level).toBe('LOW')
    expect(result.current.loading).toBe(false)
  })

  it('URL-encodes the address and passes the chain query param', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => BACKEND_PAYLOAD })
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useCompareTokens([]))
    await act(async () => {
      await result.current.addToken('base', 'a/b c')
    })
    expect(f.mock.calls[0]?.[0]).toBe(compareAnalyzeUrl('a/b c', 'base'))
  })

  it('adds nothing on non-2xx (honest failure, no crash)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
    const { result } = renderHook(() => useCompareTokens([]))
    await act(async () => {
      await result.current.addToken('solana', ADDR)
    })
    expect(result.current.ranked).toHaveLength(0)
    expect(result.current.loading).toBe(false)
  })

  it('adds nothing on network error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useCompareTokens([]))
    await act(async () => {
      await result.current.addToken('solana', ADDR)
    })
    expect(result.current.ranked).toHaveLength(0)
  })

  it('ignores empty chain/address', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useCompareTokens([]))
    await act(async () => {
      await result.current.addToken('', ADDR)
      await result.current.addToken('solana', '')
    })
    expect(f).not.toHaveBeenCalled()
  })
})
