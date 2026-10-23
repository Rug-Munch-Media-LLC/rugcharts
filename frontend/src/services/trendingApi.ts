// Typed client for the canonical trending board: GET /api/v1/trending
//
// Wire contract: { items: TrendingItem[], generated_at: string (ISO-8601) }
//
// The route is NOT live on every environment yet (the rugcharts backend still
// serves the legacy /api/v1/rugcharts/trending shape). This module therefore
// separates two things that must never be confused:
//   - transport failure  → throws TrendingUnavailable with a reason code
//   - a real empty board → resolves with { items: [] }
// The UI renders an explicit `unavailable` state; it never invents rows.

export const TRENDING_PATH = '/api/v1/trending'

export const TRENDING_WINDOWS = ['1h', '6h', '24h'] as const
export type TrendingWindow = (typeof TRENDING_WINDOWS)[number]

export const TRENDING_CHAINS = ['solana', 'ethereum', 'base', 'bsc', 'arbitrum', 'tron'] as const
export type TrendingChain = (typeof TRENDING_CHAINS)[number]

export type TrendingUnavailableReason = 'not_deployed' | 'network' | 'bad_payload'

/** Thrown when the board cannot be read. `reason` drives the UI copy. */
export class TrendingUnavailable extends Error {
  readonly reason: TrendingUnavailableReason
  readonly detail: string

  constructor(reason: TrendingUnavailableReason, detail: string) {
    super(`trending unavailable (${reason}): ${detail}`)
    this.name = 'TrendingUnavailable'
    this.reason = reason
    this.detail = detail
  }
}

/** One ranked token. Every metric is nullable — a missing metric is not a zero. */
export interface TrendingItem {
  chain: string
  token: string
  symbol: string | null
  name: string | null
  price: number | null
  mcap: number | null
  liquidity: number | null
  price_change: number | null
  buys: number | null
  sells: number | null
  volume: number | null
  /** Launchpad curve completion, 0-100. Null when the source has no curve. */
  bonding_progress: number | null
  /** Risk score, 0-100 (higher = riskier). Null when the source cannot score it. */
  score: number | null
  source: string | null
}

export interface TrendingBoard {
  items: TrendingItem[]
  generated_at: string
}

export interface TrendingQuery {
  chain?: TrendingChain | 'all'
  window?: TrendingWindow
  limit?: number
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Normalize one wire item. Returns null when the item has no usable identity. */
export function parseTrendingItem(raw: unknown): TrendingItem | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const token = asText(rec.token) ?? asText(rec.address)
  const chain = asText(rec.chain)
  if (!token || !chain) return null
  return {
    chain,
    token,
    symbol: asText(rec.symbol),
    name: asText(rec.name),
    price: asNumber(rec.price),
    mcap: asNumber(rec.mcap),
    liquidity: asNumber(rec.liquidity),
    price_change: asNumber(rec.price_change),
    buys: asNumber(rec.buys),
    sells: asNumber(rec.sells),
    volume: asNumber(rec.volume),
    bonding_progress: asNumber(rec.bonding_progress),
    score: asNumber(rec.score),
    source: asText(rec.source),
  }
}

/** Validate and normalize a wire payload. Throws TrendingUnavailable on shape drift. */
export function parseTrendingBoard(payload: unknown): TrendingBoard {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TrendingUnavailable('bad_payload', 'response is not an object')
  }
  const rec = payload as Record<string, unknown>
  const generatedAt = asText(rec.generated_at)
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new TrendingUnavailable('bad_payload', 'generated_at missing or unparseable')
  }
  if (!Array.isArray(rec.items)) {
    throw new TrendingUnavailable('bad_payload', 'items is not an array')
  }
  const items: TrendingItem[] = []
  for (const raw of rec.items) {
    const item = parseTrendingItem(raw)
    if (item) items.push(item)
  }
  return { items, generated_at: generatedAt }
}

export function trendingUrl({ chain = 'all', window = '24h', limit = 50 }: TrendingQuery = {}): string {
  const params = new URLSearchParams()
  if (chain !== 'all') params.set('chain', chain)
  params.set('window', window)
  params.set('limit', String(limit))
  return `${TRENDING_PATH}?${params.toString()}`
}

/** Fetch the board. 404/501/503 → 'not_deployed'; other failures → 'network'. */
export async function fetchTrendingBoard(query: TrendingQuery = {}, signal?: AbortSignal): Promise<TrendingBoard> {
  let response: Response
  try {
    response = await fetch(trendingUrl(query), { signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new TrendingUnavailable('network', err instanceof Error ? err.message : 'request failed')
  }
  if (!response.ok) {
    const reason =
      response.status === 404 || response.status === 501 || response.status === 503 ? 'not_deployed' : 'network'
    throw new TrendingUnavailable(reason, `HTTP ${response.status}`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new TrendingUnavailable('bad_payload', 'response body is not JSON')
  }
  return parseTrendingBoard(payload)
}
