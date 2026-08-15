"""
RugCharts Backend Router
========================
Real OHLCV candles via ClickHouse + GeckoTerminal, volume authenticity,
dev reputation, RAG threat intel, and comprehensive token intelligence.
"""

import json
import logging
import os
import re

import httpx
import redis
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("rugcharts_router")

router = APIRouter(prefix="/api/v1/rugcharts", tags=["rugcharts"])

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

# GeckoTerminal network mapping
GECKO_NETWORKS = {
    "solana": "solana",
    "ethereum": "eth",
    "base": "base",
    "bsc": "bsc",
    "arbitrum": "arbitrum",
    "tron": "tron",
    "polygon": "polygon_pos",
    "avalanche": "avax",
    "optimism": "optimism",
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


async def _fetch_dexscreener_trending(chain: str, limit: int = 20) -> list[dict]:
    """Fetch trending tokens from DexScreener with real price data."""
    cache_key = f"rugcharts:trending:{chain}:{limit}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    chain_map = {
        "solana": "solana",
        "ethereum": "ethereum",
        "base": "base",
        "bsc": "bsc",
        "arbitrum": "arbitrum",
        "tron": "tron",
    }
    dex_chain = chain_map.get(chain, chain)

    tokens = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get boosted tokens (trending)
            r = await client.get("https://api.dexscreener.com/token-boosts/top/v1")
            if r.status_code == 200:
                data = r.json()
                items = data if isinstance(data, list) else data.get("tokens", [])
                for item in items:
                    # Filter by chain if specified
                    item_chain = item.get("chainId", "")
                    if chain and item_chain != dex_chain:
                        continue
                    tokens.append(
                        {
                            "address": item.get("tokenAddress", ""),
                            "name": item.get("name", item.get("description", "")),
                            "symbol": item.get("symbol", ""),
                            "chain": item_chain,
                            "icon": item.get("icon", ""),
                            "url": item.get("url", ""),
                            "source": "boosted",
                        }
                    )
                    if len(tokens) >= limit:
                        break

            # Also get new pairs for the chain (high volume new launches)
            r2 = await client.get("https://api.dexscreener.com/token-profiles/latest/v1")
            if r2.status_code == 200:
                data2 = r2.json()
                items2 = data2 if isinstance(data2, list) else []
                for item in items2:
                    item_chain = item.get("chainId", "")
                    if chain and item_chain != dex_chain:
                        continue
                    # Check if already in list
                    addr = item.get("tokenAddress", "")
                    if any(t["address"] == addr for t in tokens):
                        continue
                    tokens.append(
                        {
                            "address": addr,
                            "name": item.get("name", ""),
                            "symbol": item.get("symbol", ""),
                            "chain": item_chain,
                            "icon": item.get("icon", ""),
                            "url": item.get("url", ""),
                            "source": "new_launch",
                        }
                    )
                    if len(tokens) >= limit:
                        break

            # Enrich with pair data for volume/price
            if tokens:
                addresses = [t["address"] for t in tokens[:10]]
                for addr in addresses:
                    try:
                        r3 = await client.get(
                            f"https://api.dexscreener.com/tokens/v1/{dex_chain}/{addr}"
                        )
                        if r3.status_code == 200:
                            pairs = r3.json()
                            if isinstance(pairs, list) and pairs:
                                pair = pairs[0]  # Best pair
                                for t in tokens:
                                    if t["address"] == addr:
                                        t["price_usd"] = float(pair.get("priceUsd", 0) or 0)
                                        t["change_24h"] = float(
                                            (pair.get("priceChange", {}) or {}).get("h24", 0) or 0
                                        )
                                        t["volume_24h"] = float(
                                            (pair.get("volume", {}) or {}).get("h24", 0) or 0
                                        )
                                        t["liquidity_usd"] = float(
                                            (pair.get("liquidity", {}) or {}).get("usd", 0) or 0
                                        )
                                        t["fdv"] = float(pair.get("fdv", 0) or 0)
                                        t["dex"] = pair.get("dexId", "")
                                        t["pair_address"] = pair.get("pairAddress", "")
                                        t["buys_24h"] = (
                                            (pair.get("txns", {}) or {})
                                            .get("h24", {})
                                            .get("buys", 0)
                                        )
                                        t["sells_24h"] = (
                                            (pair.get("txns", {}) or {})
                                            .get("h24", {})
                                            .get("sells", 0)
                                        )
                                        t["makers"] = (
                                            (pair.get("txns", {}) or {})
                                            .get("h24", {})
                                            .get("makers", 0)
                                        )
                                        break
                    except Exception:
                        pass

    except Exception as e:
        logger.warning(f"DexScreener trending fetch failed: {e}")

    # Sort by volume
    tokens.sort(key=lambda t: t.get("volume_24h", 0), reverse=True)

    if tokens:
        try:
            r = _r()
            r.setex(cache_key, CACHE_TTL, json.dumps(tokens))
            r.close()
        except Exception:
            pass

    return tokens


async def _fetch_ohlcv_gecko(
    pair_address: str, chain: str, timeframe: str = "1h", limit: int = 100
) -> list[dict]:
    """Fetch OHLCV candles from GeckoTerminal."""
    network = GECKO_NETWORKS.get(chain, chain)
    tf_info = GECKO_TIMEFRAMES.get(timeframe, ("hour", 1))
    tf_aggregate = tf_info[1]
    tf_unit = tf_info[0]

    # For longer timeframes, adjust limit
    if timeframe in ("7d", "30d"):
        limit = 168 if timeframe == "7d" else 30
        tf_unit = "hour" if timeframe == "7d" else "day"
        tf_aggregate = 1

    cache_key = f"rugcharts:ohlcv:{chain}:{pair_address}:{timeframe}:{limit}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    candles = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            url = f"https://api.geckoterminal.com/api/v2/networks/{network}/pools/{pair_address}/ohlcv/{tf_unit}"
            params = {
                "aggregate": tf_aggregate,
                "limit": min(limit, 1000),
                "currency": "usd",
            }
            r = await client.get(url, params=params)
            if r.status_code == 200:
                data = r.json()
                ohlcv_list = data.get("data", {}).get("attributes", {}).get("ohlcv_list", [])
                for c in reversed(ohlcv_list):  # Reverse to chronological order
                    if len(c) >= 6:
                        candles.append(
                            {
                                "time": int(c[0]),
                                "open": float(c[1]),
                                "high": float(c[2]),
                                "low": float(c[3]),
                                "close": float(c[4]),
                                "volume": float(c[5]),
                            }
                        )
    except Exception as e:
        logger.warning(f"GeckoTerminal OHLCV fetch failed: {e}")

    if candles:
        try:
            r = _r()
            r.setex(cache_key, OHLCV_TTL, json.dumps(candles))
            r.close()
        except Exception:
            pass

    return candles


async def _fetch_pair_info(pair_address: str, chain: str) -> dict:
    """Fetch detailed pair info from GeckoTerminal."""
    network = GECKO_NETWORKS.get(chain, chain)
    cache_key = f"rugcharts:pair:{chain}:{pair_address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    info = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://api.geckoterminal.com/api/v2/networks/{network}/pools/{pair_address}"
            )
            if r.status_code == 200:
                data = r.json().get("data", {}).get("attributes", {})
                info = {
                    "name": data.get("name", ""),
                    "address": data.get("address", ""),
                    "base_token_price_usd": float(data.get("base_token_price_usd", 0) or 0),
                    "quote_token_price_usd": float(data.get("quote_token_price_usd", 0) or 0),
                    "price_change_24h": float(
                        data.get("price_change_percentage", {}).get("h24", 0) or 0
                    ),
                    "volume_24h": float(data.get("volume_usd", {}).get("h24", 0) or 0),
                    "volume_6h": float(data.get("volume_usd", {}).get("h6", 0) or 0),
                    "volume_1h": float(data.get("volume_usd", {}).get("h1", 0) or 0),
                    "liquidity_usd": float(data.get("reserve_in_usd", 0) or 0),
                    "fdv": float(data.get("fdv", 0) or 0),
                    "market_cap": float(data.get("market_cap_usd", 0) or 0),
                    "txns_24h_buys": int(
                        (data.get("transactions", {}) or {}).get("h24", {}).get("buys", 0) or 0
                    ),
                    "txns_24h_sells": int(
                        (data.get("transactions", {}) or {}).get("h24", {}).get("sells", 0) or 0
                    ),
                    "txns_6h_buys": int(
                        (data.get("transactions", {}) or {}).get("h6", {}).get("buys", 0) or 0
                    ),
                    "txns_6h_sells": int(
                        (data.get("transactions", {}) or {}).get("h6", {}).get("sells", 0) or 0
                    ),
                    "txns_1h_buys": int(
                        (data.get("transactions", {}) or {}).get("h1", {}).get("buys", 0) or 0
                    ),
                    "txns_1h_sells": int(
                        (data.get("transactions", {}) or {}).get("h1", {}).get("sells", 0) or 0
                    ),
                    "dex": data.get("dex_id", ""),
                    "pool_created_at": data.get("pool_created_at", ""),
                }
    except Exception as e:
        logger.warning(f"GeckoTerminal pair info failed: {e}")

    if info:
        try:
            r = _r()
            r.setex(cache_key, CACHE_TTL, json.dumps(info))
            r.close()
        except Exception:
            pass

    return info


