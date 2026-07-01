// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar,
  PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';

const BASE = '';

// ─── Plugin Metadata ───
const PLUGIN_META = [
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
];

// ─── Helpers ───
function riskColor(v) {
  if (v >= 70) return '#ef4444';
  if (v >= 50) return '#f97316';
  if (v >= 30) return '#eab308';
  return '#22c55e';
}

function CircularProgress({ value, size = 120, color = '#8b5cf6' }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>{Math.round(value)}</span>
      </div>
    </div>
  );
}

function ScorecardItem({ item }) {
  const passed = item.score <= 30;
  return (
    <div className={`p-3 rounded-xl border ${passed ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white">{item.name}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {passed ? '✓ PASS' : '✗ FAIL'}
        </span>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${item.score}%`, backgroundColor: passed ? '#22c55e' : '#ef4444' }} />
      </div>
      <div className="text-right text-[10px] text-gray-500 mt-1">{item.score.toFixed(0)}%</div>
    </div>
  );
}

function HeatmapChart({ data, dimensions }) {
  if (!data?.length || !dimensions) return null;
  const period = data[0].period || 'time';
  const getColor = (v) => {
    const pct = v / 100;
    if (pct > 0.75) return '#ef4444';
    if (pct > 0.5) return '#f97316';
    if (pct > 0.25) return '#eab308';
    return '#22c55e';
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${dimensions.length}, 1fr)` }}>
          <div className="p-2 text-[10px] text-gray-500 font-bold uppercase">Period</div>
          {dimensions.map((d, i) => (
            <div key={i} className="p-2 text-[10px] text-gray-400 text-center font-bold">{d}</div>
          ))}
          {data.map((row, ri) => (
            <div key={ri} className="contents">
              <div className="p-2 text-[10px] text-gray-400 font-mono">{row[period]}</div>
              {dimensions.map((d, di) => {
                const val = row[d.toLowerCase().replace(' ', '_')];
                return (
                  <div key={di} className="p-2 rounded-lg text-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: getColor(val) + '30', color: getColor(val) }}>
                    {val}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Plugin Card ───
function PluginCard({ plugin, color }) {
  if (!plugin) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  
  const { type, title, description, data, summary, chart_config } = plugin;
  if (!summary) return null;
  
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#0e0e16]/80 border border-white/5 rounded-2xl p-4 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
        </div>
        {summary.risk_level && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full border"
            style={{
              borderColor: riskColor(summary.risk_level === 'CRITICAL' ? 90 : summary.risk_level === 'HIGH' ? 70 : summary.risk_level === 'MEDIUM' ? 50 : 30) + '44',
              color: riskColor(summary.risk_level === 'CRITICAL' ? 90 : summary.risk_level === 'HIGH' ? 70 : summary.risk_level === 'MEDIUM' ? 50 : 30)
            }}>
            {summary.risk_level}
          </span>
        )}
      </div>

      {/* Token Health Scorecard */}
      {type === 'token_health' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center py-4">
            <CircularProgress value={summary.overall_score || 50} size={140}
              color={summary.overall_score > 70 ? '#22c55e' : summary.overall_score > 50 ? '#eab308' : '#ef4444'} />
          </div>
          {(summary.recommendations || []).map((rec, i) => (
            <div key={i} className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-[10px] text-yellow-400">
              ⚠ {rec}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {data.map((item, i) => <ScorecardItem key={i} item={item} />)}
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
              <Pie data={data} cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                paddingAngle={2} dataKey="value" isAnimationActive>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="rgba(0,0,0,0.2)" strokeWidth={2} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }} />
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
            <RechartsTooltip contentStyle={{ background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px' }} />
            {chart_config?.groups?.map((g, i) => (
              <Bar key={i} dataKey={g.key} fill={g.color} name={g.label} radius={[2,2,0,0]} stackId="a" />
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
            {chart_config?.colors && Object.entries(chart_config.colors).map(([name, color]) => (
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
            <RechartsTooltip contentStyle={{ background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px' }} />
            {chart_config?.lines?.map((l, i) => (
              <Line key={i} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={2} name={l.label} dot={false} />
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
            <RadarChart data={data.map(d => ({ subject: d.name, risk: d.risk }))}>
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
            <RechartsTooltip contentStyle={{ background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
}

// ─── Main Plugin Viewer ───
export default function RugChartsPluginViewer({ tokenAddress, chain }) {
  const [activeTab, setActiveTab] = useState(PLUGIN_META[0].name);
  const [plugins, setPlugins] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPlugins = useCallback(async () => {
    if (!tokenAddress) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/v1/rugcharts/plugins/all?token_address=${encodeURIComponent(tokenAddress)}&chain=${chain}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.plugins) {
        setPlugins(json.plugins);
      } else {
        throw new Error('No plugins data returned');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, chain]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  if (!tokenAddress) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">Enter a token address to view plugin analysis</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 mt-4">Loading plugin analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {PLUGIN_META.map((meta) => {
          const isActive = activeTab === meta.name;
          const hasData = plugins[meta.name] && !plugins[meta.name].error;
          const error = plugins[meta.name]?.error;
          return (
            <button key={meta.name} onClick={() => setActiveTab(meta.name)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                isActive
                  ? 'text-white border-cyan-500/30 bg-cyan-500/20'
                  : 'text-gray-500 border-white/5 hover:text-white bg-white/5 hover:border-white/10'
              } ${error ? 'opacity-60' : ''}`}>
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
              {error && <span className="text-[9px] text-red-400">✗</span>}
            </button>
          );
        })}
      </div>

      {/* Active plugin */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          {error ? (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm text-center">
              Error loading plugin: {error}
            </div>
          ) : (
            <PluginCard plugin={plugins[activeTab]} color={PLUGIN_META.find(m => m.name === activeTab)?.color || '#8b5cf6'} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Refresh button */}
      <div className="flex justify-end">
        <button onClick={fetchPlugins}
          className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 hover:border-white/20 transition-all">
          ↻ Refresh Analysis
        </button>
      </div>
    </div>
  );
}
