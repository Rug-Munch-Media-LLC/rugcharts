"""
RugCharts shared setup
======================
Shared imports, configuration, chain mappings, and input-validation helpers
used by all RugCharts sub-routers.
"""

import json
import logging
import os
import re

import httpx
import redis
from fastapi import HTTPException

logger = logging.getLogger("rugcharts_router")

REDIS_HOST = os.getenv("REDIS_HOST", "rmi-redis")

# ── RMI-RAG configuration ──
RAG_API_URL = os.getenv("RAG_API_URL", "http://localhost:8012")

# ── ClickHouse configuration ──
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "ch")
CLICKHOUSE_PORT = os.getenv("CLICKHOUSE_PORT", "8123")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "default")
CLICKHOUSE_URL = f"http://{CLICKHOUSE_HOST}:{CLICKHOUSE_PORT}/"
CH_OHLCV_TTL = 120  # 2 minute cache
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

CACHE_TTL = 120  # 2 minutes for trending, 5 minutes for OHLCV
OHLCV_TTL = 300

# ── Chain configuration ─────────────────────────────────────────────────
# Each supported chain carries:
#   name             — human-readable display name
#   chain_id         — EVM chain ID (int) for EVM chains, else None
#   rpc_url          — optional public RPC endpoint (may be empty)
#   dexscreener_id   — DexScreener chain identifier (api.dexscreener.com)
#   geckoterminal_id — GeckoTerminal network identifier
#   data_source      — "dexscreener" when no direct RPC is configured
#                      (falls back to the DexScreener/GeckoTerminal APIs)
CHAIN_CONFIG: dict[str, dict] = {
    # ── Existing core chains ──
    "solana": {
        "name": "Solana",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "solana",
        "geckoterminal_id": "solana",
        "data_source": "dexscreener",
    },
    "ethereum": {
        "name": "Ethereum",
        "chain_id": 1,
        "rpc_url": "",
        "dexscreener_id": "ethereum",
        "geckoterminal_id": "eth",
        "data_source": "dexscreener",
    },
    "base": {
        "name": "Base",
        "chain_id": 8453,
        "rpc_url": "",
        "dexscreener_id": "base",
        "geckoterminal_id": "base",
        "data_source": "dexscreener",
    },
    "bsc": {
        "name": "BNB Smart Chain",
        "chain_id": 56,
        "rpc_url": "",
        "dexscreener_id": "bsc",
        "geckoterminal_id": "bsc",
        "data_source": "dexscreener",
    },
    "arbitrum": {
        "name": "Arbitrum",
        "chain_id": 42161,
        "rpc_url": "",
        "dexscreener_id": "arbitrum",
        "geckoterminal_id": "arbitrum",
        "data_source": "dexscreener",
    },
    "tron": {
        "name": "Tron",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "tron",
        "geckoterminal_id": "tron",
        "data_source": "dexscreener",
    },
    "polygon": {
        "name": "Polygon",
        "chain_id": 137,
        "rpc_url": "",
        "dexscreener_id": "polygon",
        "geckoterminal_id": "polygon_pos",
        "data_source": "dexscreener",
    },
    "avalanche": {
        "name": "Avalanche",
        "chain_id": 43114,
        "rpc_url": "",
        "dexscreener_id": "avax",
        "geckoterminal_id": "avax",
        "data_source": "dexscreener",
    },
    "optimism": {
        "name": "Optimism",
        "chain_id": 10,
        "rpc_url": "",
        "dexscreener_id": "optimism",
        "geckoterminal_id": "optimism",
        "data_source": "dexscreener",
    },
    # ── New chains (50+) ──
    "sui": {
        "name": "Sui",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "sui",
        "geckoterminal_id": "sui",
        "data_source": "dexscreener",
    },
    "aptos": {
        "name": "Aptos",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "aptos",
        "geckoterminal_id": "aptos",
        "data_source": "dexscreener",
    },
    "ton": {
        "name": "TON",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "ton",
        "geckoterminal_id": "ton",
        "data_source": "dexscreener",
    },
    "sei": {
        "name": "Sei",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "sei",
        "geckoterminal_id": "sei",
        "data_source": "dexscreener",
    },
    "movement": {
        "name": "Movement",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "movement",
        "geckoterminal_id": "movement",
        "data_source": "dexscreener",
    },
    "hyperliquid": {
        "name": "Hyperliquid",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "hyperliquid",
        "geckoterminal_id": "hyperliquid",
        "data_source": "dexscreener",
    },
    "injective": {
        "name": "Injective",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "injective",
        "geckoterminal_id": "injective",
        "data_source": "dexscreener",
    },
    "celestia": {
        "name": "Celestia",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "celestia",
        "geckoterminal_id": "celestia",
        "data_source": "dexscreener",
    },
    "near": {
        "name": "Near",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "near",
        "geckoterminal_id": "near",
        "data_source": "dexscreener",
    },
    "flow": {
        "name": "Flow",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "flow",
        "geckoterminal_id": "flow",
        "data_source": "dexscreener",
    },
    "cronos": {
        "name": "Cronos",
        "chain_id": 25,
        "rpc_url": "",
        "dexscreener_id": "cronos",
        "geckoterminal_id": "cronos",
        "data_source": "dexscreener",
    },
    "moonbeam": {
        "name": "Moonbeam",
        "chain_id": 1284,
        "rpc_url": "",
        "dexscreener_id": "moonbeam",
        "geckoterminal_id": "moonbeam",
        "data_source": "dexscreener",
    },
    "gnosis": {
        "name": "Gnosis",
        "chain_id": 100,
        "rpc_url": "",
        "dexscreener_id": "gnosis",
        "geckoterminal_id": "gnosis",
        "data_source": "dexscreener",
    },
    "fantom": {
        "name": "Fantom",
        "chain_id": 250,
        "rpc_url": "",
        "dexscreener_id": "fantom",
        "geckoterminal_id": "fantom",
        "data_source": "dexscreener",
    },
    "zksync": {
        "name": "zkSync",
        "chain_id": 324,
        "rpc_url": "",
        "dexscreener_id": "zksync",
        "geckoterminal_id": "zksync",
        "data_source": "dexscreener",
    },
    "linea": {
        "name": "Linea",
        "chain_id": 59144,
        "rpc_url": "",
        "dexscreener_id": "linea",
        "geckoterminal_id": "linea",
        "data_source": "dexscreener",
    },
    "scroll": {
        "name": "Scroll",
        "chain_id": 534352,
        "rpc_url": "",
        "dexscreener_id": "scroll",
        "geckoterminal_id": "scroll",
        "data_source": "dexscreener",
    },
    "mantle": {
        "name": "Mantle",
        "chain_id": 5000,
        "rpc_url": "",
        "dexscreener_id": "mantle",
        "geckoterminal_id": "mantle",
        "data_source": "dexscreener",
    },
    "blast": {
        "name": "Blast",
        "chain_id": 81457,
        "rpc_url": "",
        "dexscreener_id": "blast",
        "geckoterminal_id": "blast",
        "data_source": "dexscreener",
    },
    "celo": {
        "name": "Celo",
        "chain_id": 42220,
        "rpc_url": "",
        "dexscreener_id": "celo",
        "geckoterminal_id": "celo",
        "data_source": "dexscreener",
    },
    "aurora": {
        "name": "Aurora",
        "chain_id": 1313161554,
        "rpc_url": "",
        "dexscreener_id": "aurora",
        "geckoterminal_id": "aurora",
        "data_source": "dexscreener",
    },
    "oasis": {
        "name": "Oasis",
        "chain_id": 42262,
        "rpc_url": "",
        "dexscreener_id": "oasis",
        "geckoterminal_id": "oasis",
        "data_source": "dexscreener",
    },
    "kava": {
        "name": "Kava",
        "chain_id": 2222,
        "rpc_url": "",
        "dexscreener_id": "kava",
        "geckoterminal_id": "kava",
        "data_source": "dexscreener",
    },
    "canto": {
        "name": "Canto",
        "chain_id": 7700,
        "rpc_url": "",
        "dexscreener_id": "canto",
        "geckoterminal_id": "canto",
        "data_source": "dexscreener",
    },
    "velas": {
        "name": "Velas",
        "chain_id": 106,
        "rpc_url": "",
        "dexscreener_id": "velas",
        "geckoterminal_id": "velas",
        "data_source": "dexscreener",
    },
    "metis": {
        "name": "Metis",
        "chain_id": 1088,
        "rpc_url": "",
        "dexscreener_id": "metis",
        "geckoterminal_id": "metis",
        "data_source": "dexscreener",
    },
    "boba": {
        "name": "Boba",
        "chain_id": 288,
        "rpc_url": "",
        "dexscreener_id": "boba",
        "geckoterminal_id": "boba",
        "data_source": "dexscreener",
    },
    "moonriver": {
        "name": "Moonriver",
        "chain_id": 1285,
        "rpc_url": "",
        "dexscreener_id": "moonriver",
        "geckoterminal_id": "moonriver",
        "data_source": "dexscreener",
    },
    "astar": {
        "name": "Astar",
        "chain_id": 592,
        "rpc_url": "",
        "dexscreener_id": "astar",
        "geckoterminal_id": "astar",
        "data_source": "dexscreener",
    },
    "shiden": {
        "name": "Shiden",
        "chain_id": 336,
        "rpc_url": "",
        "dexscreener_id": "shiden",
        "geckoterminal_id": "shiden",
        "data_source": "dexscreener",
    },
    "energyweb": {
        "name": "Energy Web",
        "chain_id": 246,
        "rpc_url": "",
        "dexscreener_id": "energyweb",
        "geckoterminal_id": "energyweb",
        "data_source": "dexscreener",
    },
    "okxchain": {
        "name": "OKX Chain",
        "chain_id": 66,
        "rpc_url": "",
        "dexscreener_id": "okxchain",
        "geckoterminal_id": "okxchain",
        "data_source": "dexscreener",
    },
    "klaytn": {
        "name": "Klaytn",
        "chain_id": 8217,
        "rpc_url": "",
        "dexscreener_id": "klaytn",
        "geckoterminal_id": "klaytn",
        "data_source": "dexscreener",
    },
    "wemix": {
        "name": "Wemix",
        "chain_id": 1111,
        "rpc_url": "",
        "dexscreener_id": "wemix",
        "geckoterminal_id": "wemix",
        "data_source": "dexscreener",
    },
    "filecoin": {
        "name": "Filecoin",
        "chain_id": 314,
        "rpc_url": "",
        "dexscreener_id": "filecoin",
        "geckoterminal_id": "filecoin",
        "data_source": "dexscreener",
    },
    "hedera": {
        "name": "Hedera",
        "chain_id": 295,
        "rpc_url": "",
        "dexscreener_id": "hedera",
        "geckoterminal_id": "hedera",
        "data_source": "dexscreener",
    },
    "algorand": {
        "name": "Algorand",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "algorand",
        "geckoterminal_id": "algorand",
        "data_source": "dexscreener",
    },
    "casper": {
        "name": "Casper",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "casper",
        "geckoterminal_id": "casper",
        "data_source": "dexscreener",
    },
    "tezos": {
        "name": "Tezos",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "tezos",
        "geckoterminal_id": "tezos",
        "data_source": "dexscreener",
    },
    "cardano": {
        "name": "Cardano",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "cardano",
        "geckoterminal_id": "cardano",
        "data_source": "dexscreener",
    },
    "starknet": {
        "name": "Starknet",
        "chain_id": None,
        "rpc_url": "",
        "dexscreener_id": "starknet",
        "geckoterminal_id": "starknet",
        "data_source": "dexscreener",
    },
}