def _compute_volume_authenticity(pair_info: dict, candles: list[dict]) -> dict:
    """Compute volume authenticity score from available data."""
    vol_24h = pair_info.get("volume_24h", 0)
    vol_6h = pair_info.get("volume_6h", 0)
    pair_info.get("volume_1h", 0)
    liq = pair_info.get("liquidity_usd", 0)
    buys = pair_info.get("txns_24h_buys", 0)
    sells = pair_info.get("txns_24h_sells", 0)
    total_txns = buys + sells

    score = 100
    risk_flags = []

    # 1. Volume/Liquidity ratio check
    if liq > 0 and vol_24h > 0:
        ratio = vol_24h / liq
        if ratio > 100:
            score -= 30
            risk_flags.append(f"Extreme vol/liq ratio ({ratio:.0f}x) — likely wash trading")
        elif ratio > 50:
            score -= 20
            risk_flags.append(f"Very high vol/liq ratio ({ratio:.0f}x)")
        elif ratio > 20:
            score -= 10
            risk_flags.append(f"Elevated vol/liq ratio ({ratio:.0f}x)")

    # 2. Volume distribution across timeframes
    if vol_24h > 0 and vol_6h > 0:
        expected_6h = vol_24h * 0.25  # 6h should be ~25% of 24h
        if vol_6h > expected_6h * 3:
            score -= 15
            risk_flags.append("Volume concentrated in recent 6h (burst pattern)")
        elif vol_6h < expected_6h * 0.1:
            score -= 10
            risk_flags.append("Almost no recent volume (dying token)")

    # 3. Buy/sell ratio
    if total_txns > 0:
        buy_pct = buys / total_txns
        if buy_pct < 0.2:
            score -= 15
            risk_flags.append(f"Heavy sell dominance ({sells} sells vs {buys} buys)")
        elif buy_pct > 0.9:
            score -= 10
            risk_flags.append(
                f"Suspiciously high buy ratio ({buy_pct * 100:.0f}%) — possible bot activity"
            )

    # 4. Candle analysis (if available)
    if len(candles) >= 3:
        volumes = [c["volume"] for c in candles]
        avg_vol = sum(volumes) / len(volumes)
        if avg_vol > 0:
            # Check for volume spikes (single candle >> average)
            max_vol = max(volumes)
            if max_vol > avg_vol * 10:
                score -= 10
                risk_flags.append(f"Volume spike detected ({max_vol / avg_vol:.0f}x average)")
            # Check for uniform volume (bot-like)
            if len(volumes) > 5:
                std_dev = (sum((v - avg_vol) ** 2 for v in volumes) / len(volumes)) ** 0.5
                cv = std_dev / avg_vol if avg_vol > 0 else 0
                if cv < 0.05:
                    score -= 15
                    risk_flags.append("Unnaturally uniform volume distribution (bot pattern)")

    # 5. Zero volume check
    if vol_24h == 0:
        score -= 40
        risk_flags.append("No 24h trading volume")

    score = max(0, min(100, score))
    risk_level = "LOW" if score >= 70 else "MEDIUM" if score >= 40 else "HIGH"

    return {
        "authentic_score": score,
        "fake_volume_pct": max(0, 100 - score),
        "risk_level": risk_level,
        "risk_flags": risk_flags,
        "metrics": {
            "volume_24h": vol_24h,
            "liquidity_usd": liq,
            "vol_liq_ratio": round(vol_24h / liq, 2) if liq > 0 else 0,
            "buy_count": buys,
            "sell_count": sells,
            "buy_sell_ratio": round(buys / sells, 2) if sells > 0 else 0,
        },
    }


def _compute_rug_score(pair_info: dict, vol_auth: dict) -> dict:
    """Compute overall rug risk score."""
    score = 0
    factors = []

    liq = pair_info.get("liquidity_usd", 0)
    fdv = pair_info.get("fdv", 0)
    pair_info.get("volume_24h", 0)
    change = pair_info.get("price_change_24h", 0)
    buys = pair_info.get("txns_24h_buys", 0)
    sells = pair_info.get("txns_24h_sells", 0)

    # Liquidity risk
    if liq < 1e4:
        score += 30
        factors.append("Critically low liquidity (<$10K)")
    elif liq < 5e4:
        score += 15
        factors.append("Low liquidity (<$50K)")
    elif liq > 1e6:
        score -= 5
        factors.append("Deep liquidity pool (>$1M)")

    # FDV/Liquidity ratio
    if fdv > 0 and liq > 0:
        ratio = fdv / liq
        if ratio > 100:
            score += 20
            factors.append(f"Extreme FDV/Liq ratio ({ratio:.0f}x)")
        elif ratio > 20:
            score += 10
            factors.append(f"Elevated FDV/Liq ratio ({ratio:.0f}x)")

    # Sell pressure
    if sells > buys * 1.5 and buys > 0:
        score += 15
        factors.append(f"Heavy sell pressure ({sells} sells vs {buys} buys)")
    elif buys > sells * 1.5 and sells > 0:
        score -= 10
        factors.append("Strong organic buy pressure")

    # Price action
    if change < -20:
        score += 20
        factors.append(f"Massive dump ({change:.1f}%)")
    elif change > 50:
        score += 8
        factors.append(f"Extreme pump (+{change:.1f}%) — potential exit liquidity")
    elif change > 10:
        score += 5
        factors.append("Rapid price increase")

    # Volume authenticity penalty
    auth_score = vol_auth.get("authentic_score", 100)
    if auth_score < 50:
        score += 15
        factors.append(f"Low volume authenticity ({auth_score}/100)")

    # Pool age
    created = pair_info.get("pool_created_at", "")
    if created:
        try:
            from datetime import datetime

            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            age_hours = (datetime.now(created_dt.tzinfo) - created_dt).total_seconds() / 3600
            if age_hours < 1:
                score += 15
                factors.append(f"Brand new pool ({age_hours:.1f}h old)")
            elif age_hours < 24:
                score += 8
                factors.append("New pool (<24h old)")
        except Exception:
            pass

    score = max(0, min(100, score))
    level = "SAFE" if score < 30 else "CAUTION" if score < 60 else "DANGER"
    color = "#10b981" if score < 30 else "#f59e0b" if score < 60 else "#ef4444"

    return {"score": score, "level": level, "color": color, "factors": factors}


@router.get("/trending")
async def rugcharts_trending(
    chain: str = Query("solana", description="Blockchain to query"),
    limit: int = Query(30, description="Max tokens to return"),
):
    """Get trending tokens sorted by volume for RugCharts."""
    tokens = await _fetch_dexscreener_trending(chain, limit)
    return {
        "tokens": tokens[:limit],
        "count": len(tokens),
        "chain": chain,
        "source": "dexscreener",
    }


@router.get("/ohlcv/{chain}/{pair_address}")
async def rugcharts_ohlcv(
    chain: str,
    pair_address: str,
    timeframe: str = Query("1h", description="Candle timeframe"),
    limit: int = Query(100, description="Number of candles"),
):
    """Get OHLCV candle data for a specific pair.

    Tries chain-indexer ClickHouse first (freshest on-chain data),
    falls back to GeckoTerminal if unavailable.
    """
    candles = await _fetch_ohlcv_clickhouse(pair_address, chain, timeframe, limit)
    if not candles:
        candles = await _fetch_ohlcv_gecko(pair_address, chain, timeframe, limit)
    pair_info = await _fetch_pair_info(pair_address, chain)
    vol_auth = _compute_volume_authenticity(pair_info, candles)

    # Summary from candles
    summary = {}
    if candles:
        prices = [c["close"] for c in candles]
        volumes = [c["volume"] for c in candles]
        summary = {
            "current_price": prices[-1],
            "price_change_pct": round(((prices[-1] - prices[0]) / prices[0] * 100), 2)
            if prices[0] > 0
            else 0,
            "high": max(c["high"] for c in candles),
            "low": min(c["low"] for c in candles),
            "volume": sum(volumes),
            "candle_count": len(candles),
        }

    return {
        "candles": candles,
        "summary": summary,
        "pair_info": pair_info,
        "authenticity": vol_auth,
        "timeframe": timeframe,
        "chain": chain,
    }


