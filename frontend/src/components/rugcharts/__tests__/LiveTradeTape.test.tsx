import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LiveTradeTape from '../LiveTradeTape'

describe('LiveTradeTape', () => {
  it('renders with initial trades', () => {
    render(
      <LiveTradeTape
        chain="solana"
        tokenAddress="So11111111111111111111111111111111111111112"
        initialTrades={[
          {
            id: 't1',
            side: 'buy',
            amount_usd: 50000,
            amount_token: 350,
            price_usd: 142.5,
            wallet: 'ABC123XYZ789',
            wallet_label: 'whale',
            tx_hash: 'abc123def456',
            timestamp: Date.now(),
            chain: 'solana',
          },
        ]}
      />,
    )

    expect(screen.getByText('Buy Vol')).toBeInTheDocument()
  })

  it('shows waiting state when empty', () => {
    render(
      <LiveTradeTape chain="solana" tokenAddress="So11111111111111111111111111111111111111112" initialTrades={[]} />,
    )

    expect(screen.getByText('Waiting for trades...')).toBeInTheDocument()
  })
})