# GeckoTerminal network mapping (chain -> geckoterminal_id), derived from
# CHAIN_CONFIG so the allowlist and network lookups stay in sync.
GECKO_NETWORKS = {name: cfg["geckoterminal_id"] for name, cfg in CHAIN_CONFIG.items()}

# DexScreener chain mapping (chain -> dexscreener_id), derived from CHAIN_CONFIG.
DEXSCREENER_CHAINS = {name: cfg["dexscreener_id"] for name, cfg in CHAIN_CONFIG.items()}

# GoPlus chain-id mapping (chain -> EVM chain_id), derived from CHAIN_CONFIG.
GOPLUS_CHAIN_IDS = {
    name: str(cfg["chain_id"]) for name, cfg in CHAIN_CONFIG.items() if cfg["chain_id"]
}

# ── Input validation (SQL injection guards) ──────────────────────────────
# Both ``chain`` and ``pair_address`` are user-controlled path parameters
# that are interpolated into the ClickHouse OHLCV query. They are never
# allowed to reach the f-string query builder without passing the checks
# below. An allowlist for chains plus a strict address/pair-id format for
# pair_address means an attacker can only inject a fixed set of safe
# literal values.

VALID_CHAINS = frozenset(GECKO_NETWORKS)

# EVM pair addresses are 0x-prefixed 40-hex; Solana pubkeys and Tron
# addresses are base58 (32-44 chars). Both formats are accepted; anything
# else (quotes, semicolons, comments, whitespace) is rejected with HTTP 400.
PAIR_ADDRESS_RE = re.compile(r"^(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$")


