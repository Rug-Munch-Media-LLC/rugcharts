import {
  Activity,
  AlertOctagon,
  ChevronRight,
  Droplet,
  Eye,
  Lock,
  RefreshCw,
  Skull,
  TrendingDown,
  Users,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchRugChartsIntel, intelToRugWarnings } from '@/services/rugchartsApi'

export interface RugWarning {
  id: string
  level: 'CAUTION' | 'WARNING' | 'CRITICAL' | 'PULLING'
  category: 'liquidity' | 'holder' | 'trading' | 'deployer' | 'contract' | 'social'
  title: string
  description: string
  evidence?: string
  confidence: number
  detected_at: number
  time_to_estimated_pull?: string
  recommended_action?: string
}

interface RugPullWarningProps {
  chain: string
  tokenAddress: string
  initialWarnings?: RugWarning[]
  className?: string
}

const LEVEL_META: Record<
  RugWarning['level'],
  { color: string; bg: string; border: string; label: string; pulse: boolean }
> = {
  CAUTION: {
    color: '#FFB800',
    bg: 'rgba(255,184,0,0.08)',
    border: 'rgba(255,184,0,0.3)',
    label: 'CAUTION',
    pulse: false,
  },
  WARNING: {
    color: '#FF8C42',
    bg: 'rgba(255,140,66,0.1)',
    border: 'rgba(255,140,66,0.4)',
    label: 'WARNING',
    pulse: false,
  },
  CRITICAL: {
    color: '#FF3366',
    bg: 'rgba(255,51,102,0.12)',
    border: 'rgba(255,51,102,0.5)',
    label: 'CRITICAL',
    pulse: true,
  },
  PULLING: { color: '#FF0040', bg: 'rgba(255,0,64,0.2)', border: 'rgba(255,0,64,0.7)', label: 'PULLING', pulse: true },
}

const CATEGORY_META: Record<RugWarning['category'], { icon: any; label: string }> = {
  liquidity: { icon: Droplet, label: 'Liquidity' },
  holder: { icon: Users, label: 'Holders' },
  trading: { icon: Activity, label: 'Trading' },
  deployer: { icon: Skull, label: 'Deployer' },
  contract: { icon: Lock, label: 'Contract' },
  social: { icon: Eye, label: 'Social' },
}

// Pattern signatures that precede rug pulls
const RUG_SIGNATURES = [
  { pattern: 'liquidity_removal_pending', keywords: ['LP unlock', 'liquidity unlock', 'LP not burned'], weight: 30 },
  { pattern: 'concentrated_holders', keywords: ['top holder', 'bundled', 'concentrated'], weight: 15 },
  { pattern: 'deployer_serial_rugger', keywords: ['serial rugger', 'previous rugs', 'deployer rugs'], weight: 35 },
  { pattern: 'contract_not_renounced', keywords: ['not renounced', 'ownership not renounced'], weight: 20 },
  { pattern: 'honeypot_detected', keywords: ['honeypot', 'cant sell', 'sell disabled'], weight: 40 },
  { pattern: 'lp_can_be_removed', keywords: ['LP not locked', 'owner can remove LP'], weight: 25 },
]

