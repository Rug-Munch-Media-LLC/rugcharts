// @ts-nocheck

import { motion } from 'framer-motion'
import {
  CircularProgress,
  DonutChart,
  DualLineChart,
  HeatmapChart,
  HorizontalBarChart,
  RadarChartComponent,
  RiskBadge,
  ScorecardItem,
  StackedBarChart,
} from './plugin-charts'

// ─── Main Renderer ───

export function PluginRenderer({ plugin }) {
  if (!plugin) return <div className="text-gray-500 text-sm">No plugin data</div>

  const { type, title, description, data, summary, chart_config } = plugin
  if (!summary) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0e0e16]/80 border border-white/5 rounded-2xl p-4 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
        </div>
        {summary.risk_level && (
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-full border"
            style={{
              borderColor: `${
                summary.risk_level === 'CRITICAL'
                  ? '#ef4444'
                  : summary.risk_level === 'HIGH'
                    ? '#f97316'
                    : summary.risk_level === 'MEDIUM'
                      ? '#eab308'
                      : '#22c55e'
              }44`,
              color:
                summary.risk_level === 'CRITICAL'
                  ? '#ef4444'
                  : summary.risk_level === 'HIGH'
                    ? '#f97316'
                    : summary.risk_level === 'MEDIUM'
                      ? '#eab308'
                      : '#22c55e',
            }}
          >
            {summary.risk_level}
          </span>
        )}
      </div>

      {/* Scorecard */}
      {type === 'token_health' && (
        <div className="mb-4">
          <div className="flex items-center justify-center mb-4">
            <CircularProgress
              value={summary.overall_score || 50}
              size={140}
              color={summary.overall_score > 70 ? '#22c55e' : summary.overall_score > 50 ? '#eab308' : '#ef4444'}
              label="Health Score"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(summary.recommendations || []).map((rec, i) => (
              <div
                key={i}
                className="p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-[10px] text-yellow-400"
              >
                ⚠ {rec}
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {data.map((item, i) => (
              <ScorecardItem key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Donut */}
      {type === 'supply_donut' && (
        <div className="space-y-3">
          <div className="flex items-center justify-center">
            <CircularProgress value={summary.genuine_holders_pct || 50} size={100} color="#22c55e" label="Genuine" />
            <div className="mx-4 text-center">
              <div
                className="text-lg font-black"
                style={{ color: summary.risk_level === 'CRITICAL' ? '#ef4444' : '#f97316' }}
              >
                {summary.high_risk_percentage.toFixed(0)}%
              </div>
              <div className="text-[10px] text-gray-500">High Risk</div>
            </div>
          </div>
          <DonutChart data={data} />
        </div>
      )}

      {/* Stacked Bar (wallet flow) */}
      {type === 'wallet_flow' && <StackedBarChart data={data} groups={chart_config.groups} />}

      {/* Heatmap */}
      {type === 'risk_heatmap' && <HeatmapChart data={data} dimensions={chart_config.dimensions} />}

      {/* Cluster Activity Heatmap */}
      {type === 'cluster_activity' && (
        <div>
          <div className="flex gap-2 mb-3 flex-wrap">
            {Object.entries(chart_config.colors || {}).map(([name, color]) => (
              <div key={name} className="flex items-center gap-1.5 text-[10px]">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-gray-400">{name}</span>
              </div>
            ))}
          </div>
          <HeatmapChart data={data} dimensions={chart_config.clusters} />
        </div>
      )}

      {/* Radar */}
      {type === 'contract_risk' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-8 mb-2">
            <RiskBadge value={summary.average_risk} size="md" />
            <div>
              <div className="text-xs text-gray-400">Passed</div>
              <div className="text-lg font-black text-green-400">
                {summary.passed_checks}/{summary.total_checks}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Failed</div>
              <div className="text-lg font-black text-red-400">
                {summary.failed_checks}/{summary.total_checks}
              </div>
            </div>
          </div>
          <RadarChartComponent data={data} dimensions={data.map((d) => d.name)} />
          {summary.red_flags?.length > 0 && (
            <div className="space-y-1.5">
              {summary.red_flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] text-red-400">
                  <span>⚠</span> {flag}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Line Charts */}
      {(type === 'wash_trading' || type === 'social_divergence') && (
        <DualLineChart data={data} lines={chart_config.lines} />
      )}

      {/* Horizontal Bar */}
      {(type === 'holder_evolution' || type === 'fund_flow') && <HorizontalBarChart data={data} />}
    </motion.div>
  )
}

// ─── Summary Cards ───

export function PluginSummary({ plugin }) {
  if (!plugin?.summary) return null
  const { summary } = plugin

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {Object.entries(summary)
        .filter(([k]) => k !== 'recommendations' && k !== 'red_flags')
        .map(([key, val]) => (
          <div key={key} className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">{key.replace(/_/g, ' ')}</div>
            <div className="text-sm font-bold text-white mt-0.5 truncate">
              {typeof val === 'number' ? (val >= 100 ? Math.round(val) : val.toFixed(1)) : String(val)}
            </div>
          </div>
        ))}
    </div>
  )
}
