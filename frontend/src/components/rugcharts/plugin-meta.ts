export interface PluginMeta {
  name: string
  label: string
  icon: string
  color: string
}

/** Base API path for rugcharts plugin endpoints. */
export const BASE = ''

/** Metadata for every plugin type surfaced in the plugin viewer tab bar. */
export const PLUGIN_META: PluginMeta[] = [
  { name: 'wallet_flow', label: 'Wallet Flow', icon: '📊', color: '#22c55e' },
  { name: 'risk_heatmap', label: 'Risk Heatmap', icon: '🔥', color: '#ef4444' },
  { name: 'supply_donut', label: 'Supply Donut', icon: '🍩', color: '#8b5cf6' },
  { name: 'wash_trading', label: 'Wash Trading', icon: '⚡', color: '#f97316' },
  { name: 'contract_risk', label: 'Contract Risk', icon: '🔒', color: '#9333ea' },
  { name: 'social_divergence', label: 'Social Divergence', icon: '💬', color: '#06b6d4' },
  { name: 'holder_evolution', label: 'Holder Evolution', icon: '📈', color: '#eab308' },
  { name: 'fund_flow', label: 'Fund Flow', icon: '🌐', color: '#1d4ed8' },
  { name: 'cluster_activity', label: 'Cluster Activity', icon: '🕐', color: '#8b5cf6' },
  { name: 'token_health', label: 'Token Health', icon: '💚', color: '#22c55e' },
]
