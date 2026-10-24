# rugcharts

A small chart service: give it a token address, get a server-rendered price and
liquidity chart plus a live trade stream over WebSocket. It exists so the main app
does not have to embed a charting library or a provider SDK.

**Status:** beta · **Licence:** MIT, see [LICENSE](LICENSE).

Canonical: https://git.rugmunch.io/RugMunchMedia/rugcharts

## Quickstart

Python 3.11+ for the backend; the frontend is static files, no bundler.

```bash
git clone https://git.rugmunch.io/RugMunchMedia/rugcharts.git
cd rugcharts
make install          # backend deps, editable
make dev              # uvicorn on :8000
```

Serving the frontend alongside it:

```bash
make dev-frontend     # :5173, python -m http.server over frontend/
```

Compose builds both images:

```bash
docker compose up -d
```

Health check: `curl -s localhost:8000/health`.

## What it does

- **Chart generation.** `app/chart_generator.py` turns OHLCV rows into a rendered
  chart payload; the caller gets an image/JSON, not a JS widget.
- **Trade stream.** `app/ws/trades.py` pushes trades over WebSocket so the client
  does not poll.
- **Provider isolation.** `app/databus/` is the only place that talks to market
  data providers; routers never call out directly.
- **Static frontend.** No bundler, no framework — plain files served as-is, which
  is why `build-frontend` is a placeholder rather than a build.

## How it is put together

```
backend/app/
  main.py            FastAPI app, health, lifespan
  routers/rugcharts  chart endpoints
  ws/trades          WebSocket trade feed
  chart_generator    rendering
  databus/           provider calls and caching
frontend/            static HTML/JS/CSS
```

## Configuration

There is no `.env.example`; configuration is read from the environment and
compose passes it through.

| Variable | Purpose |
|---|---|
| `PORT` | backend port, default 8000 |
| `REDIS_URL` | optional cache for provider responses |
| `CORS_ORIGINS` | allowed browser origins |

## Known limits

- Rendering is CPU work on the request path. A burst of charts will queue.
- Historical depth depends entirely on what the upstream provider returns; there
  is no local OHLCV store.
- The frontend is deliberately plain. If you need a full SPA, this is the wrong
  repo.

## Licence

MIT.