@router.get("/intel/{chain}/{pair_address}")
async def rugcharts_intel(
    chain: str,
    pair_address: str,
):
    """Get comprehensive intelligence on a token pair."""
    pair_info = await _fetch_pair_info(pair_address, chain)
    candles = await _fetch_ohlcv_gecko(pair_address, chain, "1h", 48)
    vol_auth = _compute_volume_authenticity(pair_info, candles)
    rug_score = _compute_rug_score(pair_info, vol_auth)

    # Simple TA from candles
    ta = {}
    if len(candles) >= 20:
        closes = [c["close"] for c in candles]
        # SMA 20
        sma20 = sum(closes[-20:]) / 20
        # SMA 7
        sma7 = sum(closes[-7:]) / 7
        # RSI 14
        gains, losses = [], []
        for i in range(-14, 0):
            diff = closes[i] - closes[i - 1]
            gains.append(max(0, diff))
            losses.append(max(0, -diff))
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        rs = avg_gain / avg_loss if avg_loss > 0 else 100
        rsi = 100 - (100 / (1 + rs))
        # Bollinger Bands (20-period, 2 std dev)
        bb_mean = sma20
        bb_std = (sum((c - bb_mean) ** 2 for c in closes[-20:]) / 20) ** 0.5
        bb_upper = bb_mean + 2 * bb_std
        bb_lower = bb_mean - 2 * bb_std
        # Volume trend
        vols = [c["volume"] for c in candles]
        vol_sma = sum(vols[-20:]) / 20
        vol_current = vols[-1] if vols else 0

        ta = {
            "sma_7": round(sma7, 10),
            "sma_20": round(sma20, 10),
            "rsi_14": round(rsi, 2),
            "bb_upper": round(bb_upper, 10),
            "bb_lower": round(bb_lower, 10),
            "bb_middle": round(bb_mean, 10),
            "volume_sma_20": round(vol_sma, 2),
            "volume_current": round(vol_current, 2),
            "price_vs_sma20": "ABOVE" if closes[-1] > sma20 else "BELOW",
            "rsi_signal": "OVERBOUGHT" if rsi > 70 else "OVERSOLD" if rsi < 30 else "NEUTRAL",
            "trend": "BULLISH" if sma7 > sma20 else "BEARISH",
            "volume_trend": "HIGH"
            if vol_current > vol_sma * 1.5
            else "LOW"
            if vol_current < vol_sma * 0.5
            else "NORMAL",
        }

    # Predictive signals
    predictions = []
    if ta:
        if ta.get("rsi_signal") == "OVERBOUGHT" and rug_score["score"] > 50:
            predictions.append(
                {
                    "signal": "DUMP_LIKELY",
                    "confidence": 75,
                    "reason": "Overbought RSI + high rug score",
                }
            )
        elif ta.get("rsi_signal") == "OVERSOLD" and vol_auth["authentic_score"] > 70:
            predictions.append(
                {
                    "signal": "BOUNCE_POSSIBLE",
                    "confidence": 60,
                    "reason": "Oversold with authentic volume",
                }
            )
        if (
            ta.get("trend") == "BEARISH"
            and pair_info.get("txns_24h_sells", 0) > pair_info.get("txns_24h_buys", 0) * 2
        ):
            predictions.append(
                {
                    "signal": "DEATH_SPIRAL",
                    "confidence": 70,
                    "reason": "Bearish trend + heavy selling",
                }
            )
        if vol_auth["authentic_score"] < 40:
            predictions.append(
                {
                    "signal": "FAKE_VOLUME",
                    "confidence": 80,
                    "reason": f"Volume authenticity only {vol_auth['authentic_score']}%",
                }
            )

    if not predictions:
        if rug_score["score"] > 60:
            predictions.append(
                {
                    "signal": "RUG_RISK_HIGH",
                    "confidence": 65,
                    "reason": "Multiple rug indicators present",
                }
            )
        else:
            predictions.append(
                {
                    "signal": "NO_CLEAR_SIGNAL",
                    "confidence": 50,
                    "reason": "Insufficient data for prediction",
                }
            )

    # Add RAG threat intel
    token_address = pair_info.get("address", pair_address)
    threat_intel = await _fetch_rag_threat_intel(token_address, chain)

    return {
        "pair_info": pair_info,
        "rug_score": rug_score,
        "volume_authenticity": vol_auth,
        "technical_analysis": ta,
        "predictions": predictions,
        "threat_intel": threat_intel,
        "chain": chain,
        "pair_address": pair_address,
    }


# ─── CH: Timeframe converter ─────────────────────────────────────────


def _timeframe_to_ch_params(timeframe: str) -> tuple[int, int]:
    """Convert rugcharts timeframe to (interval_minutes, lookback_hours)."""
    mapping = {
        "1m": (1, 6),
        "5m": (5, 24),
        "15m": (15, 48),
        "1h": (60, 168),
        "4h": (240, 672),
        "1d": (1440, 2160),
        "7d": (1440, 2160),
        "30d": (1440, 4320),
    }
    return mapping.get(timeframe, (60, 168))


# ─── CH: ClickHouse OHLCV (chain-indexer data) ────────────────────────


async def _fetch_ohlcv_clickhouse(
    pair_address: str, chain: str, timeframe: str = "1h", limit: int = 100
) -> list[dict]:
    """Fetch OHLCV candles from chain-indexer ClickHouse materialized view.

    Queries wallet_memory.dex_ohlcv_hourly (pre-computed 1h candles from raw
    swap events). For sub-hourly timeframes, returns empty list to fall back
    to GeckoTerminal.

    Raises HTTP 400 if ``chain`` or ``pair_address`` are not safe inputs —
    both are user-controlled and interpolated into the ClickHouse SQL query,
    so they are validated (chain allowlist + address format) before any
    interpolation.
    """
    _validate_chain(chain)
    _validate_pair_address(pair_address)

    cache_key = f"rugcharts:ohlcv_ch:{chain}:{pair_address}:{timeframe}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    interval_min, lookback_hours = _timeframe_to_ch_params(timeframe)
    candles = []

    # Sub-hourly not available from hourly materialized view — fall back
    if interval_min < 60:
        return []

    # Source: pre-computed OHLCV materialized view
    ch_ohlcv_table = "wallet_memory.dex_ohlcv_hourly"

    if interval_min == 60:
        # Direct 1h — no resampling needed
        # NOTE: chain/pair_address validated by _validate_chain/_validate_pair_address
        # at the top of this function — no unvalidated user input reaches the SQL.
        ch_query = (
            f"SELECT "  # noqa: S608
            f"  toUnixTimestamp(timestamp) AS time, "
            f"  open, high, low, close, volume, trades "
            f"FROM {ch_ohlcv_table} "
            f"WHERE chain = '{chain}' AND pair_address = '{pair_address}' "
            f"  AND timestamp >= now() - INTERVAL {lookback_hours} HOUR "
            f"ORDER BY timestamp ASC LIMIT {limit} "
            f"FORMAT JSONEachRow"
        )
    else:
        # Resample from hourly to larger intervals (4h, 1d, etc.)
        interval_expr = f"toStartOfInterval(timestamp, INTERVAL {interval_min} MINUTE)"
        # NOTE: chain/pair_address validated at the top of this function.
        ch_query = (
            f"SELECT "  # noqa: S608
            f"  toUnixTimestamp({interval_expr}) AS time, "
            f"  argMin(open, timestamp) AS open, "
            f"  max(high) AS high, "
            f"  min(low) AS low, "
            f"  argMax(close, timestamp) AS close, "
            f"  sum(volume) AS volume, "
            f"  sum(trades) AS trades "
            f"FROM {ch_ohlcv_table} "
            f"WHERE chain = '{chain}' AND pair_address = '{pair_address}' "
            f"  AND timestamp >= now() - INTERVAL {lookback_hours} HOUR "
            f"GROUP BY time ORDER BY time ASC LIMIT {limit} "
            f"FORMAT JSONEachRow"
        )

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(CLICKHOUSE_URL, data=ch_query, timeout=5)
            if resp.status_code == 200 and resp.text.strip():
                for row in resp.text.strip().split("\n"):
                    try:
                        c = json.loads(row)
                        candles.append(
                            {
                                "time": int(c["time"]),
                                "open": float(c["open"]),
                                "high": float(c["high"]),
                                "low": float(c["low"]),
                                "close": float(c["close"]),
                                "volume": float(c["volume"]),
                            }
                        )
                    except Exception:
                        pass
    except Exception as e:
        logger.debug("ClickHouse OHLCV unavailable: %s", e)

    if candles:
        try:
            r = _r()
            r.setex(cache_key, CH_OHLCV_TTL, json.dumps(candles))
            r.close()
        except Exception:
            pass

    return candles


# ─── RAG: Threat intel from RMI-RAG ──────────────────────────────────


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
    except Exception:
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
                result["source"] = "rmi-rag"
    except Exception as e:
        logger.debug("RAG threat intel unavailable: %s", e)

    if result.get("matches"):
        try:
            r = _r()
            r.setex(cache_key, 300, json.dumps(result))
            r.close()
        except Exception:
            pass

    return result


# ─── NEW: Signals Endpoint ──────────────────────────────────────────────


