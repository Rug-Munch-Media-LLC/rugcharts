import { useState, useEffect, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Activity, Droplet, Users, TrendingUp, TrendingDown, Shield, ShieldAlert } from 'lucide-react';

export interface ComparisonToken {
  chain: string;
  address: string;
  symbol: string;
  name?: string;
  price_usd: number;
  price_change_24h: number;
  volume_24h: number;
  liquidity_usd: number;
  holder_count: number;
  top_holder_pct: number;
  risk_score: number;
  risk_level?: string;
  market_cap?: number;
  age_hours?: number;
}

interface MultiChainCompareProps {
  initialTokens?: ComparisonToken[];
  className?: string;
}

const CHAIN_META: Record<string, { name: string; color: string; icon: string }> = {
  solana: { name: 'Solana', color: '#9945FF', icon: '◎' },
  ethereum: { name: 'Ethereum', color: '#627EEA', icon: 'Ξ' },
  base: { name: 'Base', color: '#0052FF', icon: '⊙' },
  bsc: { name: 'BSC', color: '#F0B90B', icon: '⬡' },
  arbitrum: { name: 'Arbitrum', color: '#28A0F0', icon: '◆' },
  optimism: { name: 'Optimism', color: '#FF0420', icon: '⬢' },
  polygon: { name: 'Polygon', color: '#8247E5', icon: '⬣' },
};

const EXPLORERS: Record<string, string> = {
  solana: 'https://dexscreener.com/solana/',
  ethereum: 'https://dexscreener.com/ethereum/',
  base: 'https://dexscreener.com/base/',
  bsc: 'https://dexscreener.com/bsc/',
  arbitrum: 'https://dexscreener.com/arbitrum/',
  optimism: 'https://dexscreener.com/optimism/',
  polygon: 'https://dexscreener.com/polygon/',
};

// Smart scoring: composite of safety, momentum, distribution
function computeWinnerScore(t: ComparisonToken): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Risk score (lower is better) → +50 if low risk
  if (t.risk_score < 30) { score += 50; reasons.push('Low risk (+50)'); }
  else if (t.risk_score < 60) { score += 25; reasons.push('Medium risk (+25)'); }
  else { reasons.push('High risk (0)'); }

  // Holder distribution (lower top holder % = healthier)
  if (t.top_holder_pct < 10) { score += 30; reasons.push('Decentralized holders (+30)'); }
  else if (t.top_holder_pct < 25) { score += 15; reasons.push('Moderate concentration (+15)'); }
  else { reasons.push('Concentrated (0)'); }

  // Liquidity depth (higher = safer)
  if (t.liquidity_usd > 100000) { score += 20; reasons.push('Deep liquidity (+20)'); }
  else if (t.liquidity_usd > 10000) { score += 10; reasons.push('Adequate liquidity (+10)'); }
  else { reasons.push('Thin liquidity (0)'); }

  // Volume trend (positive = momentum)
  if (t.price_change_24h > 10) { score += 15; reasons.push('Strong momentum (+15)'); }
  else if (t.price_change_24h > 0) { score += 8; reasons.push('Mild momentum (+8)'); }
  else if (t.price_change_24h > -10) { reasons.push('Slight decline (0)'); }
  else { reasons.push('Heavy dump (0)'); }

  return { score, reasons };
}

