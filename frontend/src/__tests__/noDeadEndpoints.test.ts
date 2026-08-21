// Dead-endpoint regression guard for RugCharts.
//
// The 2026-08-21 audit (section E) found the AI sidebar 100% dead: components
// fetched routes that never existed (/rugmaps/scan, /rugcharts/signals old
// prefix, /rugcharts/plugins/all, /rugmaps/rug-warning) — every call 404'd.
// All API access must go through services/rugchartsApi.ts. This test scans
// the source tree and fails if any file fetches a URL outside the verified
// route allow-lists.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = join(__dirname, '..')

// Probed LIVE on rmi-backend 2026-08-21 (200 with real data):
const LIVE_ALLOWLIST = [
  '/api/v1/rugcharts/intel/',
  '/api/v1/rugcharts/trending',
  '/api/v1/rugcharts/ohlcv/',
  '/api/v1/rugcharts/whales/',
  '/api/v1/rugmaps/analyze/',
]

// Present in backend HEAD (routers/rugcharts.py, commit d49523bc 2026-08-21)
// but NOT in the running process until the next rmi-backend restart.
// RE-VIEW after restart: probe these; on 200 move them to LIVE_ALLOWLIST.
const PENDING_DEPLOY_ALLOWLIST = [
  '/api/v1/rugcharts/analyze/',
  '/api/v1/rugcharts/signals/',
  '/api/v1/rugcharts/ta/',
]

const DEAD_PATHS = [
  '/rugmaps/scan',
  '/rugmaps/rug-warning',
  '/rugcharts/plugins/all',
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('no fetches to dead endpoints', () => {
  const files = walk(SRC_ROOT)
  const TYPED_CLIENT = 'services/rugchartsApi.ts'

  it('source tree is non-empty (guard self-check)', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const file of files) {
    const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
    if (rel === TYPED_CLIENT) continue

    it(`${rel} only fetches verified/pending routes`, () => {
      const src = readFileSync(file, 'utf8')
      const fetchUrls = [...src.matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1] ?? '')
      for (const url of fetchUrls) {
        if (!url.includes('/api/')) continue
        const ok =
          LIVE_ALLOWLIST.some((p) => url.includes(p)) || PENDING_DEPLOY_ALLOWLIST.some((p) => url.includes(p))
        expect(ok, `${rel}: fetch('${url}') is not a verified route — use services/rugchartsApi.ts`).toBe(true)
      }
    })
  }

  it('no source file references a known-dead path', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
      if (rel === TYPED_CLIENT) continue // documents dead paths in header comment
      const src = readFileSync(file, 'utf8')
      for (const dead of DEAD_PATHS) {
        if (src.includes(dead)) offenders.push(`${rel}: ${dead}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