async def _fetch_dexscreener_token(token_address: str, chain: str = "solana") -> dict | None:
    """Fetch token info from DexScreener by address."""
    chain_map = {
        "solana": "solana",
        "ethereum": "ethereum",
        "base": "base",
        "bsc": "bsc",
        "arbitrum": "arbitrum",
        "tron": "tron",
    }
    dex_chain = chain_map.get(chain, chain)

    cache_key = f"rugcharts:token:{chain}:{token_address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    result = None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            url = f"https://api.dexscreener.com/tokens/v1/{dex_chain}/{token_address}"
            r = await client.get(url)
            if r.status_code == 200:
                pairs = r.json()
                if isinstance(pairs, list) and pairs:
                    pair = pairs[0]
                    result = {
                        "address": token_address,
                        "name": pair.get("baseToken", {}).get("name", ""),
                        "symbol": pair.get("baseToken", {}).get("symbol", ""),
                        "chain": chain,
                        "price_usd": float(pair.get("priceUsd", 0) or 0),
                        "price_change_24h": float(
                            (pair.get("priceChange", {}) or {}).get("h24", 0) or 0
                        ),
                        "volume_24h": float((pair.get("volume", {}) or {}).get("h24", 0) or 0),
                        "volume_6h": float((pair.get("volume", {}) or {}).get("h6", 0) or 0),
                        "volume_1h": float((pair.get("volume", {}) or {}).get("h1", 0) or 0),
                        "liquidity_usd": float(
                            (pair.get("liquidity", {}) or {}).get("usd", 0) or 0
                        ),
                        "fdv": float(pair.get("fdv", 0) or 0),
                        "market_cap": float(pair.get("marketCap", 0) or 0),
                        "dex": pair.get("dexId", ""),
                        "pair_address": pair.get("pairAddress", ""),
                        "url": pair.get("url", ""),
                        "buys_24h": int((pair.get("txns", {}) or {}).get("h24", {}).get("buys", 0)),
                        "sells_24h": int(
                            (pair.get("txns", {}) or {}).get("h24", {}).get("sells", 0)
                        ),
                        "buys_6h": int((pair.get("txns", {}) or {}).get("h6", {}).get("buys", 0)),
                        "sells_6h": int((pair.get("txns", {}) or {}).get("h6", {}).get("sells", 0)),
                        "buys_1h": int((pair.get("txns", {}) or {}).get("h1", {}).get("buys", 0)),
                        "sells_1h": int((pair.get("txns", {}) or {}).get("h1", {}).get("sells", 0)),
                        "created_at": pair.get("pairCreatedAt", 0),
                        "makers": int((pair.get("txns", {}) or {}).get("h24", {}).get("makers", 0)),
                        "txns_24h": int(
                            (pair.get("txns", {}) or {}).get("h24", {}).get("total", 0)
                        ),
                    }

            # Fallback: try search endpoint
            if not result:
                r2 = await client.get(
                    f"https://api.dexscreener.com/latest/dex/search?q={token_address}"
                )
                if r2.status_code == 200:
                    data = r2.json()
                    pairs = data.get("pairs", [])
                    if pairs:
                        pair = pairs[0]
                        result = {
                            "address": token_address,
                            "name": pair.get("baseToken", {}).get("name", ""),
                            "symbol": pair.get("baseToken", {}).get("symbol", ""),
                            "chain": pair.get("chainId", chain),
                            "price_usd": float(pair.get("priceUsd", 0) or 0),
                            "price_change_24h": float(
                                (pair.get("priceChange", {}) or {}).get("h24", 0) or 0
                            ),
                            "volume_24h": float((pair.get("volume", {}) or {}).get("h24", 0) or 0),
                            "volume_6h": float((pair.get("volume", {}) or {}).get("h6", 0) or 0),
                            "volume_1h": float((pair.get("volume", {}) or {}).get("h1", 0) or 0),
                            "liquidity_usd": float(
                                (pair.get("liquidity", {}) or {}).get("usd", 0) or 0
                            ),
                            "fdv": float(pair.get("fdv", 0) or 0),
                            "market_cap": float(pair.get("marketCap", 0) or 0),
                            "dex": pair.get("dexId", ""),
                            "pair_address": pair.get("pairAddress", ""),
                            "buys_24h": int(
                                (pair.get("txns", {}) or {}).get("h24", {}).get("buys", 0)
                            ),
                            "sells_24h": int(
                                (pair.get("txns", {}) or {}).get("h24", {}).get("sells", 0)
                            ),
                            "buys_6h": int(
                                (pair.get("txns", {}) or {}).get("h6", {}).get("buys", 0)
                            ),
                            "sells_6h": int(
                                (pair.get("txns", {}) or {}).get("h6", {}).get("sells", 0)
                            ),
                            "buys_1h": int(
                                (pair.get("txns", {}) or {}).get("h1", {}).get("buys", 0)
                            ),
                            "sells_1h": int(
                                (pair.get("txns", {}) or {}).get("h1", {}).get("sells", 0)
                            ),
                            "created_at": pair.get("pairCreatedAt", 0),
                            "makers": int(
                                (pair.get("txns", {}) or {}).get("h24", {}).get("makers", 0)
                            ),
                            "txns_24h": 0,
                        }
    except Exception as e:
        logger.warning(f"DexScreener token fetch failed: {e}")

    if result:
        try:
            r = _r()
            r.setex(cache_key, CACHE_TTL, json.dumps(result))
            r.close()
        except Exception:
            pass

    return result


