// @ts-nocheck — primitives extracted verbatim from previously-unchecked sources (PluginViewer/PluginRenderer).
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

/** Shared risk-color scale (0-100 → green/amber/orange/red). */
export function riskColor(v) {
  if (v >= 70) return '#ef4444'
  if (v >= 50) return '#f97316'
  if (v >= 30) return '#eab308'
  return '#22c55e'
}

export function _Tooltip({ content: _content }) {
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

export function RiskBadge({ value, size = 'md' }) {
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

export function CircularProgress({ value, size = 120, color = '#8b5cf6', label = '' }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
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

export function ScorecardItem({ item }) {
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

export function DonutChart({ data, outerRadius = 100, innerRadius = 60 }) {
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

export function StackedBarChart({ data, groups }) {
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

export function DualLineChart({ data, lines }) {
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

export function RadarChartComponent({ data, dimensions: _dimensions }) {
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

export function HeatmapChart({ data, dimensions }) {
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

export function HorizontalBarChart({ data }) {
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
