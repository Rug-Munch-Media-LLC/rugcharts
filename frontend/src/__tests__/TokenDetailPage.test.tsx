import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TokenDetailPage from '../pages/TokenDetailPage'

/**
 * TokenDetailPage tests.
 *
 * The page assembles the live components (TaCandleChart, ScamRiskMeter,
 * RugPullWarning, AISignals, LiveTradeTape) against the backend via
 * useQuery + useLiveTrades. These tests render it inside the providers it
 * needs (QueryClientProvider + Router) and stub the network so the page
 * degrades to its empty/loading states deterministically.
 */

const CHAIN = 'solana'
const ADDRESS = 'So11111111111111111111111111111111111111112'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/token/${CHAIN}/${ADDRESS}`]}>
        <Routes>
          <Route path="/token/:chain/:address" element={<TokenDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Stub every JSON endpoint the page (and its children) hit. The page must
// render its empty/loading states when the backend returns no data.
function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TokenDetailPage', () => {
  it('renders the breadcrumb and token header', async () => {
    stubFetch()
    renderPage()

    // Breadcrumb back link + chain label.
    expect(screen.getByText('Back')).toBeInTheDocument()
    expect(screen.getByText('solana')).toBeInTheDocument()

    // Header shows the truncated address.
    expect(screen.getByText(`${ADDRESS.slice(0, 8)}…${ADDRESS.slice(-4)}`)).toBeInTheDocument()
  })

  it('renders the risk meter and rug warning panels', async () => {
    stubFetch()
    renderPage()

    // ScamRiskMeter header.
    expect(screen.getByText('RMI Sentinel')).toBeInTheDocument()
    // RugPullWarning settles to the no-patterns state once the (empty) intel
    // fetch resolves — real data only, no fabricated warnings.
    expect(await screen.findByText('No rug patterns detected')).toBeInTheDocument()
  })

  it('shows the technical analysis section with no-data state', async () => {
    stubFetch()
    renderPage()

    expect(screen.getByText('Technical Analysis')).toBeInTheDocument()
    // With no OHLCV data, the chart area shows the empty state.
    expect(await screen.findByText('No OHLCV data available for this pair.')).toBeInTheDocument()
  })

  it('renders the AI signals and live trade tape sections', async () => {
    stubFetch()
    renderPage()

    expect(screen.getByText('AI Trade Signals')).toBeInTheDocument()
    expect(screen.getByText('Buy Vol')).toBeInTheDocument()
  })

  it('fetches OHLCV for the routed chain and address', async () => {
    const fetchMock = stubFetch()
    renderPage()

    await waitFor(() => {
      const ohlcvCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes(`/api/v1/rugcharts/ohlcv/${CHAIN}/${ADDRESS}`),
      )
      expect(ohlcvCall).toBeTruthy()
    })
  })
})
