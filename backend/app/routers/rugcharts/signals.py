"""RugCharts signals sub-router."""

import contextlib
import json

import httpx
from fastapi import APIRouter, Query

from ._common import (
    CACHE_TTL,
    DEXSCREENER_CHAINS,
    GECKO_NETWORKS,
    _r,
    logger,
)
from .ohlcv import _fetch_ohlcv_gecko

router = APIRouter(prefix="/rugcharts", tags=["rugcharts"])


async def _fetch_dexscreener_token(token_address: str, chain: str = "solana") -> dict | None:
    """Fetch token info from DexScreener by address."""
    dex_chain = DEXSCREENER_CHAINS.get(chain, chain)

    cache_key = f"rugcharts:token:{chain}:{token_address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
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
        except Exception:  # noqa: S110
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
    except Exception:  # noqa: S110
        pass

    # Fetch token data
    token_data = await _fetch_dexscreener_token(token, chain)
    if not token_data:
        return {"signals": [], "entries": [], "count": 0, "chain": chain}

    # Try to fetch OHLCV if we have a pair address
    candles: list[dict] = []
    pair_address = token_data.get("pair_address", "")
    if pair_address and chain in GECKO_NETWORKS:
        with contextlib.suppress(Exception):
            candles = await _fetch_ohlcv_gecko(pair_address, chain, "1h", 48)

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
    except Exception:  # noqa: S110
        pass

    return result
