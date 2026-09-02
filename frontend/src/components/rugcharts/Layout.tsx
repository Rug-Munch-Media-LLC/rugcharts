import { Link, NavLink, Outlet } from 'react-router-dom'
import SearchBar from '@/components/rugcharts/SearchBar'
import type { TrendingToken } from '@/services/rugchartsApi'

interface LayoutProps {
  trendingTokens?: TrendingToken[]
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm transition-colors ${
    isActive ? 'bg-[rgba(139,92,246,0.15)] text-[#F1F1F6]' : 'text-text-secondary hover:text-[#F1F1F6]'
  }`

export default function Layout({ trendingTokens = [] }: LayoutProps) {
  return (
    <div className="min-h-screen bg-surface-900 text-text-primary">
      <header className="border-b border-[rgba(139,92,246,0.1)] px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center text-white font-bold text-sm">
              RC
            </div>
            <h1 className="text-lg font-bold tracking-tight">RugCharts</h1>
          </Link>

          <div className="flex-1 max-w-md hidden md:block">
            <SearchBar tokens={trendingTokens} />
          </div>

          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/trending" className={navLinkClass}>
              Trending
            </NavLink>
            <NavLink to="/search" className={navLinkClass}>
              Search
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        <Outlet />
      </main>

      <footer className="border-t border-[rgba(139,92,246,0.06)] px-4 py-4 text-center">
        <p className="text-xs text-text-muted">
          RugCharts v0.1.0 · Multi-Chain Token Intelligence · Powered by Rug Munch Media LLC
        </p>
      </footer>
    </div>
  )
}
