import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TrendingPage from '@/pages/TrendingPage'
import { FIXTURE_BOARD, FIXTURE_EMPTY_BOARD } from '@/services/__fixtures__/trendingBoard'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TrendingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrendingPage', () => {
  it('renders ranked rows from { items, generated_at }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(FIXTURE_BOARD))),
    )
    renderPage()

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    // 1 header + 4 fixture items
    expect(rows).toHaveLength(5)
    expect(within(table).getByText('SOL')).toBeInTheDocument()
    expect(within(table).getByText('Wrapped SOL')).toBeInTheDocument()
    expect(screen.getByText(/4 ranked tokens/)).toBeInTheDocument()
  })

  it('labels risk bands in text, not color alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(FIXTURE_BOARD))),
    )
    renderPage()

    await screen.findByRole('table')
    expect(screen.getAllByText('Low risk').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('High risk')).toBeInTheDocument()
    expect(screen.getByText('Stable')).toBeInTheDocument()
  })

  it('renders a dash with a reason for every null metric', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(FIXTURE_BOARD))),
    )
    renderPage()

    await screen.findByRole('table')
    // VIRTUAL has no price/score; Pepe has no liquidity/change/score/source.
    const dashes = screen.getAllByTitle(/Not reported by this source|No launchpad bonding curve|Not enough data/)
    expect(dashes.length).toBeGreaterThanOrEqual(5)
    expect(dashes[0]).toHaveAttribute('title')
  })

  it('shows the unavailable state on 404 and fabricates no rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404)))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/Trending feed not deployed/i)
    expect(screen.getByText(/reason=not_deployed/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('SOL')).not.toBeInTheDocument()
  })

  it('shows an empty state, not an error, when the board is live but empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(FIXTURE_EMPTY_BOARD)))
    renderPage()

    expect(await screen.findByText(/No ranked tokens/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refetches with the selected chain and window', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(FIXTURE_BOARD)))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText(/Chain filter/i), { target: { value: 'base' } })
    fireEvent.click(screen.getByRole('button', { name: '6h' }))

    await screen.findByRole('table')
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('chain=base') && url.includes('window=6h'))).toBe(true)
  })
})
