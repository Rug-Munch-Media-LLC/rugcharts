"""RugCharts intel sub-router."""

from datetime import datetime

from fastapi import APIRouter

from ._common import _fetch_rag_threat_intel
from .ohlcv import (
    _compute_volume_authenticity,
    _fetch_ohlcv_gecko,
    _fetch_pair_info,
)

router = APIRouter(prefix="/rugcharts", tags=["rugcharts"])


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
