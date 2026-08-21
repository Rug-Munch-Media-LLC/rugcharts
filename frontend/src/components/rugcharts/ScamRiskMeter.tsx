import {
  Activity,
  AlertTriangle,
  Droplet,
  ExternalLink,
  Lock,
  Shield,
  ShieldAlert,
  ShieldX,
  TrendingDown,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchRugChartsIntel, intelToRiskFactors } from '@/services/rugchartsApi'

export interface RiskFactor {
  category: 'concentration' | 'liquidity' | 'contract' | 'social' | 'deployer' | 'trading' | 'holder'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  evidence?: string
}

interface ScamRiskMeterProps {
  chain: string
  tokenAddress: string
  riskScore?: number // 0-100, optional override
  riskFactors?: RiskFactor[]
  className?: string
}

const SEVERITY_COLORS: Record<RiskFactor['severity'], string> = {
  low: '#06D6A0',
  medium: '#FFB800',
  high: '#FF8C42',
  critical: '#FF3366',
}

const SEVERITY_WEIGHTS: Record<RiskFactor['severity'], number> = {
  low: 5,
  medium: 15,
  high: 30,
  critical: 50,
}

function computeScore(factors: RiskFactor[]): number {
  return Math.min(
    100,
    factors.reduce((s, f) => s + SEVERITY_WEIGHTS[f.severity], 0),
  )
}

function getVerdict(score: number): { label: string; color: string; icon: any; description: string } {
  if (score >= 80)
    return {
      label: 'CRITICAL RISK',
      color: '#FF3366',
      icon: ShieldX,
      description: 'Multiple severe red flags detected. Likely scam or rug-pull.',
    }
  if (score >= 60)
    return {
      label: 'HIGH RISK',
      color: '#FF8C42',
      icon: ShieldAlert,
      description: 'Significant concerns. Exercise extreme caution.',
    }
  if (score >= 30)
    return {
      label: 'MODERATE RISK',
      color: '#FFB800',
      icon: Shield,
      description: 'Some concerning signals. Do your own research.',
    }
  return {
    label: 'LOW RISK',
    color: '#06D6A0',
    icon: Shield,
    description: 'No major red flags detected.',
  }
}

const CATEGORY_ICONS: Record<RiskFactor['category'], any> = {
  concentration: Users,
  liquidity: Droplet,
  contract: Lock,
  social: Activity,
  deployer: AlertTriangle,
  trading: TrendingDown,
  holder: Users,
}

const CATEGORY_LABELS: Record<RiskFactor['category'], string> = {
  concentration: 'Concentration',
  liquidity: 'Liquidity',
  contract: 'Contract',
  social: 'Social',
  deployer: 'Deployer',
  trading: 'Trading',
  holder: 'Holders',
}

export default function ScamRiskMeter({
  chain,
  tokenAddress,
  riskScore: providedScore,
  riskFactors: providedFactors,
  className = '',
}: ScamRiskMeterProps) {
  const [factors, setFactors] = useState<RiskFactor[]>(providedFactors || [])
  const [loading, setLoading] = useState(!providedFactors)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (providedFactors) {
      setFactors(providedFactors)
      setLoading(false)
      return
    }
    // Fetch from backend — LIVE route /api/v1/rugcharts/intel/{chain}/{pair}
    // via the typed layer (verified 2026-08-21). The old rugmaps "scan"
    // query-param route never existed and 404'd silently.
    const fetchRisk = async () => {
      try {
        const intel = await fetchRugChartsIntel(chain, tokenAddress)
        setFactors(intelToRiskFactors(intel) as RiskFactor[])
      } catch (e) {
        console.error('[ScamRiskMeter] fetch failed:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchRisk()
  }, [chain, tokenAddress, providedFactors])

  const score = providedScore ?? computeScore(factors)
  const verdict = getVerdict(score)
  const VerdictIcon = verdict.icon

  // Group factors by category for display
  const byCategory = factors.reduce((acc: Record<string, RiskFactor[]>, f) => {
    if (!acc[f.category]) {
      acc[f.category] = []
    }
    acc[f.category].push(f)
    return acc
  }, {})

  return (
    <div
      className={`bg-gradient-to-b from-[#0a0a0f] to-[#0f0f17] border border-[rgba(255,51,102,0.2)] rounded-xl overflow-hidden ${className}`}
    >
      {/* Top: Score arc + verdict */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#8B5CF6]" />
            <span className="text-xs uppercase tracking-widest text-[#5C6080] font-semibold">RMI Sentinel</span>
          </div>
          <a
            href={`/rugmaps?token=${encodeURIComponent(tokenAddress)}&chain=${chain}`}
            className="text-[10px] text-[#8B5CF6] hover:underline flex items-center gap-1"
          >
            Full Report <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="flex items-center gap-4">
          {/* Arc meter */}
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="rgba(139,92,246,0.1)" strokeWidth="8" fill="none" />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke={verdict.color}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(score / 100) * 264} 264`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold" style={{ color: verdict.color }}>
                {score}
              </div>
              <div className="text-[9px] text-[#5C6080] uppercase tracking-wider">/ 100</div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div
              className="text-base font-bold uppercase tracking-wider flex items-center gap-2"
              style={{ color: verdict.color }}
            >
              <VerdictIcon className="w-4 h-4" />
              {verdict.label}
            </div>
            <div className="text-xs text-[#F1F1F6]/80 mt-1">{verdict.description}</div>
            <div className="text-[10px] text-[#5C6080] mt-1.5 font-mono">
              {chain} · {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}
            </div>
          </div>
        </div>
      </div>

      {/* Factor bars by category */}
      {!loading && factors.length > 0 && (
        <div className="border-t border-[rgba(139,92,246,0.1)]">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-[rgba(139,92,246,0.04)] transition-colors"
          >
            <span className="text-[11px] uppercase tracking-wider text-[#F1F1F6] font-semibold">
              {factors.length} Risk Factor{factors.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-[#5C6080]">{expanded ? '▼ collapse' : '▶ expand'}</span>
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
              {Object.entries(byCategory).map(([cat, facts]) => (
                <div key={cat} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-[#5C6080] font-semibold flex items-center gap-1 pt-2">
                    {(() => {
                      const CatIcon = CATEGORY_ICONS[cat as RiskFactor['category']]
                      return <CatIcon className="w-3 h-3" />
                    })()}
                    {CATEGORY_LABELS[cat as RiskFactor['category']]}
                  </div>
                  {facts.map((f, i) => (
                    <div
                      key={i}
                      className="border-l-2 pl-2 py-1 text-[11px]"
                      style={{ borderColor: SEVERITY_COLORS[f.severity] }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                          style={{ color: SEVERITY_COLORS[f.severity], background: `${SEVERITY_COLORS[f.severity]}20` }}
                        >
                          {f.severity}
                        </span>
                        <span className="font-semibold text-[#F1F1F6]">{f.title}</span>
                      </div>
                      <div className="text-[#5C6080] mt-0.5">{f.description}</div>
                      {f.evidence && (
                        <div className="text-[10px] text-[#8B5CF6] font-mono mt-0.5 truncate">{f.evidence}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <div className="px-4 py-3 text-center text-[10px] text-[#5C6080]">Analyzing risk factors...</div>}
    </div>
  )
}
