// Typed API client for RugCharts — the single gateway to the backend.
//
// LIVE-VERIFIED routes (probed 2026-08-21 against rmi-backend):
//   GET /api/v1/rugcharts/intel/{chain}/{pair_address}  → rug score + volume authenticity
//   GET /api/v1/rugcharts/trending                      → trending pairs
//   GET /api/v1/rugcharts/ohlcv/{chain}/{pair_address}  → candles
//   GET /api/v1/rugcharts/whales/{chain}/{token}        → whale activity
//   GET /api/v1/rugmaps/analyze/{address}?chain=        → holder-graph risk summary
//
// IN-BACKEND-HEAD BUT NOT YET IN THE RUNNING PROCESS (added by backend commit
// d49523bc 2026-08-21; live after the next rmi-backend restart — re-verify then):
//   GET /api/v1/rugcharts/analyze/{address}?chain=      → compare-table snapshot
//   GET /api/v1/rugcharts/signals/{address}?chain=      → AI signals feed
//
// Components must go through this module — raw fetch('/api/v1/...') calls are
// policed by src/__tests__/noDeadEndpoints.test.ts. The old /rugmaps/scan,
// /rugmaps/rug-warning and /rugcharts/plugins/all routes never existed and
// 404'd silently (2026-08-21 audit, section E).

export const API_BASE = '/api/v1'

// ── Response types (mirror the live router payloads) ────────────────────

export interface RugScore {
  score: number
  level: string
  color: string
  factors: string[]
}

export interface VolumeAuthenticity {
  authentic_score: number
  fake_volume_pct: number
  risk_level: string
  risk_flags: string[]
  metrics?: Record<string, number>
}

export interface RugChartsIntelData {
  pair_info: Record<string, unknown>
  rug_score: RugScore
  volume_authenticity: VolumeAuthenticity
  [key: string]: unknown
}

export interface RugChartsIntelResult {
  success: boolean
  data: RugChartsIntelData
}

export interface RugmapsAnalyzeResult {
  address: string
  node_count: number
  link_count: number
  risk_level: string
  risk_score: number
  stats: Record<string, number>
  top_counterparties: string[]
}

export interface CompareAnalyzeResult {
  chain: string
  address: string
  symbol: string
  name: string
  fallback_used: boolean
  price_usd?: number
  price_change_24h?: number
  volume_24h?: number
  liquidity_usd?: number
  holder_count?: number
  top_holder_pct?: number
  market_cap?: number
  risk_score?: number
  risk_level?: string
  age_hours?: number
}

// ── URL builders ────────────────────────────────────────────────────────

export function intelUrl(chain: string, pairAddress: string): string {
  return `${API_BASE}/rugcharts/intel/${encodeURIComponent(chain)}/${encodeURIComponent(pairAddress)}`
}

export function trendingUrl(): string {
  return `${API_BASE}/rugcharts/trending`
}

export function ohlcvUrl(chain: string, pairAddress: string): string {
  return `${API_BASE}/rugcharts/ohlcv/${encodeURIComponent(chain)}/${encodeURIComponent(pairAddress)}`
}

export function whalesUrl(chain: string, tokenAddress: string): string {
  return `${API_BASE}/rugcharts/whales/${encodeURIComponent(chain)}/${encodeURIComponent(tokenAddress)}`
}

export function rugmapsAnalyzeUrl(address: string, chain = 'solana'): string {
  return `${API_BASE}/rugmaps/analyze/${encodeURIComponent(address)}?chain=${encodeURIComponent(chain)}`
}

export function compareAnalyzeUrl(address: string, chain = 'solana'): string {
  return `${API_BASE}/rugcharts/analyze/${encodeURIComponent(address)}?chain=${encodeURIComponent(chain)}`
}

export function signalsUrl(token: string, chain = 'solana'): string {
  return `${API_BASE}/rugcharts/signals/${encodeURIComponent(token)}?chain=${encodeURIComponent(chain)}`
}

export function ohlcvUrlWithParams(chain: string, pairAddress: string, timeframe = '1h', limit = 100): string {
  return `${API_BASE}/rugcharts/ohlcv/${encodeURIComponent(chain)}/${encodeURIComponent(pairAddress)}?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`
}

// ── Fetchers (mocked in tests; never throw) ─────────────────────────────

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function fetchRugChartsIntel(chain: string, pairAddress: string): Promise<RugChartsIntelResult | null> {
  return getJson<RugChartsIntelResult>(intelUrl(chain, pairAddress))
}

export function fetchRugmapsAnalyze(address: string, chain = 'solana'): Promise<RugmapsAnalyzeResult | null> {
  return getJson<RugmapsAnalyzeResult>(rugmapsAnalyzeUrl(address, chain))
}

export function fetchCompareAnalyze(address: string, chain = 'solana'): Promise<CompareAnalyzeResult | null> {
  return getJson<CompareAnalyzeResult>(compareAnalyzeUrl(address, chain))
}

// ── Trending / OHLCV / Signals (live routes) ────────────────────────────

export interface TrendingToken {
  address: string
  name: string
  symbol: string
  chain: string
  icon?: string
  url?: string
  source?: string
  price_usd?: number
  change_24h?: number
  volume_24h?: number
  liquidity_usd?: number
  fdv?: number
  dex?: string
  pair_address?: string
  buys_24h?: number
  sells_24h?: number
  makers?: number
}

