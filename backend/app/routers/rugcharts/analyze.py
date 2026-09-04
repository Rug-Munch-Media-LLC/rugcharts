"""RugCharts analyze sub-router."""

import json
import os

import httpx
from fastapi import APIRouter, Query

from ._common import (
    CACHE_TTL,
    GOPLUS_CHAIN_IDS,
    _r,
    logger,
)
from .signals import _fetch_dexscreener_token

router = APIRouter(prefix="/rugcharts", tags=["rugcharts"])


async def _fetch_goplus_security(address: str, chain: str = "solana") -> dict:
    """Fetch token security data from GoPlus API."""
    cid = GOPLUS_CHAIN_IDS.get(chain, "101")

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
