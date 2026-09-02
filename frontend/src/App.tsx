import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/rugcharts/Layout'
import LandingPage from './pages/LandingPage'
import SearchPage from './pages/SearchPage'
import TokenDetailPage from './pages/TokenDetailPage'
import TrendingPage from './pages/TrendingPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/token/:chain/:address" element={<TokenDetailPage />} />
            <Route path="/trending" element={<TrendingPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="*" element={<LandingPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
