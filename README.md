# RugCharts — Real-Time Token Analysis & Charting

> Professional crypto charting, TA bot analysis, and live trade streaming across 7 chains. Part of [Rug Munch Intelligence](https://rugmunch.io) — The Bloomberg Terminal of Shitcoins.

<p align="center">
  <img src="https://img.shields.io/badge/chains-7-blue" />
  <img src="https://img.shields.io/badge/tools-97-green" />
  <img src="https://img.shields.io/badge/x402-USDC-purple" />
  <img src="https://img.shields.io/badge/status-live-brightgreen" />
</p>

## What is RugCharts?

RugCharts is a premium token analysis and charting platform:

- **Live Trade Streaming** — Watch buys and sells happen in real-time on any token, any chain
- **TA Bot Analysis** — RSI, MACD, Moving Averages, Bollinger Bands, volume profile, all computed in real-time
- **Professional Charting** — Candlestick charts with OHLCV data, customizable timeframes
- **Multi-Chain Coverage** — Solana, Ethereum, Base, BSC, Arbitrum, Optimism, Polygon
- **Scam Detection Built In** — Every chart comes with Rug Munch risk scoring, honeypot checks, deployer analysis
- **Trading Signals** — AI-generated buy/sell signals with confidence scores
- **Market Context** — Chain-wide metrics, sentiment, and fear & greed alongside your token chart
- **Whale Tagging** — See which trades are whales, snipers, or bots in real-time

## Features

| Feature | Details |
|---------|---------|
| Live trade streaming | Real-time with whale/sniper/bot tagging |
| TA indicators | Full suite (RSI, MACD, MA, BB, Volume Profile) |
| Scam detection | Built-in risk scoring on every chart |
| Deployer tracking | Full deployer history and cross-references |
| Holder analysis | Deep dive with cluster detection |
| AI signals | AI-generated confidence scores |
| Chain coverage | Solana, ETH, Base, BSC, ARB, OPT, POL |
| OHLCV candles | Multiple timeframes with volume |

## API Access

RugCharts is accessible via the x402 per-call API:

```bash
# Get token analysis with charting data
curl -X POST https://cryptorugmunch.app/api/v1/x402-tools/token_deep_dive \
  -H "Content-Type: application/json" \
  -d '{"chain":"solana","token_address":"So11111111111111111111111111111111111111112"}'

# Get trading signals
curl -X POST https://cryptorugmunch.app/api/v1/rugcharts/signals/{address} \
  -H "Content-Type: application/json"

# Get OHLCV candles
curl -X POST https://cryptorugmunch.app/api/v1/rugcharts/ohlcv/{address}

# Technical analysis
curl -X POST https://cryptorugmunch.app/api/v1/rugcharts/ta/{address}
```

## Web Interface

Access RugCharts at [rugmunch.io](https://rugmunch.io) — the full RMI Command Center with:
- Real-time candlestick charts
- Technical indicator overlays
- Live trade feed
- Risk meter & threat assessment
- Whale activity tracking
- Cross-chain token comparison

## Part of Rug Munch Intelligence

RugCharts is part of the [Rug Munch Intelligence](https://rugmunch.io) platform — The Bloomberg Terminal of Shitcoins.

- **Web Terminal** — [rugmunch.io](https://rugmunch.io)
- **MCP Server** — 221 tools for AI agents via `pip install rug-munch-intelligence-mcp`
- **Token Scanner** — Multi-chain contract audit & rug pull detection
- **Wallet Scanner** — Wallet forensics & behavioral profiling
- **RugMaps** — Interactive scam network visualization
- **x402 Marketplace** — Pay-per-call for humans & AI agents
- **Telegram Bot** — [@rugmunchbot](https://t.me/rugmunchbot)

**We are building scam detection tools to keep retail investors and the broader crypto space safe from scams and scammers. The Bloomberg of Shitcoins — terminal ultimate edition.**

## License

MIT License — Copyright 2026 Rug Munch Media LLC