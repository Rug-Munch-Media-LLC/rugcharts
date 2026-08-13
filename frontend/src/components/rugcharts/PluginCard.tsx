// @ts-nocheck — extracted verbatim from PluginViewer (previously unchecked).
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { CircularProgress, HeatmapChart, riskColor, ScorecardItem } from './plugin-charts'

/** Renders a single plugin's payload into the right chart/card layout by `type`. */
export default function PluginCard({ plugin, color: _color }) {
  if (!plugin) return <div className="p-8 text-center text-gray-500">Loading...</div>

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
              borderColor: `${riskColor(
                summary.risk_level === 'CRITICAL'
                  ? 90
                  : summary.risk_level === 'HIGH'
                    ? 70
                    : summary.risk_level === 'MEDIUM'
                      ? 50
                      : 30,
              )}44`,
              color: riskColor(
                summary.risk_level === 'CRITICAL'
                  ? 90
                  : summary.risk_level === 'HIGH'
                    ? 70
                    : summary.risk_level === 'MEDIUM'
                      ? 50
                      : 30,
              ),
            }}
          >
            {summary.risk_level}
          </span>
        )}
      </div>

      {/* Token Health Scorecard */}
      {type === 'token_health' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center py-4">
            <CircularProgress
              value={summary.overall_score || 50}
              size={140}
              color={summary.overall_score > 70 ? '#22c55e' : summary.overall_score > 50 ? '#eab308' : '#ef4444'}
            />
          </div>
          {(summary.recommendations || []).map((rec, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-[10px] text-yellow-400"
            >
              ⚠ {rec}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {data.map((item, i) => (
              <ScorecardItem key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Supply Donut */}
      {type === 'supply_donut' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-6">
            <CircularProgress value={summary.genuine_holders_pct || 50} size={100} color="#22c55e" />
            <div className="text-center">
              <div className="text-2xl font-black" style={{ color: riskColor(summary.high_risk_percentage || 50) }}>
                {summary.high_risk_percentage.toFixed(0)}%
              </div>
              <div className="text-[10px] text-gray-500">High Risk Supply</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={50}
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
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2">
            {data.map((seg, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                <span className="text-gray-400">{seg.label}</span>
                <span className="text-white font-bold">{seg.value}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet Flow */}
      {type === 'wallet_flow' && (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <RechartsTooltip
              contentStyle={{
                background: '#0e0e16',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '11px',
              }}
            />
            {chart_config?.groups?.map((g, i) => (
              <Bar key={i} dataKey={g.key} fill={g.color} name={g.label} radius={[2, 2, 0, 0]} stackId="a" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Risk Heatmap */}
      {type === 'risk_heatmap' && <HeatmapChart data={data} dimensions={chart_config?.dimensions} />}

      {/* Cluster Activity */}
      {type === 'cluster_activity' && (
        <div>
          <div className="flex gap-2 mb-3 flex-wrap">
            {chart_config?.colors &&
              Object.entries(chart_config.colors).map(([name, color]) => (
                <div key={name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-gray-400">{name}</span>
                </div>
              ))}
          </div>
          <HeatmapChart data={data} dimensions={chart_config?.clusters} />
        </div>
      )}

      {/* Dual Line (wash trading, social) */}
      {(type === 'wash_trading' || type === 'social_divergence') && (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <RechartsTooltip
              contentStyle={{
                background: '#0e0e16',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '11px',
              }}
            />
            {chart_config?.lines?.map((l, i) => (
              <Line
                key={i}
                type="monotone"
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={2}
                name={l.label}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Radar (contract risk) */}
      {type === 'contract_risk' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-black" style={{ color: riskColor(summary.average_risk || 50) }}>
                {summary.average_risk.toFixed(0)}
              </div>
              <div className="text-[10px] text-gray-500">Avg Risk</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-green-400">{summary.passed_checks}</div>
              <div className="text-[10px] text-gray-500">Passed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-red-400">{summary.failed_checks}</div>
              <div className="text-[10px] text-gray-500">Failed</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={data.map((d) => ({ subject: d.name, risk: d.risk }))}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} />
              <Radar name="Risk" dataKey="risk" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          {(summary.red_flags || []).length > 0 && (
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

      {/* Horizontal Bar (holder evolution, fund flow) */}
      {(type === 'holder_evolution' || type === 'fund_flow') && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis type="category" dataKey="label" width={130} tick={{ fill: '#9ca3af', fontSize: 10 }} />
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
      )}
    </motion.div>
  )
}