function classifyPattern(text: string): string | null {
  const lower = text.toLowerCase()
  for (const sig of RUG_SIGNATURES) {
    if (sig.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return sig.pattern
    }
  }
  return null
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function RugPullWarning({ chain, tokenAddress, initialWarnings, className = '' }: RugPullWarningProps) {
  const [warnings, setWarnings] = useState<RugWarning[]>(initialWarnings || [])
  const [loading, setLoading] = useState(!initialWarnings)
  const [scanning, setScanning] = useState(false)
  const [_expanded, _setExpanded] = useState(false)

  const runScan = async () => {
    setScanning(true)
    try {
      // LIVE route /api/v1/rugcharts/intel via the typed layer (verified
      // 2026-08-21). The old rugmaps "rug-warning" route never existed and
      // 404'd silently. Real intel only — no warnings when intel has none.
      const intel = await fetchRugChartsIntel(chain, tokenAddress)
      setWarnings(intelToRugWarnings(intel) as RugWarning[])
    } catch (e) {
      console.error('[RugPullWarning] scan failed:', e)
    } finally {
      setScanning(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialWarnings) {
      setWarnings(initialWarnings)
      setLoading(false)
      return
    }
    runScan()
    // Auto-refresh every 30s for active warnings
    const interval = setInterval(runScan, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWarnings, runScan])

  // Aggregate stats
  const stats = useMemo(() => {
    const byLevel: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    for (const w of warnings) {
      byLevel[w.level] = (byLevel[w.level] || 0) + 1
      byCategory[w.category] = (byCategory[w.category] || 0) + 1
    }
    const overallRisk = warnings.reduce((s, w) => {
      const w8 = w.level === 'CRITICAL' || w.level === 'PULLING' ? 30 : w.level === 'WARNING' ? 15 : 5
      return s + w8 * (w.confidence / 100)
    }, 0)
    return { byLevel, byCategory, overallRisk: Math.min(100, overallRisk) }
  }, [warnings])

  const verdict = useMemo(() => {
    if (stats.overallRisk >= 60) return { color: '#FF0040', label: 'PULL IMMINENT', icon: Skull }
    if (stats.overallRisk >= 30) return { color: '#FF3366', label: 'CRITICAL RISK', icon: AlertOctagon }
    if (stats.overallRisk >= 15) return { color: '#FF8C42', label: 'HIGH RISK', icon: TrendingDown }
    return { color: '#06D6A0', label: 'NO IMMEDIATE THREAT', icon: Activity }
  }, [stats])

  const VerdictIcon = verdict.icon
  const isActivelyWarning = warnings.some((w) => w.level === 'CRITICAL' || w.level === 'PULLING')

  return (
    <div
      className={`bg-[#0a0a0f] border rounded-xl overflow-hidden ${
        isActivelyWarning ? 'border-[rgba(255,51,102,0.4)] animate-pulse' : 'border-[rgba(139,92,246,0.15)]'
      } ${className}`}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b border-[rgba(139,92,246,0.15)]"
        style={{ background: `linear-gradient(to right, ${verdict.color}10, transparent)` }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <VerdictIcon className="w-5 h-5" style={{ color: verdict.color }} />
            <div>
              <div className="text-base font-bold uppercase tracking-wider" style={{ color: verdict.color }}>
                {verdict.label}
              </div>
              <p className="text-[10px] text-[#5C6080] mt-0.5">
                Risk: {stats.overallRisk.toFixed(0)}/100 · {warnings.length} warning{warnings.length !== 1 ? 's' : ''}{' '}
                detected
              </p>
            </div>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="p-1.5 rounded bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.2)] disabled:opacity-50"
            title="Re-scan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Risk meter */}
        <div className="h-2 bg-[rgba(139,92,246,0.1)] rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.min(100, stats.overallRisk)}%`,
              background: `linear-gradient(to right, #FFB800, #FF8C42, #FF3366, #FF0040)`,
            }}
          />
        </div>

        {/* Category breakdown */}
        {Object.keys(stats.byCategory).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(stats.byCategory).map(([cat, count]) => {
              const meta = CATEGORY_META[cat as RugWarning['category']]
              const Icon = meta.icon
              return (
                <span
                  key={cat}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[rgba(139,92,246,0.08)] text-[#8B5CF6]"
                >
                  <Icon className="w-2.5 h-2.5" />
                  {meta.label}: {count}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Warning list */}
      {loading ? (
        <div className="p-6 text-center text-[#5C6080] text-xs">
          {scanning ? 'Re-scanning...' : 'Analyzing rug patterns...'}
        </div>
      ) : warnings.length === 0 ? (
        <div className="p-6 text-center">
          <div className="text-[#06D6A0] text-2xl mb-2">✓</div>
          <div className="text-[#F1F1F6] text-sm font-semibold">No rug patterns detected</div>
          <div className="text-[#5C6080] text-xs mt-1">Auto-rescanning every 30s</div>
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          {warnings
            .sort((a, b) => {
              const order = { CRITICAL: 0, PULLING: 1, WARNING: 2, CAUTION: 3 }
              return order[a.level] - order[b.level] || b.confidence - a.confidence
            })
            .map((w) => {
              const meta = LEVEL_META[w.level]
              const catMeta = CATEGORY_META[w.category]
              const Icon = catMeta.icon
              const pattern = classifyPattern(`${w.title} ${w.description}`)
              return (
                <div
                  key={w.id}
                  className="px-4 py-3 border-b border-[rgba(139,92,246,0.04)] hover:bg-[rgba(139,92,246,0.04)] transition-colors"
                  style={meta.pulse ? { animation: 'pulse 2s infinite' } : {}}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex flex-col items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 border"
                      style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            color: meta.color,
                            background: meta.bg,
                            borderColor: meta.border,
                            border: '1px solid',
                          }}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-[#5C6080] uppercase tracking-wider">{catMeta.label}</span>
                        {w.time_to_estimated_pull && (
                          <span className="text-[10px] text-[#FF3366] font-bold uppercase tracking-wider flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" />
                            ETA: {w.time_to_estimated_pull}
                          </span>
                        )}
                      </div>

                      <div className="text-[12px] font-semibold text-[#F1F1F6] mt-1">{w.title}</div>
                      <div className="text-[10px] text-[#5C6080] mt-0.5">{w.description}</div>

                      {w.evidence && (
                        <div className="mt-1.5 px-2 py-1 bg-[rgba(255,255,255,0.02)] rounded text-[10px] font-mono text-[#8B5CF6] truncate">
                          {w.evidence}
                        </div>
                      )}

                      {w.recommended_action && (
                        <div className="mt-1.5 flex items-start gap-1 text-[10px] text-[#06D6A0]">
                          <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{w.recommended_action}</span>
                        </div>
                      )}

                      {pattern && (
                        <div className="mt-1 text-[9px] text-[#5C6080] font-mono">
                          pattern: <span className="text-[#8B5CF6]">{pattern}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-[9px] text-[#5C6080] uppercase">Conf</div>
                      <div className="text-base font-bold" style={{ color: meta.color }}>
                        {w.confidence}%
                      </div>
                      <div className="text-[9px] text-[#5C6080] mt-1">{formatTimeAgo(w.detected_at)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}
