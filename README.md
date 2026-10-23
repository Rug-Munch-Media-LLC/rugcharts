# RugCharts

> Real-time crypto charting — token charts, market data pipelines and Telegram chart delivery.

**License:** [MIT](LICENSE) · **Canonical:** https://git.rugmunch.io/RugMunchMedia/rugcharts
**Mirrors:** [GitHub](https://github.com/Rug-Munch-Media-LLC) · [GitLab](https://gitlab.com/rug-munch-media-group) · [Codeberg](https://codeberg.org/RugMunchMedia)

**Clone over Nostr:** `git clone nostr://npub1e97559tn2j6j02shalmn5x6xv5jt8ejlclh6sta8nln0n55whwtszyrqud/git.cryptorugmunch.com/rugcharts` (GRASP)

> ✅ **ACTIVE STANDALONE PRODUCT (2026-08-30).** RugCharts is a standalone
> product: this repo carries its own chart engine + frontend, while the
> production API that serves [rugcharts.rugmunch.io](https://rugcharts.rugmunch.io)
> lives in [`rmi-backend`](https://git.rugmunch.io/RugMunchMedia/rmi-backend)
> (`app/routers/rugcharts/` → `/api/v1/rugcharts/*`,
> `app/databus/rugcharts_intel/` → 10 DataBus intelligence chains).
> Develop, deploy, and file issues here.

**Real-time crypto charting engine — token charts, market data pipelines,
and Telegram chart delivery.**

RugCharts generates trading-style charts for any token: price action,
liquidity, holder distribution — rendered server-side and delivered to the
web app and directly inside Telegram. Part of the
[Rug Munch](https://rugmunch.io) intelligence suite.

| Layer   | Stack                                              |
|---------|----------------------------------------------------|
| Backend | Python · FastAPI · chart generator · DataBus feeds |
| Frontend| React 19 · Vite · TypeScript                       |
| Bot     | python-telegram-bot chart delivery                 |

## Features

- **Server-side chart generation** — consistent, shareable token charts
- **Market data pipeline** — pluggable DataBus providers for prices/liquidity
- **Telegram bot** — `/chart <token>` renders and ships charts in-chat
- **REST API** — versioned endpoints under `/api`

## Repository Layout

```
backend/    FastAPI service (app/main.py, chart_generator.py, databus/, telegram_bot/)
frontend/   React + Vite chart UI (src/components, src/services)
```

## Quick Start

```bash
# backend (port 8000)
make install
make dev            # = make dev-backend (uvicorn)

# frontend
cd frontend
npm install
npm run dev
```

Run `make help` for all targets.

## Configuration

All provider keys and secrets are injected via environment variables at
runtime — never committed. Copy `.env.example` names into your deployment
secret store.

## Open-Core Model

This repository is open source (MIT): it demonstrates charting patterns for
crypto market data. The managed platform at [rugmunch.io](https://rugmunch.io)
runs the production charting infrastructure. See [OPEN-CORE.md](OPEN-CORE.md).

## Contributing

Conventional commits (`feat(scope):`, `fix(scope):`, `docs:`), tests for new
code paths, lint clean. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[AGENTS.md](AGENTS.md) for the agent contract.

## License

[MIT](./LICENSE) © Rug Munch Media LLC

## FAQ

See [docs/FAQ.md](docs/FAQ.md) for frequently asked questions.
