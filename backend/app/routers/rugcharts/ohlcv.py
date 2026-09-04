"""RugCharts OHLCV sub-router."""

import json

import httpx
from fastapi import APIRouter, Query

from ._common import (
    CACHE_TTL,
    CH_OHLCV_TTL,
    CLICKHOUSE_URL,
    GECKO_NETWORKS,
    GECKO_TIMEFRAMES,
    OHLCV_TTL,
    _r,
    _validate_chain,
    _validate_pair_address,
    logger,
)

router = APIRouter(prefix="/rugcharts", tags=["rugcharts"])


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
            resp = await client.post(CLICKHOUSE_URL, content=ch_query, timeout=5)
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
