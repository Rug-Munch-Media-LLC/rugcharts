import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  compareAnalyzeUrl,
  fetchCompareAnalyze,
  fetchRugChartsIntel,
  fetchRugmapsAnalyze,
  intelToRiskFactors,
  intelToRugWarnings,
  intelUrl,
  ohlcvUrl,
  rugmapsAnalyzeUrl,
  trendingUrl,
  whalesUrl,
  type RugChartsIntelResult,
} from '../rugchartsApi'

const PAIR = 'G4p3tVvF9Dh9vFZxTzK1P9dPmX8wQ5yY2sQzXcJpump'

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
}

// Real-shaped intel payload captured from the LIVE endpoint 2026-08-21.
const INTEL: RugChartsIntelResult = {
  success: true,
  data: {
    pair_info: {},
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

describe('rugchartsApi URL builders (must target verified routes)', () => {
  it('intelUrl hits LIVE /rugcharts/intel/{chain}/{pair}', () => {
    expect(intelUrl('solana', PAIR)).toBe(`/api/v1/rugcharts/intel/solana/${PAIR}`)
  })

  it('trendingUrl hits LIVE /rugcharts/trending', () => {
    expect(trendingUrl()).toBe('/api/v1/rugcharts/trending')
  })

  it('ohlcvUrl hits LIVE /rugcharts/ohlcv/{chain}/{pair}', () => {
    expect(ohlcvUrl('base', PAIR)).toBe(`/api/v1/rugcharts/ohlcv/base/${PAIR}`)
  })

  it('whalesUrl hits LIVE /rugcharts/whales/{chain}/{token}', () => {
    expect(whalesUrl('solana', PAIR)).toBe(`/api/v1/rugcharts/whales/solana/${PAIR}`)
  })

  it('rugmapsAnalyzeUrl hits LIVE /rugmaps/analyze/{address}', () => {
    expect(rugmapsAnalyzeUrl(PAIR, 'solana')).toBe(`/api/v1/rugmaps/analyze/${PAIR}?chain=solana`)
  })

  it('compareAnalyzeUrl targets /rugcharts/analyze/{address} (backend HEAD, pending deploy)', () => {
    expect(compareAnalyzeUrl(PAIR, 'base')).toBe(`/api/v1/rugcharts/analyze/${PAIR}?chain=base`)
  })

  it('URL-encodes path segments', () => {
    expect(intelUrl('solana', 'a/b c')).toBe('/api/v1/rugcharts/intel/solana/a%2Fb%20c')
  })
})

describe('rugchartsApi fetchers (mocked network — no live backend calls)', () => {
  it('fetchRugChartsIntel maps the live payload', async () => {
    const f = mockFetchOk(INTEL)
    vi.stubGlobal('fetch', f)
    const result = await fetchRugChartsIntel('solana', PAIR)
    expect(f).toHaveBeenCalledWith(intelUrl('solana', PAIR))
    expect(result?.success).toBe(true)
    expect(result?.data.rug_score.score).toBe(30)
  })

  it('fetchRugChartsIntel returns null on non-2xx / network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }))
    expect(await fetchRugChartsIntel('solana', PAIR)).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    expect(await fetchRugChartsIntel('solana', PAIR)).toBeNull()
  })

  it('fetchRugmapsAnalyze hits the rugmaps route', async () => {
    const f = mockFetchOk({ address: PAIR, node_count: 1, link_count: 0, risk_level: 'unknown', risk_score: 0, stats: {}, top_counterparties: [] })
    vi.stubGlobal('fetch', f)
    const result = await fetchRugmapsAnalyze(PAIR)
    expect(f).toHaveBeenCalledWith(rugmapsAnalyzeUrl(PAIR, 'solana'))
    expect(result?.risk_level).toBe('unknown')
  })

  it('fetchCompareAnalyze maps the flat compare payload', async () => {
    const f = mockFetchOk({ chain: 'solana', address: PAIR, symbol: 'USDC', name: 'USDC/SOL', fallback_used: false, price_usd: 1, risk_score: 12, risk_level: 'LOW' })
    vi.stubGlobal('fetch', f)
    const result = await fetchCompareAnalyze(PAIR, 'solana')
    expect(f).toHaveBeenCalledWith(compareAnalyzeUrl(PAIR, 'solana'))
    expect(result?.symbol).toBe('USDC')
    expect(result?.risk_score).toBe(12)
  })
})

describe('intelToRiskFactors / intelToRugWarnings (real data only)', () => {
  it('maps rug_score factors into risk factors with severity from level', () => {
    const factors = intelToRiskFactors(INTEL)
    expect(factors).toHaveLength(1)
    expect(factors[0]).toMatchObject({
      category: 'liquidity',
      severity: 'medium', // CAUTION → medium
      title: 'Critically low liquidity (<$10K)',
    })
    expect(factors[0]?.description).toContain('30/100')
  })

  it('returns [] for null intel or missing factors (no fabrication)', () => {
    expect(intelToRiskFactors(null)).toEqual([])
    expect(intelToRiskFactors({ success: true, data: { pair_info: {}, rug_score: { score: 0, level: 'LOW', color: '', factors: [] }, volume_authenticity: { authentic_score: 100, fake_volume_pct: 0, risk_level: 'LOW', risk_flags: [] } } })).toEqual([])
  })

  it('maps both rug factors and volume risk flags into warnings', () => {
    const warnings = intelToRugWarnings(INTEL)
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatchObject({ id: 'rug-0', level: 'CAUTION', category: 'liquidity', title: 'Critically low liquidity (<$10K)', confidence: 30 })
    // MEDIUM volume risk normalizes onto the WARNING level of the UI union.
    expect(warnings[1]).toMatchObject({ id: 'vol-0', level: 'WARNING', category: 'trading', title: 'No 24h trading volume' })
  })

  it('returns [] for null intel', () => {
    expect(intelToRugWarnings(null)).toEqual([])
  })
})