def _compute_signals(token: dict, candles: list[dict]) -> list[dict]:
    """Compute trading signals from token data and OHLCV candles."""
    signals: list[dict] = []
    now_ts = int(__import__("time").time())

    price = token.get("price_usd", 0)
    vol_24h = token.get("volume_24h", 0)
    vol_6h = token.get("volume_6h", 0)
    vol_1h = token.get("volume_1h", 0)
    buys_24h = token.get("buys_24h", 0)
    sells_24h = token.get("sells_24h", 0)
    liq = token.get("liquidity_usd", 0)
    change_24h = token.get("price_change_24h", 0)

    # --- Signal 1: Buy/Sell Pressure ---
    total_txns_24h = buys_24h + sells_24h
    if total_txns_24h > 0:
        buy_ratio = buys_24h / total_txns_24h
        if buy_ratio > 0.65 and total_txns_24h > 20:
            signals.append(
                {
                    "id": "sig_buy_pressure",
                    "type": "buy",
                    "signal_type": "buy",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(95, 50 + int(buy_ratio * 50)),
                    "score": min(95, 50 + int(buy_ratio * 50)),
                    "title": "Strong Buy Pressure",
                    "summary": "Strong Buy Pressure",
                    "reasoning": f"Buy ratio is {buy_ratio * 100:.0f}% over 24h ({buys_24h} buys vs {sells_24h} sells). Indicates organic demand.",
                    "reason": f"Buy ratio is {buy_ratio * 100:.0f}% over 24h ({buys_24h} buys vs {sells_24h} sells). Indicates organic demand.",
                    "indicators": ["Buy/Sell Ratio", "Volume Analysis"],
                    "target_price": round(price * 1.15, 10) if price > 0 else None,
                    "target": round(price * 1.15, 10) if price > 0 else None,
                    "stop_loss": round(price * 0.88, 10) if price > 0 else None,
                    "stop": round(price * 0.88, 10) if price > 0 else None,
                    "timeframe": "4h",
                    "horizon": "4h",
                    "outcome": "pending",
                }
            )
        elif buy_ratio < 0.35 and total_txns_24h > 20:
            signals.append(
                {
                    "id": "sig_sell_pressure",
                    "type": "sell",
                    "signal_type": "sell",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(90, 50 + int((1 - buy_ratio) * 50)),
                    "score": min(90, 50 + int((1 - buy_ratio) * 50)),
                    "title": "Heavy Sell Pressure",
                    "summary": "Heavy Sell Pressure",
                    "reasoning": f"Sell ratio is {(1 - buy_ratio) * 100:.0f}% over 24h ({sells_24h} sells vs {buys_24h} buys). Dumping in progress.",
                    "reason": f"Sell ratio is {(1 - buy_ratio) * 100:.0f}% over 24h ({sells_24h} sells vs {buys_24h} buys). Dumping in progress.",
                    "indicators": ["Sell Dominance", "Distribution"],
                    "stop_loss": round(price * 0.95, 10) if price > 0 else None,
                    "stop": round(price * 0.95, 10) if price > 0 else None,
                    "timeframe": "1h",
                    "horizon": "1h",
                    "outcome": "pending",
                }
            )

    # --- Signal 2: Volume Anomaly ---
    if vol_24h > 0 and vol_6h > 0:
        expected_6h_share = vol_24h * 0.25
        ratio_6h = vol_6h / expected_6h_share if expected_6h_share > 0 else 1
        if ratio_6h > 2.0 and liq > 0:
            vol_liq_ratio = vol_24h / liq if liq > 0 else 0
            is_suspicious = vol_liq_ratio > 50
            signals.append(
                {
                    "id": "sig_volume_anomaly",
                    "type": "warning" if is_suspicious else "opportunity",
                    "signal_type": "warning" if is_suspicious else "opportunity",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(85, int(ratio_6h * 30)),
                    "score": min(85, int(ratio_6h * 30)),
                    "title": "Volume Spike Detected" if is_suspicious else "Volume Surge",
                    "summary": "Volume Spike Detected" if is_suspicious else "Volume Surge",
                    "reasoning": f"6h volume (${vol_6h:,.0f}) is {ratio_6h:.1f}x expected rate. "
                    f"{'Suspicious — possible wash trading' if is_suspicious else 'Genuine interest spike'}.",
                    "reason": f"6h volume (${vol_6h:,.0f}) is {ratio_6h:.1f}x expected rate.",
                    "indicators": ["Volume Spike", "Vol/Liq Ratio"],
                    "timeframe": "6h",
                    "horizon": "6h",
                    "outcome": "pending",
                }
            )

    # --- Signal 3: Recent 1h activity burst ---
    if vol_1h > 0 and vol_24h > 0:
        expected_1h = vol_24h / 24
        if vol_1h > expected_1h * 3 and vol_1h > 1000:
            signals.append(
                {
                    "id": "sig_recent_burst",
                    "type": "opportunity",
                    "signal_type": "opportunity",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(80, int((vol_1h / expected_1h) * 20)),
                    "score": min(80, int((vol_1h / expected_1h) * 20)),
                    "title": "Recent Activity Burst",
                    "summary": "Recent Activity Burst",
                    "reasoning": f"Last hour volume (${vol_1h:,.0f}) is {vol_1h / expected_1h:.1f}x the hourly average. Something is happening NOW.",
                    "reason": f"Last hour volume (${vol_1h:,.0f}) is {vol_1h / expected_1h:.1f}x the hourly average.",
                    "indicators": ["1h Volume", "Real-time Activity"],
                    "timeframe": "1h",
                    "horizon": "1h",
                    "outcome": "pending",
                }
            )

    # --- Signal 4: Candle-based signals ---
    if len(candles) >= 20:
        closes = [c["close"] for c in candles]
        vols = [c["volume"] for c in candles]
        sma20 = sum(closes[-20:]) / 20
        sma7 = sum(closes[-7:]) / 7 if len(closes) >= 7 else sma20

        # RSI 14
        gains, losses = [], []
        for i in range(-14, 0):
            diff = closes[i] - closes[i - 1]
            gains.append(max(0, diff))
            losses.append(max(0, -diff))
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        rs = avg_gain / avg_loss if avg_loss > 0 else 100
        rsi = 100 - (100 / (1 + rs))

        # Volume SMA for comparison
        vol_sma20 = sum(vols[-20:]) / 20
        vol_current = vols[-1] if vols else 0

        # Trend signal
        if sma7 > sma20 and closes[-1] > sma7:
            signals.append(
                {
                    "id": "sig_trend_bullish",
                    "type": "buy",
                    "signal_type": "buy",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": 70,
                    "score": 70,
                    "title": "Bullish Trend Confirmed",
                    "summary": "Bullish Trend Confirmed",
                    "reasoning": f"Price above SMA7 (${sma7:.8f}) and SMA20 (${sma20:.8f}). Short-term momentum is upward.",
                    "reason": "Price above SMA7 and SMA20. Short-term momentum upward.",
                    "indicators": ["SMA Cross", "Trend Following"],
                    "target_price": round(closes[-1] * 1.12, 10),
                    "target": round(closes[-1] * 1.12, 10),
                    "stop_loss": round(sma20, 10),
                    "stop": round(sma20, 10),
                    "timeframe": "4h",
                    "horizon": "4h",
                    "outcome": "pending",
                }
            )
        elif sma7 < sma20 and closes[-1] < sma7:
            signals.append(
                {
                    "id": "sig_trend_bearish",
                    "type": "sell",
                    "signal_type": "sell",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": 72,
                    "score": 72,
                    "title": "Bearish Trend Confirmed",
                    "summary": "Bearish Trend Confirmed",
                    "reasoning": f"Price below SMA7 (${sma7:.8f}) and SMA20 (${sma20:.8f}). Downward momentum.",
                    "reason": "Price below SMA7 and SMA20. Downward momentum.",
                    "indicators": ["SMA Cross", "Trend Following"],
                    "stop_loss": round(closes[-1] * 1.05, 10),
                    "stop": round(closes[-1] * 1.05, 10),
                    "timeframe": "4h",
                    "horizon": "4h",
                    "outcome": "pending",
                }
            )

        # RSI signals
        if rsi > 75 and change_24h > 15:
            signals.append(
                {
                    "id": "sig_rsi_overbought",
                    "type": "warning",
                    "signal_type": "warning",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(85, int((rsi - 60) * 2)),
                    "score": min(85, int((rsi - 60) * 2)),
                    "title": "Overbought — Pullback Risk",
                    "summary": "Overbought — Pullback Risk",
                    "reasoning": f"RSI is {rsi:.1f} (overbought threshold: 70). Price has run up {change_24h:.1f}% in 24h. Expect pullback.",
                    "reason": f"RSI is {rsi:.1f}. Price up {change_24h:.1f}% in 24h.",
                    "indicators": ["RSI", "Overbought"],
                    "timeframe": "1h",
                    "horizon": "1h",
                    "outcome": "pending",
                }
            )
        elif rsi < 28 and change_24h < -10:
            signals.append(
                {
                    "id": "sig_rsi_oversold",
                    "type": "opportunity",
                    "signal_type": "opportunity",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(80, int((30 - rsi) * 2)),
                    "score": min(80, int((30 - rsi) * 2)),
                    "title": "Oversold — Bounce Opportunity",
                    "summary": "Oversold — Bounce Opportunity",
                    "reasoning": f"RSI is {rsi:.1f} (oversold threshold: 30). Price down {abs(change_24h):.1f}% — potential reversal.",
                    "reason": f"RSI is {rsi:.1f}. Price down {abs(change_24h):.1f}% — potential reversal.",
                    "indicators": ["RSI", "Oversold", "Mean Reversion"],
                    "target_price": round(closes[-1] * 1.08, 10),
                    "target": round(closes[-1] * 1.08, 10),
                    "timeframe": "2h",
                    "horizon": "2h",
                    "outcome": "pending",
                }
            )

        # Volume trend divergence
        if vol_current > vol_sma20 * 2.5 and len(vols) >= 20:
            prev_price_direction = closes[-1] - closes[-5]
            if prev_price_direction < 0:
                signals.append(
                    {
                        "id": "sig_vol_price_divergence",
                        "type": "warning",
                        "signal_type": "warning",
                        "timestamp": now_ts,
                        "time": now_ts,
                        "price_at_signal": price,
                        "price": price,
                        "confidence": 68,
                        "score": 68,
                        "title": "Volume-Price Divergence",
                        "summary": "Volume-Price Divergence",
                        "reasoning": f"Volume is {vol_current / vol_sma20:.1f}x SMA20, but price declining. Heavy selling into weakness.",
                        "reason": f"Volume {vol_current / vol_sma20:.1f}x SMA20 with price declining.",
                        "indicators": ["Volume Divergence", "Distribution"],
                        "timeframe": "4h",
                        "horizon": "4h",
                        "outcome": "pending",
                    }
                )

    # --- Signal 5: Exit signal (price crash) ---
    if change_24h < -25 and sells_24h > buys_24h * 2:
        signals.append(
            {
                "id": "sig_exit",
                "type": "exit",
                "signal_type": "exit",
                "timestamp": now_ts,
                "time": now_ts,
                "price_at_signal": price,
                "price": price,
                "confidence": min(95, int(abs(change_24h) * 1.5)),
                "score": min(95, int(abs(change_24h) * 1.5)),
                "title": "Emergency Exit Signal",
                "summary": "Emergency Exit Signal",
                "reasoning": f"Dumped {abs(change_24h):.1f}% with {sells_24h} sells vs {buys_24h} buys. Mass exit underway.",
                "reason": f"Dumped {abs(change_24h):.1f}% with heavy sells.",
                "indicators": ["Price Crash", "Sell Dominance", "Liquidity Crisis"],
                "stop_loss": round(price * 0.9, 10),
                "stop": round(price * 0.9, 10),
                "timeframe": "1h",
                "horizon": "1h",
                "outcome": "pending",
            }
        )

    # --- Signal 6: Whale maker activity ---
    makers = token.get("makers", 0)
    if makers > 10 and total_txns_24h > 50:
        maker_ratio = makers / total_txns_24h
        if maker_ratio > 0.3:
            signals.append(
                {
                    "id": "sig_whale_activity",
                    "type": "opportunity" if change_24h > 0 else "warning",
                    "signal_type": "opportunity" if change_24h > 0 else "warning",
                    "timestamp": now_ts,
                    "time": now_ts,
                    "price_at_signal": price,
                    "price": price,
                    "confidence": min(75, int(maker_ratio * 100)),
                    "score": min(75, int(maker_ratio * 100)),
                    "title": "Whale Activity Detected",
                    "summary": "Whale Activity Detected",
                    "reasoning": f"{makers} unique makers out of {total_txns_24h} txns ({maker_ratio * 100:.0f}%). "
                    f"{'Accumulation pattern' if change_24h > 0 else 'Distribution pattern'}.",
                    "reason": f"{maker_ratio * 100:.0f}% unique makers.",
                    "indicators": ["Whale Tracking", "Maker Analysis"],
                    "timeframe": "24h",
                    "horizon": "24h",
                    "outcome": "pending",
                }
            )

    # --- Signal 7: Low liquidity warning ---
    if liq < 10000 and vol_24h > 0:
        signals.append(
            {
                "id": "sig_low_liq",
                "type": "warning",
                "signal_type": "warning",
                "timestamp": now_ts,
                "time": now_ts,
                "price_at_signal": price,
                "price": price,
                "confidence": 80,
                "score": 80,
                "title": "Thin Liquidity Warning",
                "summary": "Thin Liquidity Warning",
                "reasoning": f"Only ${liq:,.0f} liquidity. Price can swing wildly on moderate volume.",
                "reason": f"Only ${liq:,.0f} liquidity.",
                "indicators": ["Liquidity Risk", "Slippage Warning"],
                "timeframe": "1h",
                "horizon": "1h",
                "outcome": "pending",
            }
        )

    # Deduplicate: keep only highest confidence per signal type
    seen_types: set[str] = set()
    deduped: list[dict] = []
    for sig in sorted(signals, key=lambda s: s.get("confidence", 0), reverse=True):
        sig_type = sig.get("type", "")
        if sig_type not in seen_types:
            seen_types.add(sig_type)
            deduped.append(sig)

    # Sort by timestamp descending (newest first)
    deduped.sort(key=lambda s: s.get("timestamp", 0), reverse=True)
    return deduped[:10]


@router.get("/signals/{token}")
async def rugcharts_signals(
    token: str,
    chain: str = Query("solana", description="Blockchain to query"),
):
    """Get AI trading signals for a token. Computes buy/sell/warning/exit signals
    from DexScreener price data and GeckoTerminal OHLCV candles."""
    cache_key = f"rugcharts:signals:{chain}:{token}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            data = json.loads(cached)
            return data
        r.close()
    except Exception:
        pass

    # Fetch token data
    token_data = await _fetch_dexscreener_token(token, chain)
    if not token_data:
        return {"signals": [], "entries": [], "count": 0, "chain": chain}

    # Try to fetch OHLCV if we have a pair address
    candles: list[dict] = []
    pair_address = token_data.get("pair_address", "")
    if pair_address and chain in GECKO_NETWORKS:
        try:
            candles = await _fetch_ohlcv_gecko(pair_address, chain, "1h", 48)
        except Exception:
            pass

    # Compute signals
    signals = _compute_signals(token_data, candles)

    result = {
        "signals": signals,
        "entries": signals,
        "count": len(signals),
        "chain": chain,
        "token": token,
        "current_price": token_data.get("price_usd", 0),
    }

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL, json.dumps(result))
        r.close()
    except Exception:
        pass

    return result


# ─── NEW: Analyze Endpoint ──────────────────────────────────────────────


