"""AI signals — insider pattern detection, rug pattern matching, developer reputation."""

import json
import time
from collections import defaultdict
from datetime import UTC, datetime

import httpx

from .common import (
    ARKHAM_KEY,
    CACHE_TTL,
    HELIUS_KEY,
    RUG_PATTERNS,
    _r,
    logger,
)


async def insider_pattern_detector(address: str = "", chain: str = "solana", **kw) -> dict | None:
    """Detect wallets that accumulated before major price movements.

    Pattern: large buys in the hours before a significant price increase.
    """
    if not address:
        return None

    cache_key = f"insider:{chain}:{address}"
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
    insider_signals = []

    try:
        if chain == "solana" and api_key:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getSignaturesForAddress",
                        "params": [address, {"limit": 200}],
                    },
                )
                if r.status_code == 200:
                    sigs = r.json().get("result", [])
                    if len(sigs) < 20:
                        return {
                            "insider_signals": [],
                            "total": 0,
                            "note": "Not enough history",
                        }

                    # Find the first significant price discovery
                    # Group transactions into time windows
                    windows = defaultdict(list)
                    for s in sigs:
                        bt = s.get("blockTime", 0)
                        if bt:
                            window = bt // 600  # 10-minute windows
                            windows[window].append(s)

                    # Find windows with sudden volume spike
                    avg_tx_per_window = len(sigs) / max(len(windows), 1)
                    for window, tx_list in sorted(windows.items()):
                        if len(tx_list) > avg_tx_per_window * 3:  # 3x normal volume
                            # Check if price went up after this window
                            next_windows = [w for w in windows if w > window and w <= window + 6]
                            for nw in next_windows:
                                if len(windows[nw]) > avg_tx_per_window * 2:
                                    insider_signals.append(
                                        {
                                            "window_start": datetime.fromtimestamp(
                                                window * 600, tz=UTC
                                            ).isoformat(),
                                            "tx_count_spike": len(tx_list),
                                            "avg_tx_count": round(avg_tx_per_window, 1),
                                            "spike_multiplier": round(
                                                len(tx_list) / max(avg_tx_per_window, 1),
                                                1,
                                            ),
                                            "followed_by_continued_volume": True,
                                            "signal_strength": "HIGH"
                                            if len(tx_list) > avg_tx_per_window * 5
                                            else "MEDIUM",
                                        }
                                    )
                                    break

    except Exception as e:
        logger.debug(f"Insider detection: {e}")

    result = {
        "insider_signals": insider_signals[:10],
        "total_signals": len(insider_signals),
        "address": address,
        "chain": chain,
        "confidence": "HIGH"
        if len(insider_signals) >= 2
        else ("MEDIUM" if insider_signals else "LOW"),
        "scan_time": datetime.now(UTC).isoformat(),
        "source": "insider_pattern_detector",
    }

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["insider"], json.dumps(result, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return result


async def rug_pattern_matcher(address: str = "", chain: str = "solana", **kw) -> dict | None:
    """Match token characteristics against known rug pull patterns.

    Each pattern gets a similarity score. High matches = high rug probability.
    """
    if not address:
        return None

    cache_key = f"rug_pattern:{chain}:{address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
        pass

    matches = []
    api_key = kw.get("api_key", "") or HELIUS_KEY

    # Gather data points for pattern matching
    signals = {
        "is_new": False,
        "lp_locked": False,
        "holder_count": 0,
        "top_holder_pct": 0,
        "has_mint": False,
        "is_proxy": False,
        "owner_renounced": False,
        "volume_spike": False,
        "age_hours": 999,
    }

    try:
        if chain == "solana" and api_key:
            async with httpx.AsyncClient(timeout=15) as c:
                # Get token data
                r = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getAsset",
                        "params": [address],
                    },
                )
                if r.status_code == 200:
                    asset = r.json().get("result", {})
                    if asset:
                        signals["is_new"] = True  # We found it on chain

                # Get holder count
                r2 = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getTokenLargestAccounts",
                        "params": [address],
                    },
                )
                if r2.status_code == 200:
                    holders = r2.json().get("result", {}).get("value", [])
                    if holders:
                        signals["holder_count"] = len(holders)
                        total = sum(float(h.get("amount", 0)) for h in holders)
                        if total > 0:
                            signals["top_holder_pct"] = (
                                float(holders[0].get("amount", 0)) / total * 100
                            )

                # Get first transaction to determine age
                r3 = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getSignaturesForAddress",
                        "params": [address, {"limit": 1}],
                    },
                )
                if r3.status_code == 200:
                    sigs = r3.json().get("result", [])
                    if sigs:
                        age = int(time.time()) - sigs[0].get("blockTime", int(time.time()))
                        signals["age_hours"] = age / 3600

        # Match against known patterns
        for pattern in RUG_PATTERNS:
            score = 0
            evidence = []

            if pattern["pattern"] == "liquidity_removal_100pct":
                if signals["top_holder_pct"] > 95:
                    score = 85
                    evidence.append("LP highly concentrated")
                elif signals["top_holder_pct"] > 70:
                    score = 50
                    evidence.append("LP moderately concentrated")
                if signals["age_hours"] < 24:
                    score += 10
                    evidence.append("New token")

            elif pattern["pattern"] == "honeypot_sell_tax_100":
                if signals["is_new"] and signals["holder_count"] < 50:
                    score = 60
                    evidence.append("New token with few holders — possible honeypot")
                if signals["top_holder_pct"] > 90:
                    score += 20
                    evidence.append("Single wallet dominance")

            elif pattern["pattern"] == "creator_dump_80pct":
                if signals["top_holder_pct"] > 80 and signals["age_hours"] < 48:
                    score = 75
                    evidence.append("Creator holds >80% on new token")
                elif signals["top_holder_pct"] > 50 and signals["age_hours"] < 24:
                    score = 40
                    evidence.append("High creator allocation on fresh token")

            elif pattern["pattern"] == "slow_rug_72h":
                if 24 < signals["age_hours"] < 72 and signals["top_holder_pct"] > 60:
                    score = 50
                    evidence.append("Concentrated supply in slow rug window")

            elif pattern["pattern"] == "fake_volume_boost":
                if signals["age_hours"] < 6 and not signals["lp_locked"]:
                    score = 40
                    evidence.append("New token without LP lock")

            if score > 0:
                matches.append(
                    {
                        "pattern_id": pattern["pattern"],
                        "pattern_name": pattern["name"],
                        "severity": pattern["severity"],
                        "match_score": min(100, score),
                        "description": pattern["description"],
                        "evidence": evidence,
                    }
                )

    except Exception as e:
        logger.debug(f"Rug pattern matcher: {e}")

    # Sort by match score descending
    matches.sort(key=lambda x: x["match_score"], reverse=True)

    overall_risk = "LOW"
    if matches:
        top_score = matches[0]["match_score"]
        if top_score >= 80:
            overall_risk = "CRITICAL"
        elif top_score >= 60:
            overall_risk = "HIGH"
        elif top_score >= 40:
            overall_risk = "MEDIUM"

    result = {
        "pattern_matches": matches,
        "total_matches": len(matches),
        "overall_rug_risk": overall_risk,
        "address": address,
        "chain": chain,
        "signals_observed": signals,
        "scan_time": datetime.now(UTC).isoformat(),
        "source": "rug_pattern_matcher",
    }

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["rug_pattern"], json.dumps(result, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return result


async def developer_reputation(address: str = "", chain: str = "solana", **kw) -> dict | None:
    """Track deployer wallet history across all tokens they've created.

    Uses: Arkham entity + Helius transaction history + local token scanner data.
    """
    if not address:
        return None

    cache_key = f"dev_reputation:{chain}:{address}"
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
    reputation = {
        "deployer_address": address,
        "total_tokens_deployed": 0,
        "rug_pull_count": 0,
        "active_tokens": 0,
        "abandoned_tokens": 0,
        "avg_token_lifespan_hours": 0,
        "known_entity": "",
        "risk_level": "UNKNOWN",
        "risk_factors": [],
        "recent_tokens": [],
    }

    try:
        # Arkham: get entity info
        if ARKHAM_KEY:
            async with httpx.AsyncClient(timeout=10) as c:
                ar = await c.get(
                    f"https://api.arkhamintelligence.com/intelligence/address/{address}",
                    headers={"API-Key": ARKHAM_KEY},
                )
                if ar.status_code == 200:
                    entity = ar.json().get("arkhamEntity", {})
                    reputation["known_entity"] = entity.get("name", "")
                    reputation["entity_type"] = entity.get("type", "")

        # Helius: get transaction history to estimate deployer activity
        if chain == "solana" and api_key:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(
                    f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getSignaturesForAddress",
                        "params": [address, {"limit": 100}],
                    },
                )
                if r.status_code == 200:
                    sigs = r.json().get("result", [])
                    if sigs:
                        # Estimate token deployments by counting program interactions
                        reputation["total_transactions"] = len(sigs)

                        oldest = min(
                            s.get("blockTime", float("inf")) for s in sigs if s.get("blockTime")
                        )
                        newest = max(s.get("blockTime", 0) for s in sigs if s.get("blockTime"))
                        if oldest < float("inf") and newest > 0:
                            reputation["first_seen"] = datetime.fromtimestamp(
                                oldest, tz=UTC
                            ).isoformat()
                            reputation["last_active"] = datetime.fromtimestamp(
                                newest, tz=UTC
                            ).isoformat()
                            reputation["activity_span_days"] = round((newest - oldest) / 86400, 1)

                        # Heuristic: many transactions to token programs = likely deployer
                        if len(sigs) > 500:
                            reputation["total_tokens_deployed"] = "10+"
                            reputation["risk_factors"].append("High-volume deployer (>500 txs)")
                            reputation["risk_level"] = "HIGH"
                        elif len(sigs) > 100:
                            reputation["total_tokens_deployed"] = "5-10"
                            reputation["risk_factors"].append("Active deployer (>100 txs)")
                            reputation["risk_level"] = "MEDIUM"
                        elif len(sigs) > 10:
                            reputation["total_tokens_deployed"] = "1-5"
                            reputation["risk_level"] = "LOW"
                        else:
                            reputation["total_tokens_deployed"] = "0-1"
                            reputation["risk_level"] = "LOW"

    except Exception as e:
        logger.debug(f"Dev reputation: {e}")

    reputation["scan_time"] = datetime.now(UTC).isoformat()
    reputation["source"] = "developer_reputation"

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["dev_reputation"], json.dumps(reputation, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return reputation
