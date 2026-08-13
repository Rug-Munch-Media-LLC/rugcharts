// @ts-nocheck

import { AnimatePresence, motion } from 'framer-motion'
import PluginCard from './PluginCard'
import { PLUGIN_META } from './plugin-meta'
import { useRugChartsPlugins } from './useRugChartsPlugins'

// ─── Main Plugin Viewer ───
export default function RugChartsPluginViewer({ tokenAddress, chain }) {
  const { activeTab, setActiveTab, plugins, loading, error, fetchPlugins } = useRugChartsPlugins({
    tokenAddress,
    chain,
  })

  if (!tokenAddress) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">Enter a token address to view plugin analysis</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 mt-4">Loading plugin analysis...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {PLUGIN_META.map((meta) => {
          const isActive = activeTab === meta.name
          const _hasData = plugins[meta.name] && !plugins[meta.name].error
          const error = plugins[meta.name]?.error
          return (
            <button
              key={meta.name}
              onClick={() => setActiveTab(meta.name)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                isActive
                  ? 'text-white border-cyan-500/30 bg-cyan-500/20'
                  : 'text-gray-500 border-white/5 hover:text-white bg-white/5 hover:border-white/10'
              } ${error ? 'opacity-60' : ''}`}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
              {error && <span className="text-[9px] text-red-400">✗</span>}
            </button>
          )
        })}
      </div>

      {/* Active plugin */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {error ? (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm text-center">
              Error loading plugin: {error}
            </div>
          ) : (
            <PluginCard
              plugin={plugins[activeTab]}
              color={PLUGIN_META.find((m) => m.name === activeTab)?.color || '#8b5cf6'}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={fetchPlugins}
          className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 hover:border-white/20 transition-all"
        >
          ↻ Refresh Analysis
        </button>
      </div>
    </div>
  )
}
