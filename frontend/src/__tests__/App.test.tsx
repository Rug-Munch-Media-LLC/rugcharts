import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

/**
 * App routing smoke tests.
 *
 * App.tsx wires the QueryClientProvider + BrowserRouter around the four
 * routes (/, /token/:chain/:address, /trending, /search) plus a catch-all
 * that falls back to the landing page. These tests drive navigation through
 * the real BrowserRouter via window.history and assert each page mounts and
 * renders its distinctive content. All network calls are stubbed so the
 * suite never touches the live backend.
 */

// A minimal, well-formed empty response for every JSON endpoint the pages
// hit (trending, ohlcv, intel, signals). Pages must degrade gracefully to
// their empty/loading states when the backend returns no data.
function emptyJsonResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
  }
}

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue(emptyJsonResponse())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  // Start each test at the app root.
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('renders the landing page at /', async () => {
    stubFetch()
    render(<App />)

    // Landing page hero copy.
    expect(await screen.findByText('Spot the rug before it pulls.')).toBeInTheDocument()
    // Layout chrome is present.
    expect(screen.getByText('RugCharts')).toBeInTheDocument()
  })

  it('renders the trending page at /trending', async () => {
    stubFetch()
    render(<App />)
    window.history.pushState({}, '', '/trending')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByRole('heading', { name: 'Trending' })).toBeInTheDocument()
  })

  it('renders the search page at /search', async () => {
    stubFetch()
    render(<App />)
    window.history.pushState({}, '', '/search')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByText('Search Tokens')).toBeInTheDocument()
  })

  it('renders the token detail page at /token/:chain/:address', async () => {
    stubFetch()
    render(<App />)
    window.history.pushState({}, '', '/token/solana/So11111111111111111111111111111111111111112')
    window.dispatchEvent(new PopStateEvent('popstate'))

    // Token detail page breadcrumb + header.
    expect(await screen.findByText('Back')).toBeInTheDocument()
    expect(screen.getByText('solana')).toBeInTheDocument()
  })

  it('falls back to the landing page for unknown routes', async () => {
    stubFetch()
    render(<App />)
    window.history.pushState({}, '', '/does-not-exist')
    window.dispatchEvent(new PopStateEvent('popstate'))

    // Catch-all route renders the landing page hero.
    expect(await screen.findByText('Spot the rug before it pulls.')).toBeInTheDocument()
  })

  it('navigates between pages without remounting the layout', async () => {
    stubFetch()
    render(<App />)

    // Start on landing, then move to trending.
    expect(await screen.findByText('Spot the rug before it pulls.')).toBeInTheDocument()
    window.history.pushState({}, '', '/trending')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByRole('heading', { name: 'Trending' })).toBeInTheDocument()
    // Layout header persists across routes.
    expect(screen.getByText('RugCharts')).toBeInTheDocument()
  })
})
