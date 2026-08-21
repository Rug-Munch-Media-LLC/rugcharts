import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useRugChartsPlugins } from '../useRugChartsPlugins'
import { intelUrl } from '@/services/rugchartsApi'

// The plugin viewer must load from the LIVE /rugcharts/intel route (via the
// typed layer) and map real sections onto plugin slots — slots without a
// live backend source stay empty, never fabricated.

const PAIR = 'G4p3tVvF9Dh9vFZxTzK1P9dPmX8wQ5yY2sQzXcJpump'

const INTEL = {
  success: true,
  data: {
    pair_info: { base_token_price_usd: 1.2 },
    rug_score: { score: 30, level: 'CAUTION', color: '#f59e0b', factors: ['Critically low liquidity (<$10K)'] },
    volume_authenticity: {
      authentic_score: 60,
      fake_volume_pct: 40,
      risk_level: 'MEDIUM',
      risk_flags: ['No 24h trading volume'],
      metrics: { volume_24h: 0 },
    },
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useRugChartsPlugins', () => {
  it('fetches the LIVE intel route and maps sections onto plugin slots', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => INTEL })
    vi.stubGlobal('fetch', f)

    const { result } = renderHook(() => useRugChartsPlugins({ tokenAddress: PAIR, chain: 'solana' }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(f).toHaveBeenCalledWith(intelUrl('solana', PAIR))
    expect(result.current.error).toBeNull()
    expect(result.current.plugins.risk_heatmap?.data).toEqual(INTEL.data.rug_score)
    expect(result.current.plugins.wash_trading?.data).toEqual(INTEL.data.volume_authenticity)
    expect(result.current.plugins.token_health?.data).toEqual(INTEL.data.pair_info)
  })

  it('leaves slots without live data empty (no fabrication)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => INTEL }))
    const { result } = renderHook(() => useRugChartsPlugins({ tokenAddress: PAIR, chain: 'solana' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plugins.wallet_flow).toBeUndefined()
    expect(result.current.plugins.supply_donut).toBeUndefined()
    expect(result.current.plugins.social_divergence).toBeUndefined()
  })

  it('sets an error (not fake data) when the backend returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
    const { result } = renderHook(() => useRugChartsPlugins({ tokenAddress: PAIR, chain: 'solana' }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(Object.keys(result.current.plugins)).toHaveLength(0)
  })

  it('skips the fetch without a token address', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    renderHook(() => useRugChartsPlugins({}))
    // Give the effect a tick; with no token the fetch must never run.
    await new Promise((r) => setTimeout(r, 0))
    expect(f).not.toHaveBeenCalled()
  })
})
