import { useCallback, useEffect, useState } from 'react'
import { PLUGIN_META } from './plugin-meta'
import { fetchRugChartsIntel } from '@/services/rugchartsApi'

/** Raw payload shape returned for a single plugin from the rugcharts API. */
export interface PluginPayload {
  type?: string
  title?: string
  description?: string
  data?: unknown
  summary?: unknown
  chart_config?: unknown
  error?: string
}

export interface UseRugChartsPluginsOptions {
  tokenAddress?: string
  chain?: string
}

/**
 * Loads every plugin analysis for a token and manages the active tab.
 * Mirrors the previous inline state machine in RugChartsPluginViewer.
 */
export function useRugChartsPlugins({ tokenAddress, chain }: UseRugChartsPluginsOptions = {}) {
  const [activeTab, setActiveTab] = useState<string>(() => PLUGIN_META[0]?.name ?? '')
  const [plugins, setPlugins] = useState<Record<string, PluginPayload | undefined>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlugins = useCallback(async () => {
    if (!tokenAddress) return
    setLoading(true)
    setError(null)
    try {
      // LIVE route /api/v1/rugcharts/intel/{chain}/{pair} via the typed layer
      // (verified 2026-08-21). The old plugins/all aggregate never existed and
      // 404'd silently. Real intel sections are mapped onto the plugin slots
      // they measure; slots without a live backend source stay EMPTY (the
      // viewer renders "no data" for them) — never fabricated.
      const intel = await fetchRugChartsIntel(chain ?? 'solana', tokenAddress)
      if (!intel || !intel.data) throw new Error('No intel data returned')
      const { rug_score: rugScore, volume_authenticity: volAuth, pair_info: pairInfo } = intel.data
      const next: Record<string, PluginPayload | undefined> = {}
      if (rugScore) {
        next.risk_heatmap = {
          type: 'risk_heatmap',
          title: 'Rug Score',
          description: `Composite rug score ${rugScore.score}/100 (${rugScore.level})`,
          data: rugScore,
          summary: Array.isArray(rugScore.factors) ? rugScore.factors.join(' · ') : undefined,
        }
      }
      if (volAuth) {
        next.wash_trading = {
          type: 'wash_trading',
          title: 'Volume Authenticity',
          description: `Authenticity ${volAuth.authentic_score}/100 — ${volAuth.fake_volume_pct}% fake volume (${volAuth.risk_level})`,
          data: volAuth,
          summary: Array.isArray(volAuth.risk_flags) ? volAuth.risk_flags.join(' · ') : undefined,
        }
      }
      if (pairInfo && Object.keys(pairInfo).length > 0) {
        next.token_health = {
          type: 'token_health',
          title: 'Pair Info',
          description: 'DEX pair fundamentals from GeckoTerminal',
          data: pairInfo,
        }
      }
      setPlugins(next)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress, chain])

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  return { activeTab, setActiveTab, plugins, loading, error, fetchPlugins }
}
