// TEST FIXTURES ONLY — never imported by app code, never rendered.
// Shaped exactly like GET /api/v1/trending so the parser and the page are
// exercised against the real contract, including deliberate null metrics.
import type { TrendingBoard } from '@/services/trendingApi'

export const FIXTURE_BOARD: TrendingBoard = {
  generated_at: '2026-10-23T12:00:00Z',
  items: [
    {
      chain: 'solana',
      token: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Wrapped SOL',
      price: 191.42,
      mcap: 108_400_000_000,
      liquidity: 42_000_000,
      price_change: 4.21,
      buys: 18_402,
      sells: 14_118,
      volume: 912_000_000,
      bonding_progress: null,
      score: 12,
      source: 'dexscreener',
    },
    {
      chain: 'solana',
      token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin',
      price: 1,
      mcap: 34_800_000_000,
      liquidity: 91_000_000,
      price_change: 0.01,
      buys: 4_201,
      sells: 3_998,
      volume: 402_000_000,
      bonding_progress: null,
      score: 5,
      source: 'dexscreener',
    },
    {
      chain: 'base',
      token: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
      symbol: 'VIRTUAL',
      name: 'Virtuals Protocol',
      price: null,
      mcap: null,
      liquidity: 1_240_000,
      price_change: -7.4,
      buys: 812,
      sells: 1_377,
      volume: 3_910_000,
      bonding_progress: 63.5,
      score: 71,
      source: 'pumpfun',
    },
    {
      chain: 'ethereum',
      token: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
      symbol: null,
      name: 'Pepe',
      price: 0.00000891,
      mcap: 3_740_000_000,
      liquidity: null,
      price_change: null,
      buys: null,
      sells: null,
      volume: 121_000_000,
      bonding_progress: null,
      score: null,
      source: null,
    },
  ],
}

/** A live-but-empty board: the UI must show "empty", never "unavailable". */
export const FIXTURE_EMPTY_BOARD: TrendingBoard = {
  generated_at: '2026-10-23T12:00:00Z',
  items: [],
}