export interface TrendingResult {
  tokens: TrendingToken[]
  count: number
  chain: string
  source: string
}

export interface OhlcvCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OhlcvResult {
  candles: OhlcvCandle[]
  summary: Record<string, number | string>
  pair_info: Record<string, unknown>
  authenticity: Record<string, unknown>
  timeframe: string
  chain: string
}

export interface SignalEntry {
  id?: string
  type?: string
  signal_type?: string
  timestamp?: number
  time?: number
  price_at_signal?: number
  price?: number
  confidence?: number
  score?: number
  title?: string
  summary?: string
  reasoning?: string
  reason?: string
  indicators?: string[]
  indicator?: string
  target_price?: number
  target?: number
  stop_loss?: number
  stop?: number
  timeframe?: string
  horizon?: string
  outcome?: string
  actual_price?: number
}

export interface SignalsResult {
  signals: SignalEntry[]
  entries: SignalEntry[]
  count: number
  chain: string
  token: string
  current_price?: number
}

export function fetchTrending(chain = 'solana', limit = 30): Promise<TrendingResult | null> {
  return getJson<TrendingResult>(`${trendingUrl()}?chain=${encodeURIComponent(chain)}&limit=${limit}`)
}

export function fetchOhlcv(
  chain: string,
  pairAddress: string,
  timeframe = '1h',
  limit = 100,
): Promise<OhlcvResult | null> {
  return getJson<OhlcvResult>(ohlcvUrlWithParams(chain, pairAddress, timeframe, limit))
}

export function fetchSignals(token: string, chain = 'solana'): Promise<SignalsResult | null> {
  return getJson<SignalsResult>(signalsUrl(token, chain))
}

// ── Mappers: live intel payload → component shapes ──────────────────────

export interface RiskFactorLike {
  category: 'concentration' | 'liquidity' | 'contract' | 'social' | 'deployer' | 'trading' | 'holder'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
}

function severityFromRugLevel(level: string): RiskFactorLike['severity'] {
  const l = (level || '').toUpperCase()
  if (l === 'DANGER' || l === 'CRITICAL') return 'critical'
  if (l === 'HIGH') return 'high'
  if (l === 'CAUTION' || l === 'MEDIUM') return 'medium'
  return 'low'
}

function categoryFromFactorText(text: string): RiskFactorLike['category'] {
  const t = text.toLowerCase()
  if (t.includes('liquidity')) return 'liquidity'
  if (t.includes('volume')) return 'trading'
  if (t.includes('holder') || t.includes('supply')) return 'holder'
  if (t.includes('deployer')) return 'deployer'
  return 'contract'
}

/** Map the LIVE /rugcharts/intel rug_score factors into ScamRiskMeter factors.
 * Real data only — an intel payload with no factors yields an empty list. */
export function intelToRiskFactors(intel: RugChartsIntelResult | null): RiskFactorLike[] {
  const rug = intel?.data?.rug_score
  if (!rug || !Array.isArray(rug.factors)) return []
  const severity = severityFromRugLevel(rug.level)
  return rug.factors
    .filter((f) => typeof f === 'string' && f.length > 0)
    .map((title) => ({
      category: categoryFromFactorText(title),
      severity,
      title,
      description: `Rug score ${rug.score}/100 (${rug.level})`,
    }))
}

export interface RugWarningLike {
  id: string
  level: 'CAUTION' | 'WARNING' | 'CRITICAL'
  category: 'liquidity' | 'holder' | 'trading' | 'deployer' | 'contract' | 'social'
  title: string
  description: string
  confidence: number
  detected_at: number
}

/** Normalize the backend rug/volume levels onto the RugPullWarning union. */
function warningLevel(level: string): RugWarningLike['level'] {
  const l = (level || '').toUpperCase()
  if (l === 'DANGER' || l === 'CRITICAL' || l === 'PULLING') return 'CRITICAL'
  if (l === 'HIGH' || l === 'MEDIUM') return 'WARNING'
  return 'CAUTION'
}

/** Map the LIVE /rugcharts/intel payload into RugPullWarning entries. */
export function intelToRugWarnings(intel: RugChartsIntelResult | null): RugWarningLike[] {
  const data = intel?.data
  if (!data) return []
  const rug = data.rug_score
  const vol = data.volume_authenticity
  const now = Math.floor(Date.now() / 1000)
  const warnings: RugWarningLike[] = []
  if (rug && Array.isArray(rug.factors)) {
    rug.factors.forEach((title, i) => {
      if (typeof title !== 'string' || !title) return
      warnings.push({
        id: `rug-${i}`,
        level: warningLevel(rug.level),
        category: categoryFromFactorText(title),
        title,
        description: `Rug score ${rug.score}/100`,
        confidence: Math.max(0, Math.min(100, rug.score)),
        detected_at: now,
      })
    })
  }
  if (vol && Array.isArray(vol.risk_flags)) {
    vol.risk_flags.forEach((flag, i) => {
      if (typeof flag !== 'string' || !flag) return
      warnings.push({
        id: `vol-${i}`,
        level: warningLevel(vol.risk_level),
        category: 'trading',
        title: flag,
        description: `Volume authenticity ${vol.authentic_score}/100 (${vol.fake_volume_pct}% fake volume)`,
        confidence: Math.max(0, Math.min(100, 100 - vol.authentic_score)),
        detected_at: now,
      })
    })
  }
  return warnings
}
