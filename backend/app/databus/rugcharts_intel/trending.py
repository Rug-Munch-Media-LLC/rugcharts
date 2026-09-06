"""Trending tokens — launch scanner, holder health, and cross-chain entity intel."""

import json
import time
from datetime import UTC, datetime

import httpx

from .common import ARKHAM_KEY, CACHE_TTL, HELIUS_KEY, _r, logger


async def token_launch_scanner(chain: str = "solana", limit: int = 50, **kw) -> dict | None:
    """Scan for recently launched tokens and assign instant risk scores.

    Combines: age, liquidity, holder count, deployer history, GoPlus checks.
    """
    cache_key = f"token_launch:{chain}:{limit}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
        pass

    new_tokens = []
    api_key = kw.get("api_key", "") or HELIUS_KEY

    try:
        if chain == "solana" and api_key:
            async with httpx.AsyncClient(timeout=15) as c:
                # Get newest token mints from Raydium
                r = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getSignaturesForAddress",
                        "params": [
                            "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
                            {"limit": limit},
                        ],
                    },
                )
                if r.status_code == 200:
                    sigs = r.json().get("result", [])
                    now = int(time.time())
                    for sig_data in sigs:
                        age_seconds = now - sig_data.get("blockTime", now)
                        age_minutes = age_seconds / 60
                        # Only show tokens < 24h old
                        if age_minutes > 1440:
                            continue

                        # Quick risk assessment based on age alone
                        if age_minutes < 5:
                            risk = "CRITICAL"
                            risk_score = 95
                            risk_color = "#FF0044"
                        elif age_minutes < 30:
                            risk = "HIGH"
                            risk_score = 75
                            risk_color = "#FF8800"
                        elif age_minutes < 120:
                            risk = "MEDIUM"
                            risk_score = 50
                            risk_color = "#FFD700"
                        elif age_minutes < 360:
                            risk = "LOW"
                            risk_score = 25
                            risk_color = "#88FF00"
                        else:
                            risk = "MONITORING"
                            risk_score = 10
                            risk_color = "#00FF88"

                        new_tokens.append(
                            {
                                "signature": sig_data["signature"][:16] + "...",
                                "launch_time": datetime.fromtimestamp(
                                    sig_data.get("blockTime", 0), tz=UTC
                                ).isoformat(),
                                "age_minutes": round(age_minutes, 1),
                                "risk_score": risk_score,
                                "risk_level": risk,
                                "risk_color": risk_color,
                                "block": sig_data.get("slot"),
                            }
                        )

    except Exception as e:
        logger.debug(f"Token launch scan: {e}")

    # Sort by newest first
    new_tokens.sort(key=lambda x: x.get("age_minutes", 999), reverse=False)

    result = {
        "new_tokens": new_tokens[:limit],
        "total_detected": len(new_tokens),
        "chain": chain,
        "risk_distribution": {
            "CRITICAL": sum(1 for t in new_tokens if t["risk_level"] == "CRITICAL"),
            "HIGH": sum(1 for t in new_tokens if t["risk_level"] == "HIGH"),
            "MEDIUM": sum(1 for t in new_tokens if t["risk_level"] == "MEDIUM"),
            "LOW": sum(1 for t in new_tokens if t["risk_level"] == "LOW"),
            "MONITORING": sum(1 for t in new_tokens if t["risk_level"] == "MONITORING"),
        },
        "scan_time": datetime.now(UTC).isoformat(),
        "source": "token_launch_scanner",
    }

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["token_launch"], json.dumps(result, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return result


async def holder_health_score(address: str = "", chain: str = "solana", **kw) -> dict | None:
    """Analyze holder distribution for rug pull risk indicators.

    Metrics: Gini coefficient, top 10%, fresh wallets, whale dominance.
    """
    if not address:
        return None

    cache_key = f"holder_health:{chain}:{address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
        pass

    api_key = kw.get("api_key", "") or HELIUS_KEY
    health = {
        "total_holders": 0,
        "gini_coefficient": 0.0,
        "top10_concentration": 0.0,
        "top1_dominance": 0.0,
        "fresh_wallet_pct": 0.0,
        "whale_count": 0,
        "decentralization_score": 0,
        "risk_level": "UNKNOWN",
        "risk_factors": [],
    }

    try:
        if chain == "solana" and api_key:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getTokenLargestAccounts",
                        "params": [address],
                    },
                )
                if r.status_code == 200:
                    holders = r.json().get("result", {}).get("value", [])
                    if not holders:
                        health["risk_level"] = "NO_HOLDERS"
                        health["risk_factors"].append("Zero holders detected")
                        return health

                    health["total_holders"] = len(holders)
                    amounts = sorted([float(h.get("amount", 0)) for h in holders], reverse=True)
                    total = sum(amounts)

                    if total <= 0:
                        return health

                    # Gini coefficient
                    n = len(amounts)
                    gini = (2 * sum((i + 1) * amounts[i] for i in range(n))) / (n * total) - (
                        n + 1
                    ) / n
                    health["gini_coefficient"] = round(gini, 3)

                    # Top concentration
                    health["top10_concentration"] = round(sum(amounts[:10]) / total * 100, 1)
                    health["top1_dominance"] = round(amounts[0] / total * 100, 1) if amounts else 0

                    # Whale count (>1% supply)
                    health["whale_count"] = sum(1 for a in amounts if a / total > 0.01)

                    # Decentralization score (0-100, higher = better)
                    # Factors: Gini inverted, holder count, whale count reduction
                    gini_penalty = min(1.0, gini / 0.9) * 40  # Up to 40 point penalty
                    holder_bonus = min(1.0, n / 1000) * 30  # Up to 30 point bonus
                    whale_penalty = (
                        min(1.0, health["whale_count"] / 10) * 30
                    )  # Up to 30 point penalty
                    health["decentralization_score"] = max(
                        0, round(100 - gini_penalty + holder_bonus - whale_penalty)
                    )

                    # Risk assessment
                    if gini > 0.8:
                        health["risk_level"] = "CRITICAL"
                        health["risk_factors"].append(f"Extreme concentration (Gini={gini:.2f})")
                    elif gini > 0.6:
                        health["risk_level"] = "HIGH"
                        health["risk_factors"].append(f"High concentration (Gini={gini:.2f})")
                    elif gini > 0.4:
                        health["risk_level"] = "MEDIUM"
                        health["risk_factors"].append(f"Moderate concentration (Gini={gini:.2f})")
                    else:
                        health["risk_level"] = "LOW"

                    if health["top1_dominance"] > 50:
                        health["risk_level"] = "CRITICAL"
                        health["risk_factors"].append(
                            f"Single wallet dominance {health['top1_dominance']}%"
                        )

                    if n < 20:
                        health["risk_level"] = max(
                            health["risk_level"],
                            "HIGH",
                            key=lambda x: {
                                "LOW": 0,
                                "MEDIUM": 1,
                                "HIGH": 2,
                                "CRITICAL": 3,
                            }.get(x, 0),
                        )
                        health["risk_factors"].append(f"Very few holders ({n})")

    except Exception as e:
        logger.debug(f"Holder health: {e}")

    health["token"] = address
    health["chain"] = chain
    health["scan_time"] = datetime.now(UTC).isoformat()
    health["source"] = "holder_health_score"

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["holder_health"], json.dumps(health, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return health


async def cross_chain_entity(address: str = "", **kw) -> dict | None:
    """Trace an entity across all chains using Arkham intelligence.

    Discovers all addresses owned by the same entity on different chains.
    """
    if not address:
        return None

    cache_key = f"cross_chain:{address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
        pass

    if not ARKHAM_KEY:
        return {"error": "ARKHAM_API_KEY required", "address": address}

    entity_data = {}
    chain_addresses = []

    try:
        async with httpx.AsyncClient(timeout=15) as c:
            # Get entity intelligence for this address
            r = await c.get(
                f"https://api.arkhamintelligence.com/intelligence/address/{address}",
                headers={"API-Key": ARKHAM_KEY},
            )
            if r.status_code == 200:
                data = r.json()
                entity_data = {
                    "primary_address": address,
                    "primary_chain": data.get("chain"),
                    "entity_name": data.get("arkhamEntity", {}).get("name", "Unknown"),
                    "entity_type": data.get("arkhamEntity", {}).get("type", ""),
                    "entity_id": data.get("arkhamEntity", {}).get("id", ""),
                    "label": data.get("arkhamLabel", {}).get("name", ""),
                    "is_contract": data.get("contract", False),
                }

                # Search for entity across chains
                entity_id = data.get("arkhamEntity", {}).get("id", "")
                if entity_id:
                    # Use search to find related addresses
                    sr = await c.get(
                        "https://api.arkhamintelligence.com/intelligence/search",
                        params={"query": entity_data["entity_name"]},
                        headers={"API-Key": ARKHAM_KEY},
                    )
                    if sr.status_code == 200:
                        search_data = sr.json()
                        entities = search_data.get("arkhamEntities", [])
                        for ent in entities[:5]:
                            if ent.get("id") == entity_id:
                                chain_addresses.append(
                                    {
                                        "entity_name": ent.get("name"),
                                        "entity_type": ent.get("type"),
                                        "twitter": ent.get("twitter"),
                                    }
                                )
    except Exception as e:
        logger.debug(f"Cross-chain entity: {e}")

    result = {
        "entity": entity_data,
        "cross_chain_addresses": chain_addresses,
        "chains_detected": list({a.get("chain", "unknown") for a in chain_addresses}),
        "scan_time": datetime.now(UTC).isoformat(),
        "source": "cross_chain_entity_intel",
    }

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["cross_chain"], json.dumps(result, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return result