def _validate_chain(chain: str) -> None:
    """Reject chains not in ``GECKO_NETWORKS`` with HTTP 400.

    Guards the ClickHouse query builder against SQL injection via the
    ``chain`` path parameter — unknown values are rejected before any
    f-string interpolation.
    """
    if chain not in VALID_CHAINS:
        raise HTTPException(status_code=400, detail=f"Unsupported chain '{chain}'")


def _validate_pair_address(pair_address: str) -> None:
    """Reject pair addresses that are not a safe address/pair-id format.

    Accepts EVM hex (``0x`` + 40 hex chars) or base58 (Solana/Tron). This
    blocks SQL injection payloads (quotes, semicolons, comments) before the
    value is interpolated into the ClickHouse query.
    """
    if not PAIR_ADDRESS_RE.fullmatch(pair_address):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid pair_address: expected a 0x-prefixed 40-character "
                "hex address or a base58 address"
            ),
        )


# Timeframe mapping for GeckoTerminal
GECKO_TIMEFRAMES = {
    "1m": ("minute", 1),
    "5m": ("minute", 5),
    "15m": ("minute", 15),
    "1h": ("hour", 1),
    "4h": ("hour", 4),
    "1d": ("day", 1),
    "7d": ("day", 1),
    "30d": ("day", 1),
}


def _r():
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=2,
    )


async def _fetch_rag_threat_intel(token_address: str, chain: str = "solana") -> dict:
    """Fetch threat intel from RMI-RAG for a token address."""
    cache_key = f"rugcharts:rag:{chain}:{token_address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
        pass

    result = {
        "scam_risk": "unknown",
        "confidence": 0,
        "matches": [],
        "source": None,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{RAG_API_URL}/api/v1/rag/v2/scam-check",
                params={
                    "address": token_address,
                    "chain": chain,
                    "limit": 5,
                    "tier": "free",
                },
            )
            if resp.status_code == 200:
                result = resp.json()
                result["source"] = "rugbrain"
    except Exception as e:
        logger.debug("RAG threat intel unavailable: %s", e)

    if result.get("matches"):
        try:
            r = _r()
            r.setex(cache_key, 300, json.dumps(result))
            r.close()
        except Exception:  # noqa: S110
            pass

    return result
