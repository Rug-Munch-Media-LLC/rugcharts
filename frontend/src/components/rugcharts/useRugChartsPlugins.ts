import { useCallback, useEffect, useState } from 'react'
import { BASE, PLUGIN_META } from './plugin-meta'

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
      const res = await fetch(
        `${BASE}/api/v1/rugcharts/plugins/all?token_address=${encodeURIComponent(tokenAddress)}&chain=${chain}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { plugins?: Record<string, PluginPayload> }
      if (json.plugins) {
        setPlugins(json.plugins)
      } else {
        throw new Error('No plugins data returned')
      }
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