export default function MultiChainCompare({ initialTokens = [], className = '' }: MultiChainCompareProps) {
  const [tokens, setTokens] = useState<ComparisonToken[]>(initialTokens);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const perPage = 4;

  // Add token by chain+address
  const addToken = async (chain: string, address: string) => {
    if (!chain || !address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/rugcharts/analyze/${encodeURIComponent(address)}?chain=${chain}`);
      if (res.ok) {
        const data = await res.json();
        const token: ComparisonToken = {
          chain,
          address,
          symbol: data.symbol || data.token_symbol || address.slice(0, 6),
          name: data.name || data.token_name,
          price_usd: Number(data.price_usd || data.price || 0),
          price_change_24h: Number(data.price_change_24h || data.priceChange24h || 0),
          volume_24h: Number(data.volume_24h || data.volume || 0),
          liquidity_usd: Number(data.liquidity_usd || data.liquidity || 0),
          holder_count: Number(data.holder_count || data.holders || 0),
          top_holder_pct: Number(data.top_holder_pct || data.top10Pct || 0),
          risk_score: Number(data.risk_score || data.riskScore || 0),
          risk_level: data.risk_level || data.riskLevel,
          market_cap: Number(data.market_cap || data.fdv || 0),
          age_hours: Number(data.age_hours || data.ageHours || 0),
        };
        setTokens(prev => [...prev, token]);
      }
    } catch (e) {
      console.error('[MultiChainCompare] add failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const removeToken = (idx: number) => {
    setTokens(prev => prev.filter((_, i) => i !== idx));
  };

  // Quick-add via search
  const handleAdd = () => {
    // Parse "chain:address" or just address
    let chain = 'solana';
    let addr = search.trim();
    if (addr.includes(':')) {
      [chain, addr] = addr.split(':', 2);
    }
    if (addr) {
      addToken(chain, addr);
      setSearch('');
    }
  };

  // Compute winner ranking
  const ranked = useMemo(() => {
    return tokens
      .map((t, idx) => ({ token: t, idx, ...computeWinnerScore(t) }))
      .sort((a, b) => b.score - a.score);
  }, [tokens]);

  const winner = ranked[0];

  const visiblePage = ranked.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(ranked.length / perPage);

  return (
    <div className={`bg-[#0a0a0f] border border-[rgba(139,92,246,0.15)] rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.15)] bg-gradient-to-r from-[rgba(139,92,246,0.08)] to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#F1F1F6] uppercase tracking-wider">Multi-Chain Comparison</h3>
            <p className="text-[10px] text-[#5C6080] mt-0.5">Compare up to 4 tokens · AI picks winner based on safety + momentum</p>
          </div>
          {winner && (
            <div className="text-right">
              <div className="text-[10px] text-[#5C6080] uppercase tracking-wider">Best pick</div>
              <div className="text-sm font-bold text-[#06D6A0] flex items-center gap-1">
                {winner.token.symbol} <span className="text-[10px] text-[#FFB800]">{winner.score}/100</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-add bar */}
      <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.08)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="chain:address (e.g. solana:So1111... or just 0x...)"
            className="flex-1 px-3 py-1.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(139,92,246,0.08)] rounded-lg text-xs text-[#F1F1F6] placeholder:text-[#5C6080] focus:border-[#8B5CF6]/30 focus:outline-none font-mono"
          />
          <button
            onClick={handleAdd}
            disabled={loading || !search.trim()}
            className="px-3 py-1.5 bg-[#8B5CF6] hover:bg-[#A78BFA] disabled:opacity-50 rounded-lg text-xs font-semibold uppercase tracking-wider text-white transition-colors"
          >
            {loading ? '...' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Comparison grid */}
      {ranked.length === 0 ? (
        <div className="p-8 text-center text-[#5C6080] text-xs">
          Add tokens to compare. Format: <code className="text-[#8B5CF6]">chain:address</code> · Default chain is solana.
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-wider text-[#5C6080] font-bold pb-1 border-b border-[rgba(139,92,246,0.08)]">
            <div className="col-span-2">Token</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-1 text-right">24h</div>
            <div className="col-span-2 text-right">Volume</div>
            <div className="col-span-2 text-right">Liquidity</div>
            <div className="col-span-1 text-right">Holders</div>
            <div className="col-span-1 text-right">Risk</div>
            <div className="col-span-1 text-right"></div>
          </div>

          {/* Token rows */}
          {visiblePage.map(({ token, idx, score, reasons }) => {
            const meta = CHAIN_META[token.chain] || CHAIN_META.solana;
            const isWinner = winner?.idx === idx;
            return (
              <div
                key={`${token.chain}-${token.address}-${idx}`}
                className={`grid grid-cols-12 gap-2 items-center text-[11px] py-1.5 px-1 rounded transition-colors ${
                  isWinner ? 'bg-[rgba(6,214,160,0.08)] border border-[rgba(6,214,160,0.3)]' : 'hover:bg-[rgba(139,92,246,0.04)]'
                }`}
              >
                <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                  <span className="text-sm" style={{ color: meta.color }}>{meta.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-[#F1F1F6] truncate">{token.symbol}</span>
                      {isWinner && <span className="text-[10px] text-[#06D6A0]">★</span>}
                    </div>
                    <a
                      href={`${EXPLORERS[token.chain] || ''}${token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-[#5C6080] hover:text-[#8B5CF6] truncate block font-mono"
                    >
                      {token.address.slice(0, 8)}...{token.address.slice(-4)}
                    </a>
                  </div>
                </div>
                <div className="col-span-2 text-right font-mono text-[#F1F1F6]">
                  ${token.price_usd < 0.01 ? token.price_usd.toExponential(2) : token.price_usd.toFixed(token.price_usd < 1 ? 4 : 2)}
                </div>
                <div className={`col-span-1 text-right font-mono font-semibold flex items-center justify-end gap-0.5 ${
                  token.price_change_24h >= 0 ? 'text-[#06D6A0]' : 'text-[#FF3366]'
                }`}>
                  {token.price_change_24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(token.price_change_24h).toFixed(1)}%
                </div>
                <div className="col-span-2 text-right font-mono text-[#F1F1F6]">
                  ${token.volume_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="col-span-2 text-right font-mono text-[#F1F1F6] flex items-center justify-end gap-1">
                  <Droplet className="w-3 h-3 text-[#22D3EE]" />
                  ${token.liquidity_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="col-span-1 text-right font-mono text-[#F1F1F6] flex items-center justify-end gap-1">
                  <Users className="w-3 h-3 text-[#5C6080]" />
                  {token.holder_count.toLocaleString()}
                </div>
                <div className="col-span-1 text-right">
                  <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    token.risk_score < 30 ? 'bg-[rgba(6,214,160,0.15)] text-[#06D6A0]' :
                    token.risk_score < 60 ? 'bg-[rgba(255,184,0,0.15)] text-[#FFB800]' :
                    'bg-[rgba(255,51,102,0.15)] text-[#FF3366]'
                  }`}>
                    {token.risk_score < 30 ? <Shield className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
                    {token.risk_score}
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  <button
                    onClick={() => removeToken(idx)}
                    className="text-[10px] text-[#5C6080] hover:text-[#FF3366] transition-colors"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-[10px]">
              <span className="text-[#5C6080]">
                Page {page + 1} of {totalPages} · {ranked.length} tokens
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.2)] disabled:opacity-30 rounded"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.2)] disabled:opacity-30 rounded"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Winner explanation */}
      {winner && (
        <div className="px-4 py-3 border-t border-[rgba(139,92,246,0.08)] bg-[rgba(6,214,160,0.04)]">
          <div className="text-[10px] uppercase tracking-wider text-[#06D6A0] font-bold mb-1.5 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Why {winner.token.symbol} wins ({winner.score}/100)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {winner.reasons.map((r, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(6,214,160,0.1)] text-[#06D6A0] border border-[rgba(6,214,160,0.2)]">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}