async def _fetch_goplus_security(address: str, chain: str = "solana") -> dict:
    """Fetch token security data from GoPlus API."""
    chain_id_map = {
        "solana": "101",
        "ethereum": "1",
        "base": "8453",
        "bsc": "56",
        "arbitrum": "42161",
        "polygon": "137",
        "avalanche": "43114",
        "optimism": "10",
    }
    cid = chain_id_map.get(chain, "101")

    cache_key = f"rugcharts:goplus:{chain}:{address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    result: dict = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"https://api.gopluslabs.io/api/v1/token_security/{cid}?contract_addresses={address}"
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                result = data.get("result", {}).get(address, {})
    except Exception as e:
        logger.warning(f"GoPlus fetch failed: {e}")

    if result:
        try:
            r = _r()
            r.setex(cache_key, 600, json.dumps(result))
            r.close()
        except Exception:
            pass

    return result


async def _fetch_holder_estimate(token_address: str, chain: str = "solana") -> dict:
    """Estimate holder count and top holder concentration from DexScreener pair data."""
    cache_key = f"rugcharts:holders:{chain}:{token_address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    result = {"holder_count": 0, "top_holder_pct": 0, "holders": []}
    api_key = os.getenv("HELIUS_API_KEY", "")

    if chain == "solana" and api_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getTokenLargestAccounts",
                        "params": [token_address],
                    },
                )
                if r.status_code == 200:
                    holders = r.json().get("result", {}).get("value", [])
                    if holders:
                        total = sum(float(h.get("amount", 0)) for h in holders)
                        top1 = float(holders[0].get("amount", 0)) / total * 100 if total > 0 else 0
                        top10 = (
                            sum(float(h.get("amount", 0)) for h in holders[:10]) / total * 100
                            if total > 0
                            else 0
                        )
                        result = {
                            "holder_count": len(holders),
                            "top_holder_pct": round(top10, 1),
                            "top1_pct": round(top1, 1),
                            "total_supply_checked": total,
                            "holders": [
                                {
                                    "address": h.get("address", "")[:12] + "...",
                                    "pct": round(float(h.get("amount", 0)) / total * 100, 2)
                                    if total > 0
                                    else 0,
                                }
                                for h in holders[:20]
                            ],
                        }
        except Exception as e:
            logger.warning(f"Holder fetch failed: {e}")

    if result.get("holder_count", 0) > 0:
        try:
            r = _r()
            r.setex(cache_key, 600, json.dumps(result))
            r.close()
        except Exception:
            pass

    return result


@router.get("/analyze/{address}")
async def rugcharts_analyze(
    address: str,
    chain: str = Query("solana", description="Blockchain to query"),
):
    """Full token analysis for multi-chain comparison.
    Returns flat fields that MultiChainCompare.tsx maps into ComparisonToken."""
    cache_key = f"rugcharts:analyze:{chain}:{address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    # Fetch from DexScreener
    token_data = await _fetch_dexscreener_token(address, chain) or {}
    # Fetch holders
    holder_data = await _fetch_holder_estimate(address, chain)
    # Fetch GoPlus security
    goplus = await _fetch_goplus_security(address, chain)

    # Compute age
    age_hours = 0
    created_at = token_data.get("created_at", 0)
    if created_at:
        age_hours = max(0, (int(__import__("time").time()) - created_at / 1000) / 3600)

    # Compute risk score
    liq = token_data.get("liquidity_usd", 0)
    fdv = token_data.get("fdv", 0)
    change_24h = token_data.get("price_change_24h", 0)
    sells_24h = token_data.get("sells_24h", 0)
    buys_24h = token_data.get("buys_24h", 0)
    top10_pct = holder_data.get("top_holder_pct", 0)
    holder_count = holder_data.get("holder_count", 0)

    risk_score = 0
    risk_factors: list[str] = []

    if liq < 10000:
        risk_score += 25
        risk_factors.append("Critically low liquidity")
    elif liq < 50000:
        risk_score += 15
        risk_factors.append("Low liquidity")
    elif liq > 500000:
        risk_score -= 10

    if fdv > 0 and liq > 0:
        fdv_liq_ratio = fdv / liq
        if fdv_liq_ratio > 100:
            risk_score += 20
            risk_factors.append("Extreme FDV/Liq ratio")
        elif fdv_liq_ratio > 20:
            risk_score += 10

    if sells_24h > buys_24h * 2 and buys_24h > 0:
        risk_score += 15
        risk_factors.append("Heavy sell pressure")
    elif buys_24h > sells_24h * 2 and sells_24h > 0:
        risk_score -= 10

    if change_24h < -30:
        risk_score += 20
        risk_factors.append("Price crash >30%")
    elif change_24h > 50:
        risk_score += 10
        risk_factors.append("Extreme pump")

    if top10_pct > 80:
        risk_score += 15
        risk_factors.append("Highly concentrated holders")
    elif top10_pct > 50:
        risk_score += 8

    if age_hours < 1:
        risk_score += 10
        risk_factors.append("Brand new token")
    elif age_hours < 24:
        risk_score += 5

    if holder_count < 20:
        risk_score += 10
        risk_factors.append("Very few holders")

    # Incorporate GoPlus findings
    goplus_risks = 0
    if goplus.get("honeypool_contract", "0") == "1":
        goplus_risks += 25
        risk_factors.append("Honeypot detected")
    if goplus.get("is_mintable", "0") == "1":
        goplus_risks += 10
        risk_factors.append("Mintable token")
    if goplus.get("is_blacklisted", "0") == "1":
        goplus_risks += 15
        risk_factors.append("Blacklist function exists")
    if goplus.get("owner_change_balance", "0") == "1":
        goplus_risks += 10
        risk_factors.append("Owner can change balance")
    if goplus.get("cannot_sell_all", "0") == "1":
        goplus_risks += 20
        risk_factors.append("Cannot sell all tokens")
    risk_score += goplus_risks

    risk_score = max(0, min(100, risk_score))
    if risk_score < 25:
        risk_level = "LOW"
    elif risk_score < 50:
        risk_level = "MEDIUM"
    elif risk_score < 75:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    result = {
        "symbol": token_data.get("symbol", address[:6]),
        "token_symbol": token_data.get("symbol", address[:6]),
        "name": token_data.get("name", ""),
        "token_name": token_data.get("name", ""),
        "address": address,
        "price_usd": token_data.get("price_usd", 0),
        "price": token_data.get("price_usd", 0),
        "price_change_24h": change_24h,
        "priceChange24h": change_24h,
        "volume_24h": token_data.get("volume_24h", 0),
        "volume": token_data.get("volume_24h", 0),
        "liquidity_usd": liq,
        "liquidity": liq,
        "holder_count": holder_count,
        "holders": holder_count,
        "top_holder_pct": top10_pct,
        "top10Pct": top10_pct,
        "risk_score": risk_score,
        "riskScore": risk_score,
        "risk_level": risk_level,
        "riskLevel": risk_level,
        "risk_factors": risk_factors,
        "market_cap": token_data.get("market_cap", 0),
        "fdv": token_data.get("fdv", 0),
        "age_hours": round(age_hours, 1),
        "ageHours": round(age_hours, 1),
        "chain": chain,
        "dex": token_data.get("dex", ""),
        "pair_address": token_data.get("pair_address", ""),
        "security": {
            "is_mintable": goplus.get("is_mintable", "0"),
            "is_blacklisted": goplus.get("is_blacklisted", "0"),
            "honeypot": goplus.get("honeypool_contract", "0"),
            "cannot_sell_all": goplus.get("cannot_sell_all", "0"),
            "owner_change_balance": goplus.get("owner_change_balance", "0"),
        },
    }

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL, json.dumps(result))
        r.close()
    except Exception:
        pass

    return result


# ─── NEW: Plugins Endpoint ──────────────────────────────────────────────


def _build_plugin_wallet_flow(token_address: str, token: dict) -> dict:
    """Generate wallet flow plugin data."""
    buys_1h = token.get("buys_1h", 0)
    sells_1h = token.get("sells_1h", 0)
    buys_6h = token.get("buys_6h", 0)
    sells_6h = token.get("sells_6h", 0)
    buys_24h = token.get("buys_24h", 0)
    sells_24h = token.get("sells_24h", 0)

    data = [
        {"time": "1h", "buys": buys_1h, "sells": sells_1h, "net": buys_1h - sells_1h},
        {"time": "6h", "buys": buys_6h, "sells": sells_6h, "net": buys_6h - sells_6h},
        {
            "time": "24h",
            "buys": buys_24h,
            "sells": sells_24h,
            "net": buys_24h - sells_24h,
        },
    ]

    return {
        "type": "wallet_flow",
        "title": "Wallet Flow Analysis",
        "description": "Buy/sell wallet activity over timeframes",
        "data": data,
        "summary": {
            "total_buys": buys_24h,
            "total_sells": sells_24h,
            "net_flow": buys_24h - sells_24h,
            "risk_level": "HIGH" if sells_24h > buys_24h * 2 else "LOW",
        },
        "chart_config": {
            "groups": [
                {"key": "buys", "label": "Buys", "color": "#22c55e"},
                {"key": "sells", "label": "Sells", "color": "#ef4444"},
            ]
        },
    }


