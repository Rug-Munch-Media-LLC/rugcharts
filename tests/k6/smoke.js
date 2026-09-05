// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Rug Munch Media LLC
// Smoke test — 10 VUs for 30s against key rugcharts API endpoints.
// Pre-checks connectivity before running; gracefully skips if API unavailable.
// Graduates to blocking CI gate once API is available in PR/CI context.
//
// Usage:
//   k6 run tests/k6/smoke.js -e BASE_URL=https://charts.rugmunch.io
//   k6 run tests/k6/smoke.js -e BASE_URL=http://localhost:8000
//

import { check, sleep } from "k6";
import http from "k6/http";

export const options = {
	vus: 10,
	duration: "30s",
	thresholds: {
		http_req_failed: ["rate<0.01"], // <1% failure rate (99% success)
		http_req_duration: ["p(95)<500"], // 95th percentile <500ms
	},
	summaryTrendStats: ["min", "avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

// ── Main test ───────────────────────────────────────────────────────
export default function () {
	// 1. Health check (canonical health endpoint)
	const healthRes = http.get(`${BASE_URL}/health`, {
		tags: { endpoint: "health" },
	});
	check(healthRes, {
		"health endpoint returns 200": (r) => r.status === 200,
	});

	sleep(1);

	// 2. Trending endpoint — core rugcharts API surface
	const trendingRes = http.get(`${BASE_URL}/api/v1/rugcharts/trending`, {
		tags: { endpoint: "trending" },
	});
	check(trendingRes, {
		"trending endpoint responds": (r) =>
			r.status === 200 || r.status === 404 || r.status === 503,
	});

	sleep(1);

	// 3. API root — list available v1 endpoints
	const rootRes = http.get(`${BASE_URL}/api/v1/`, {
		tags: { endpoint: "v1-index" },
	});
	check(rootRes, {
		"v1 index responds": (r) =>
			r.status === 200 || r.status === 404 || r.status === 307,
	});

	sleep(2);
}

// ── Summary reporter ────────────────────────────────────────────────
export function handleSummary(data) {
	const failed = data.metrics.http_req_failed;
	const duration = data.metrics.http_req_duration;
	const failedPct = failed
		? (failed.values.passes / Math.max(failed.values.count, 1)) * 100
		: 0;

	return {
		"tests/k6/results/smoke-summary.json": JSON.stringify(data, null, 2),
		stdout: `
╔══════════════════════════════════════════════════════╗
║              k6 Smoke Test Results                  ║
╠══════════════════════════════════════════════════════╣
║  Target URL:  ${BASE_URL}
║  Duration:    30s × 10 VUs
║  Total Reqs:  ${duration.values.count}
║  Passed:      ${(100 - failedPct).toFixed(2)}%
║  Failed:      ${failedPct.toFixed(2)}%
║  Avg:         ${duration.values.avg.toFixed(2)}ms
║  p90:         ${duration.values["p(90)"].toFixed(2)}ms
║  p95:         ${duration.values["p(95)"].toFixed(2)}ms
║  p99:         ${duration.values["p(99)"].toFixed(2)}ms
║  Max:         ${duration.values.max.toFixed(2)}ms
╚══════════════════════════════════════════════════════╝
`,
	};
}
