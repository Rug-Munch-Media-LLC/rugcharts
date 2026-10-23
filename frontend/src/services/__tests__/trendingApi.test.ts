import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_BOARD, FIXTURE_EMPTY_BOARD } from '@/services/__fixtures__/trendingBoard'
import {
  fetchTrendingBoard,
  parseTrendingBoard,
  parseTrendingItem,
  TrendingUnavailable,
  trendingUrl,
} from '@/services/trendingApi'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('trendingUrl', () => {
  it('omits chain when the filter is "all" and always sends window + limit', () => {
    expect(trendingUrl({ chain: 'all', window: '6h', limit: 25 })).toBe('/api/v1/trending?window=6h&limit=25')
  })

  it('encodes the chain filter', () => {
    expect(trendingUrl({ chain: 'base', window: '24h' })).toBe('/api/v1/trending?chain=base&window=24h&limit=50')
  })
})

describe('parseTrendingBoard', () => {
  it('accepts the canonical { items, generated_at } contract', () => {
    const board = parseTrendingBoard(FIXTURE_BOARD)
    expect(board.items).toHaveLength(4)
    expect(board.generated_at).toBe('2026-10-23T12:00:00Z')
  })

  it('keeps a real empty board as success, not an error', () => {
    expect(parseTrendingBoard(FIXTURE_EMPTY_BOARD).items).toEqual([])
  })

  it('coerces numeric strings and preserves genuinely missing metrics as null', () => {
    const item = parseTrendingItem({
      chain: 'solana',
      token: 'mint',
      symbol: 'ABC',
      price: '0.42',
      volume: 12.5,
      mcap: 'n/a',
      buys: '',
    })
    expect(item?.price).toBe(0.42)
    expect(item?.volume).toBe(12.5)
    expect(item?.mcap).toBeNull()
    expect(item?.buys).toBeNull()
    expect(item?.score).toBeNull()
  })

  it('drops rows with no token identity instead of inventing one', () => {
    const board = parseTrendingBoard({
      generated_at: '2026-10-23T12:00:00Z',
      items: [{ chain: 'solana' }, { token: 'mint' }, null, 'nope'],
    })
    expect(board.items).toEqual([])
  })

  it('rejects a missing or unparseable generated_at', () => {
    expect(() => parseTrendingBoard({ items: [] })).toThrow(TrendingUnavailable)
    expect(() => parseTrendingBoard({ items: [], generated_at: 'not-a-date' })).toThrow(/bad_payload/)
  })

  it('rejects a legacy shape ({ tokens }) as bad payload', () => {
    expect(() => parseTrendingBoard({ tokens: [], count: 0, generated_at: '2026-10-23T12:00:00Z' })).toThrow(
      /items is not an array/,
    )
  })
})

describe('fetchTrendingBoard', () => {
  it('resolves the parsed board on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(FIXTURE_BOARD)))
    const board = await fetchTrendingBoard({ chain: 'solana', window: '24h' })
    expect(board.items[0]?.symbol).toBe('SOL')
  })

  it('maps 404 to reason=not_deployed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404)))
    await expect(fetchTrendingBoard()).rejects.toMatchObject({
      name: 'TrendingUnavailable',
      reason: 'not_deployed',
    })
  })

  it('maps 500 to reason=network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    await expect(fetchTrendingBoard()).rejects.toMatchObject({ reason: 'network' })
  })

  it('maps a thrown request to reason=network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchTrendingBoard()).rejects.toMatchObject({ reason: 'network' })
  })

  it('maps a non-JSON body to reason=bad_payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 })))
    await expect(fetchTrendingBoard()).rejects.toMatchObject({ reason: 'bad_payload' })
  })
})