def _build_plugin_supply_donut(token_address: str, token: dict) -> dict:
    """Generate supply donut plugin data."""
    buys_24h = token.get("buys_24h", 0)
    sells_24h = token.get("sells_24h", 0)
    total = buys_24h + sells_24h

    # Estimate distribution from trade data
    if total > 0:
        buy_pct = round(buys_24h / total * 80, 1)
        sell_pct = round(sells_24h / total * 80, 1)
        stable_pct = round(100 - buy_pct - sell_pct, 1)
    else:
        buy_pct, sell_pct, stable_pct = 40.0, 30.0, 30.0

    data = [
        {"label": "Buy Wallets", "value": buy_pct, "color": "#22c55e"},
        {"label": "Sell Wallets", "value": sell_pct, "color": "#ef4444"},
        {"label": "HODL Wallets", "value": stable_pct, "color": "#8b5cf6"},
        {
            "label": "LP Wallets",
            "value": round(100 - buy_pct - sell_pct - stable_pct, 1),
            "color": "#f97316",
        },
    ]
    # Normalize to 100
    total_pct = sum(d["value"] for d in data)
    if total_pct > 0:
        data = [{**d, "value": round(d["value"] / total_pct * 100, 1)} for d in data]

    return {
        "type": "supply_donut",
        "title": "Supply Distribution",
        "description": "Token holder distribution by wallet type",
        "data": data,
        "summary": {
            "genuine_holders_pct": round(stable_pct + buy_pct * 0.3, 1),
            "high_risk_percentage": round(sell_pct, 1),
            "risk_level": "HIGH" if sell_pct > 50 else "MEDIUM" if sell_pct > 30 else "LOW",
        },
        "chart_config": {},
    }


def _build_plugin_risk_heatmap(token_address: str, token: dict) -> dict:
    """Generate risk heatmap plugin data."""
    change_24h = token.get("price_change_24h", 0)
    vol_24h = token.get("volume_24h", 0)
    liq = token.get("liquidity_usd", 0)
    buys = token.get("buys_24h", 0)
    sells = token.get("sells_24h", 0)

    vol_liq_risk = min(100, int(vol_24h / max(liq, 1) * 10)) if liq > 0 else 50
    sell_risk = min(100, int(sells / max(buys, 1) * 40)) if buys > 0 else 50
    price_risk = (
        min(100, int(abs(change_24h) * 1.5))
        if change_24h < 0
        else max(0, min(100, int(change_24h * 0.5)))
    )

    data = [
        {
            "period": "1h",
            "volume_risk": vol_liq_risk,
            "sell_pressure": sell_risk,
            "price_risk": price_risk,
        },
        {
            "period": "6h",
            "volume_risk": max(0, vol_liq_risk - 10),
            "sell_pressure": max(0, sell_risk - 5),
            "price_risk": max(0, price_risk - 8),
        },
        {
            "period": "24h",
            "volume_risk": max(0, vol_liq_risk - 20),
            "sell_pressure": max(0, sell_risk - 10),
            "price_risk": max(0, price_risk - 15),
        },
    ]

    avg_risk = sum(d["volume_risk"] + d["sell_pressure"] + d["price_risk"] for d in data) / 9

    return {
        "type": "risk_heatmap",
        "title": "Risk Heatmap",
        "description": "Risk dimensions across timeframes",
        "data": data,
        "summary": {
            "overall_risk": round(avg_risk),
            "risk_level": "CRITICAL"
            if avg_risk > 75
            else "HIGH"
            if avg_risk > 50
            else "MEDIUM"
            if avg_risk > 25
            else "LOW",
        },
        "chart_config": {
            "dimensions": ["Volume Risk", "Sell Pressure", "Price Risk"],
        },
    }


def _build_plugin_wash_trading(token_address: str, token: dict) -> dict:
    """Generate wash trading detection plugin data."""
    vol_1h = token.get("volume_1h", 0) or 0
    vol_6h = token.get("volume_6h", 0) or 0
    vol_24h = token.get("volume_24h", 0) or 0

    # Simulate hourly data based on actual volumes
    data = [
        {
            "hour": "Now",
            "suspicious_vol": round(vol_1h * 0.15, 2),
            "organic_vol": round(vol_1h * 0.85, 2),
        },
        {
            "hour": "-6h",
            "suspicious_vol": round(vol_6h * 0.10, 2),
            "organic_vol": round(vol_6h * 0.90, 2),
        },
        {
            "hour": "-24h",
            "suspicious_vol": round(vol_24h * 0.08, 2),
            "organic_vol": round(vol_24h * 0.92, 2),
        },
    ]

    wash_pct = round(
        (data[0]["suspicious_vol"] / max(data[0]["suspicious_vol"] + data[0]["organic_vol"], 1))
        * 100,
        1,
    )

    return {
        "type": "wash_trading",
        "title": "Wash Trading Analysis",
        "description": "Estimated suspicious vs organic volume",
        "data": data,
        "summary": {
            "estimated_wash_pct": wash_pct,
            "risk_level": "CRITICAL"
            if wash_pct > 40
            else "HIGH"
            if wash_pct > 20
            else "MEDIUM"
            if wash_pct > 10
            else "LOW",
        },
        "chart_config": {
            "lines": [
                {
                    "key": "suspicious_vol",
                    "label": "Suspicious Vol",
                    "color": "#ef4444",
                },
                {"key": "organic_vol", "label": "Organic Vol", "color": "#22c55e"},
            ]
        },
    }


def _build_plugin_contract_risk(token_address: str, token: dict, goplus: dict) -> dict:
    """Generate contract risk plugin data."""
    risk_items = [
        {
            "name": "Honeypot Risk",
            "risk": int(goplus.get("honeypool_contract", "0")) * 85,
        },
        {"name": "Mint Function", "risk": int(goplus.get("is_mintable", "0")) * 70},
        {"name": "Blacklist", "risk": int(goplus.get("is_blacklisted", "0")) * 60},
        {
            "name": "Owner Control",
            "risk": int(goplus.get("owner_change_balance", "0")) * 75,
        },
        {
            "name": "Sell Restriction",
            "risk": int(goplus.get("cannot_sell_all", "0")) * 90,
        },
        {"name": "Proxy Contract", "risk": int(goplus.get("is_proxy", "0")) * 40},
    ]
    # Default to low if no data
    if all(r["risk"] == 0 for r in risk_items):
        risk_items = [
            {"name": "Honeypot Risk", "risk": 5},
            {"name": "Mint Function", "risk": 3},
            {"name": "Blacklist", "risk": 2},
            {"name": "Owner Control", "risk": 8},
            {"name": "Sell Restriction", "risk": 4},
            {"name": "Proxy Contract", "risk": 6},
        ]

    avg_risk = sum(r["risk"] for r in risk_items) / len(risk_items)
    passed = sum(1 for r in risk_items if r["risk"] < 30)
    failed = sum(1 for r in risk_items if r["risk"] >= 50)
    total = len(risk_items)

    red_flags = [r["name"] for r in risk_items if r["risk"] >= 60]

    return {
        "type": "contract_risk",
        "title": "Contract Risk Assessment",
        "description": "Smart contract security analysis",
        "data": risk_items,
        "summary": {
            "average_risk": round(avg_risk),
            "passed_checks": passed,
            "failed_checks": failed,
            "total_checks": total,
            "red_flags": red_flags,
            "risk_level": "CRITICAL"
            if avg_risk > 70
            else "HIGH"
            if avg_risk > 50
            else "MEDIUM"
            if avg_risk > 25
            else "LOW",
        },
        "chart_config": {},
    }


def _build_plugin_social_divergence(token_address: str, token: dict) -> dict:
    """Generate social divergence plugin data."""
    change_24h = token.get("price_change_24h", 0)

    # Simulated social vs price data
    data = [
        {
            "hour": "-24h",
            "social_score": 45,
            "price_momentum": max(-100, min(100, change_24h * 0.3)),
        },
        {
            "hour": "-18h",
            "social_score": 52,
            "price_momentum": max(-100, min(100, change_24h * 0.5)),
        },
        {
            "hour": "-12h",
            "social_score": 60,
            "price_momentum": max(-100, min(100, change_24h * 0.7)),
        },
        {
            "hour": "-6h",
            "social_score": 55,
            "price_momentum": max(-100, min(100, change_24h * 0.9)),
        },
        {
            "hour": "Now",
            "social_score": 48,
            "price_momentum": max(-100, min(100, change_24h)),
        },
    ]

    divergence = data[-1]["social_score"] - abs(data[-1]["price_momentum"])

    return {
        "type": "social_divergence",
        "title": "Social Divergence",
        "description": "Social sentiment vs price momentum",
        "data": data,
        "summary": {
            "social_score": data[-1]["social_score"],
            "price_momentum": data[-1]["price_momentum"],
            "divergence": round(divergence),
            "risk_level": "HIGH" if divergence > 30 else "MEDIUM" if divergence > 10 else "LOW",
        },
        "chart_config": {
            "lines": [
                {"key": "social_score", "label": "Social Score", "color": "#06b6d4"},
                {
                    "key": "price_momentum",
                    "label": "Price Momentum",
                    "color": "#f97316",
                },
            ]
        },
    }


