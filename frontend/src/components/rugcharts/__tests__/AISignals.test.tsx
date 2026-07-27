import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AISignals from '../AISignals'

describe('AISignals', () => {
  it('renders the heading with demo signals', () => {
    render(
      <AISignals
        chain="solana"
        tokenAddress="So11111111111111111111111111111111111111112"
        initialSignals={[
          {
            id: 's1',
            type: 'buy',
            timestamp: Date.now() / 1000,
            price_at_signal: 142.5,
            confidence: 78,
            title: 'Accumulation Pattern',
            reasoning: 'Multiple large buys from fresh wallets.',
            indicators: ['RSI Divergence'],
            target_price: 185,
            stop_loss: 128,
            timeframe: '4h',
            outcome: 'pending',
          },
        ]}
      />,
    )

    expect(screen.getByText('AI Trade Signals')).toBeInTheDocument()
    expect(screen.getByText('Accumulation Pattern')).toBeInTheDocument()
    expect(screen.getByText('BUY')).toBeInTheDocument()
  })

  it('shows loading state when no signals provided', () => {
    render(<AISignals chain="solana" tokenAddress="So11111111111111111111111111111111111111112" initialSignals={[]} />)

    expect(screen.getByText('AI Trade Signals')).toBeInTheDocument()
  })
})
