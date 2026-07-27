// @ts-nocheck

import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

const _COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#8b5cf6',
  '#9333ea',
  '#1d4ed8',
  '#22c55e',
  '#00E676',
]

function _Tooltip({ content }) {
  return (
    <div className="bg-[#0e0e16]/95 border border-white/10 rounded-xl p-3 backdrop-blur-xl shadow-2xl pointer-events-none z-50">
      <style>{`
        [data-tooltip] { position: relative; }
        [data-tooltip]:hover::after {
          content: attr(data-tooltip);
          position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
          background: #0e0e16; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; padding: 8px 12px; font-size: 11px; color: #e5e7eb;
          white-space: nowrap; z-index: 50; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  )
}

function RiskBadge({ value, size = 'md' }) {
  const color = value >= 70 ? '#ef4444' : value >= 50 ? '#f97316' : value >= 30 ? '#eab308' : '#22c55e'
  const label = value >= 70 ? 'CRITICAL' : value >= 50 ? 'HIGH' : value >= 30 ? 'MEDIUM' : 'LOW'
  const sizeClasses = size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-2xl' : 'text-sm'
  return (
    <div className="text-center">
      <div className={`${sizeClasses} font-black`} style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}

function CircularProgress({ value, size = 120, color = '#8b5cf6', label = '' }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>
          {Math.round(value)}
        </span>
        {label && <span className="text-[10px] text-gray-500 mt-1">{label}</span>}
      </div>
    </div>
  )
}

function ScorecardItem({ item }) {
  const passed = item.score <= 30
  return (
    <div
      className={`p-3 rounded-xl border ${passed ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white">{item.name}</span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
        >
          {passed ? '✓ PASS' : '✗ FAIL'}
        </span>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${item.score}%`, backgroundColor: passed ? '#22c55e' : '#ef4444' }}
        />
      </div>
      <div className="text-right text-[10px] text-gray-500 mt-1">{item.score.toFixed(0)}%</div>
    </div>
  )
}

function DonutChart({ data, outerRadius = 100, innerRadius = 60 }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
          innerRadius={innerRadius}
          paddingAngle={2}
          dataKey="value"
          isAnimationActive
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="rgba(0,0,0,0.2)" strokeWidth={2} />
          ))}
        </Pie>
        <RechartsTooltip
          contentStyle={{
            background: '#0e0e16',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '12px',
          }}
        />
        <Legend formatter={(value) => <span className="text-xs text-gray-400">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function StackedBarChart({ data, groups }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} stackOffset="sign" margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          {groups.map((g, i) => (
            <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={g.color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={g.color} stopOpacity={0.3} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
        />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <RechartsTooltip
          contentStyle={{
            background: 'rgba(14,14,22,0.95)',
            border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: '12px',
            fontSize: '11px',
            backdropFilter: 'blur(8px)',
          }}
          cursor={{ fill: 'rgba(139,92,246,0.05)' }}
        />
        {groups.map((g, i) => (
          <Bar key={i} dataKey={g.key} stackId="a" fill={`url(#grad-${i})`} name={g.label} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function DualLineChart({ data, lines }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          {lines.map((l, i) => (
            <linearGradient key={i} id={`lineGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={l.color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={l.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
        <XAxis
          dataKey={Object.keys(data[0] || {})[0]}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
        />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <RechartsTooltip
          contentStyle={{
            background: 'rgba(14,14,22,0.95)',
            border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: '12px',
            fontSize: '11px',
            backdropFilter: 'blur(8px)',
          }}
          cursor={{ stroke: 'rgba(139,92,246,0.3)', strokeWidth: 1 }}
        />
        {lines.map((l, i) => (
          <Line
            key={i}
            type="monotone"
            dataKey={l.key}
            stroke={l.color}
            strokeWidth={2}
            name={l.label}
            dot={{ fill: l.color, r: 3, stroke: '#0e0e16', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: l.color, stroke: '#fff', strokeWidth: 2 }}
          >
            <defs>
              <linearGradient id={`fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={l.color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={l.color} stopOpacity={0} />
              </linearGradient>
            </defs>
          </Line>
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function RadarChartComponent({ data, dimensions }) {
  const chartData = data.map((d) => ({ subject: d.name, risk: d.risk }))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} />
        <Radar name="Risk" dataKey="risk" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function HeatmapChart({ data, dimensions }) {
  if (!data?.length || !dimensions) return null
  const period = data[0].period || 'time'
  const maxVal = 100
  const getColor = (v) => {
    const pct = v / maxVal
    if (pct > 0.75) return '#ef4444'
    if (pct > 0.5) return '#f97316'
    if (pct > 0.25) return '#eab308'
    return '#22c55e'
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${dimensions.length}, 1fr)` }}>
          {/* Header row */}
          <div className="p-2 text-[10px] text-gray-500 font-bold uppercase">Period</div>
          {dimensions.map((d, i) => (
            <div key={i} className="p-2 text-[10px] text-gray-400 text-center font-bold">
              {d}
            </div>
          ))}
          {/* Data rows */}
          {data.map((row, ri) => (
            <div key={ri} className="contents">
              <div className="p-2 text-[10px] text-gray-400 font-mono">{row[period]}</div>
              {dimensions.map((d, di) => {
                const val = row[d.toLowerCase().replace(' ', '_')]
                return (
                  <div
                    key={di}
                    className="p-2 rounded-lg text-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: `${getColor(val)}30`, color: getColor(val) }}
                  >
                    {val}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HorizontalBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
        <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
        <YAxis type="category" dataKey="label" width={120} tick={{ fill: '#9ca3af', fontSize: 10 }} />
        <RechartsTooltip
          contentStyle={{
            background: '#0e0e16',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '11px',
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

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