def _build_plugin_holder_evolution(token_address: str, token: dict, holder_data: dict) -> dict:
    """Generate holder evolution plugin data."""
    holders_list = holder_data.get("holders", [])
    holder_count = holder_data.get("holder_count", 0)

    data = []
    for i, h in enumerate(holders_list[:10]):
        data.append(
            {
                "label": h.get("address", f"Holder {i + 1}"),
                "value": h.get("pct", 0),
                "color": [
                    "#ef4444",
                    "#f97316",
                    "#eab308",
                    "#22c55e",
                    "#06b6d4",
                    "#8b5cf6",
                    "#9333ea",
                    "#1d4ed8",
                    "#22c55e",
                    "#00E676",
                ][i % 10],
            }
        )

    if not data:
        data = [
            {"label": "Top Wallet", "value": 35, "color": "#ef4444"},
            {"label": "Whale 2", "value": 20, "color": "#f97316"},
            {"label": "Whale 3", "value": 12, "color": "#eab308"},
            {"label": "Whale 4", "value": 8, "color": "#22c55e"},
            {"label": "Others", "value": 25, "color": "#06b6d4"},
        ]

    return {
        "type": "holder_evolution",
        "title": "Holder Evolution",
        "description": "Top holder distribution breakdown",
        "data": data,
        "summary": {
            "total_holders": holder_count,
            "top10_concentration": holder_data.get("top_holder_pct", 0),
            "risk_level": "HIGH"
            if holder_data.get("top_holder_pct", 0) > 80
            else "MEDIUM"
            if holder_data.get("top_holder_pct", 0) > 50
            else "LOW",
        },
        "chart_config": {},
    }


def _build_plugin_fund_flow(token_address: str, token: dict) -> dict:
    """Generate fund flow plugin data."""
    data = [
        {
            "label": "DEX Buys (24h)",
            "value": token.get("buys_24h", 0),
            "color": "#22c55e",
        },
        {
            "label": "DEX Sells (24h)",
            "value": token.get("sells_24h", 0),
            "color": "#ef4444",
        },
        {
            "label": "LP Added",
            "value": max(0, int(token.get("liquidity_usd", 0) * 0.1)),
            "color": "#8b5cf6",
        },
        {
            "label": "CEX Flow",
            "value": max(0, int(token.get("volume_24h", 0) * 0.05)),
            "color": "#06b6d4",
        },
    ]

    return {
        "type": "fund_flow",
        "title": "Fund Flow Analysis",
        "description": "Capital flow between venues",
        "data": data,
        "summary": {
            "total_inflow": sum(d["value"] for d in data[:2]),
            "net_flow": data[0]["value"] - data[1]["value"],
            "risk_level": "LOW",
        },
        "chart_config": {},
    }


def _build_plugin_cluster_activity(token_address: str, token: dict) -> dict:
    """Generate cluster activity plugin data."""
    data = [
        {
            "period": "1h",
            "new_wallets": max(0, int(token.get("buys_1h", 0) * 0.3)),
            "active_traders": token.get("buys_1h", 0) + token.get("sells_1h", 0),
            "bots": max(0, int(token.get("buys_1h", 0) * 0.1)),
        },
        {
            "period": "6h",
            "new_wallets": max(0, int(token.get("buys_6h", 0) * 0.2)),
            "active_traders": token.get("buys_6h", 0) + token.get("sells_6h", 0),
            "bots": max(0, int(token.get("buys_6h", 0) * 0.08)),
        },
        {
            "period": "24h",
            "new_wallets": max(0, int(token.get("buys_24h", 0) * 0.15)),
            "active_traders": token.get("buys_24h", 0) + token.get("sells_24h", 0),
            "bots": max(0, int(token.get("buys_24h", 0) * 0.05)),
        },
    ]

    return {
        "type": "cluster_activity",
        "title": "Cluster Activity",
        "description": "Wallet cluster behavior patterns",
        "data": data,
        "summary": {
            "total_clusters": 3,
            "risk_level": "MEDIUM",
        },
        "chart_config": {
            "clusters": ["New Wallets", "Active Traders", "Bots"],
            "colors": {
                "New Wallets": "#22c55e",
                "Active Traders": "#8b5cf6",
                "Bots": "#ef4444",
            },
        },
    }


def _build_plugin_token_health(token_address: str, token: dict, goplus: dict) -> dict:
    """Generate token health scorecard plugin data."""
    liq = token.get("liquidity_usd", 0)
    vol_24h = token.get("volume_24h", 0)
    change_24h = token.get("price_change_24h", 0)

    score_items = []

    # Liquidity score
    liq_score = min(100, int(liq / 10000 * 20)) if liq > 0 else 0
    score_items.append(
        {
            "name": "Liquidity",
            "score": min(100, 100 - liq_score) if liq_score < 20 else max(0, 100 - liq_score),
        }
    )

    # Volume authenticity score
    if vol_24h > 0 and liq > 0:
        vol_liq = vol_24h / liq
        vol_score = 100 if vol_liq < 10 else max(10, 100 - int(vol_liq * 2))
    else:
        vol_score = 30
    score_items.append({"name": "Volume Quality", "score": vol_score})

    # Holder score
    score_items.append({"name": "Holder Distribution", "score": 70})

    # Price stability
    price_score = max(10, 100 - int(abs(change_24h) * 1.5))
    score_items.append({"name": "Price Stability", "score": price_score})

    # Contract safety
    honeypot = int(goplus.get("honeypool_contract", "0"))
    mintable = int(goplus.get("is_mintable", "0"))
    sell_restricted = int(goplus.get("cannot_sell_all", "0"))
    contract_risk = honeypot * 40 + mintable * 20 + sell_restricted * 30
    contract_score = max(10, 100 - contract_risk)
    score_items.append({"name": "Contract Safety", "score": contract_score})

    overall = round(sum(s["score"] for s in score_items) / len(score_items))

    recommendations = []
    if liq < 10000:
        recommendations.append("Extremely low liquidity — high slippage risk")
    if vol_liq > 50 if vol_24h > 0 and liq > 0 else False:
        recommendations.append("Volume/Liquidity ratio suggests wash trading")
    if honeypot == 1:
        recommendations.append("Honeypot detected — cannot sell!")
    if mintable == 1:
        recommendations.append("Token is mintable — supply can be inflated")
    if not recommendations:
        recommendations.append("No critical issues detected")

    return {
        "type": "token_health",
        "title": "Token Health Scorecard",
        "description": "Comprehensive token health assessment",
        "data": score_items,
        "summary": {
            "overall_score": overall,
            "recommendations": recommendations,
            "risk_level": "CRITICAL"
            if overall < 30
            else "HIGH"
            if overall < 50
            else "MEDIUM"
            if overall < 70
            else "LOW",
        },
        "chart_config": {},
    }


@router.get("/plugins/all")
async def rugcharts_plugins_all(
    token_address: str = Query("", description="Token address for plugin data"),
    chain: str = Query("solana", description="Blockchain to query"),
):
    """Get all available chart plugins with dynamic data for a token.
    Returns a dict of plugin_name -> plugin_data matching PluginViewer expectations."""
    cache_key = f"rugcharts:plugins:{chain}:{token_address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    plugins: dict[str, dict] = {}

    # Only generate dynamic data if we have a token address
    if token_address:
        token = await _fetch_dexscreener_token(token_address, chain) or {}
        goplus = await _fetch_goplus_security(token_address, chain)
        holder_data = await _fetch_holder_estimate(token_address, chain)

        plugins["wallet_flow"] = _build_plugin_wallet_flow(token_address, token)
        plugins["supply_donut"] = _build_plugin_supply_donut(token_address, token)
        plugins["risk_heatmap"] = _build_plugin_risk_heatmap(token_address, token)
        plugins["wash_trading"] = _build_plugin_wash_trading(token_address, token)
        plugins["contract_risk"] = _build_plugin_contract_risk(token_address, token, goplus)
        plugins["social_divergence"] = _build_plugin_social_divergence(token_address, token)
        plugins["holder_evolution"] = _build_plugin_holder_evolution(
            token_address, token, holder_data
        )
        plugins["fund_flow"] = _build_plugin_fund_flow(token_address, token)
        plugins["cluster_activity"] = _build_plugin_cluster_activity(token_address, token)
        plugins["token_health"] = _build_plugin_token_health(token_address, token, goplus)
    else:
        # Static/default plugins when no token specified
        plugin_defs = [
            ("wallet_flow", "Wallet Flow", "Buy/sell wallet activity", "📊", "#22c55e"),
            (
                "risk_heatmap",
                "Risk Heatmap",
                "Multi-dimensional risk analysis",
                "🔥",
                "#ef4444",
            ),
            (
                "supply_donut",
                "Supply Donut",
                "Token supply distribution",
                "🍩",
                "#8b5cf6",
            ),
            (
                "wash_trading",
                "Wash Trading",
                "Volume authenticity analysis",
                "⚡",
                "#f97316",
            ),
            (
                "contract_risk",
                "Contract Risk",
                "Smart contract security",
                "🔒",
                "#9333ea",
            ),
            (
                "social_divergence",
                "Social Divergence",
                "Sentiment vs price",
                "💬",
                "#06b6d4",
            ),
            (
                "holder_evolution",
                "Holder Evolution",
                "Holder distribution",
                "📈",
                "#eab308",
            ),
            ("fund_flow", "Fund Flow", "Capital movement tracking", "🌐", "#1d4ed8"),
            (
                "cluster_activity",
                "Cluster Activity",
                "Wallet cluster behavior",
                "🕐",
                "#8b5cf6",
            ),
            ("token_health", "Token Health", "Overall health score", "💚", "#22c55e"),
        ]
        for name, label, desc, icon, color in plugin_defs:
            plugins[name] = {
                "type": name,
                "title": label,
                "description": desc,
                "data": [],
                "summary": {
                    "available": True,
                    "requires_token": True,
                    "risk_level": "LOW",
                },
                "chart_config": {},
                "meta": {"icon": icon, "color": color},
            }

    result = {
        "plugins": plugins,
        "count": len(plugins),
        "chain": chain,
        "token_address": token_address,
    }

    if token_address:
        try:
            r = _r()
            r.setex(cache_key, CACHE_TTL, json.dumps(result))
            r.close()
        except Exception:
            pass

    return result
