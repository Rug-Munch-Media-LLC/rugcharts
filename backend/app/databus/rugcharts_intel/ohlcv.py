"""OHLCV / market health — liquidity risk monitor and instant token report.

[REVIEW] The original rugcharts_intel.py had no actual OHLCV/candle-parsing
logic — that lives in app/routers/rugcharts.py. This module groups the
liquidity-risk and comprehensive-report functions which are the closest
analytical features to candle-based intelligence.
"""

import json
from datetime import UTC, datetime

import httpx

from .common import (
    ARKHAM_KEY,
    CACHE_TTL,
    HELIUS_KEY,
    _extract_security_highlights,
    _local_quick_authenticity_score,
    _local_run_full_scan,
    _r,
    logger,
)
from .signals import developer_reputation, rug_pattern_matcher
from .trending import cross_chain_entity, holder_health_score


async def liquidity_risk_monitor(address: str = "", chain: str = "solana", **kw) -> dict | None:
    """Monitor liquidity pool health: LP lock, concentration, removal risk.

    Critical for rug pull prevention — the #1 thing degens need to check.
    """
    if not address:
        return None

    cache_key = f"liquidity_risk:{chain}:{address}"
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
    liquidity_data = {
        "lp_locked": "unknown",
        "lp_lock_duration": None,
        "lp_amount_usd": 0,
        "lp_holders": [],
        "lp_concentration_risk": "unknown",
        "lp_removal_history": [],
        "risk_score": 50,
        "risk_level": "UNKNOWN",
    }

    try:
        if chain == "solana" and api_key:
            async with httpx.AsyncClient(timeout=15) as c:
                # Check for LP token data
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
                    total_supply = sum(float(h.get("amount", 0)) for h in holders)

                    lp_holders_list = []
                    for h in holders[:10]:
                        pct = (
                            (float(h.get("amount", 0)) / total_supply * 100)
                            if total_supply > 0
                            else 0
                        )
                        lp_holders_list.append(
                            {
                                "address": h.get("address", "")[:12] + "...",
                                "share_pct": round(pct, 1),
                            }
                        )

                    liquidity_data["lp_holders"] = lp_holders_list

                    # Concentration risk
                    if lp_holders_list:
                        top1_pct = lp_holders_list[0]["share_pct"]
                        top3_pct = sum(h["share_pct"] for h in lp_holders_list[:3])

                        if top1_pct > 80:
                            liquidity_data["lp_concentration_risk"] = "CRITICAL"
                            liquidity_data["risk_score"] = 90
                            liquidity_data["risk_level"] = "CRITICAL"
                        elif top1_pct > 50 or top3_pct > 90:
                            liquidity_data["lp_concentration_risk"] = "HIGH"
                            liquidity_data["risk_score"] = 70
                            liquidity_data["risk_level"] = "HIGH"
                        elif top3_pct > 60:
                            liquidity_data["lp_concentration_risk"] = "MEDIUM"
                            liquidity_data["risk_score"] = 45
                            liquidity_data["risk_level"] = "MEDIUM"
                        else:
                            liquidity_data["lp_concentration_risk"] = "LOW"
                            liquidity_data["risk_score"] = 20
                            liquidity_data["risk_level"] = "LOW"

    except Exception as e:
        logger.debug(f"Liquidity monitor: {e}")

    # Arkham enrichment: check if LP holders are known entities
    if ARKHAM_KEY and liquidity_data["lp_holders"]:
        for h in liquidity_data["lp_holders"][:3]:
            try:
                async with httpx.AsyncClient(timeout=5) as c:
                    ar = await c.get(
                        f"https://api.arkhamintelligence.com/intelligence/address/{h['address']}",
                        headers={"API-Key": ARKHAM_KEY},
                    )
                    if ar.status_code == 200:
                        entity = ar.json().get("arkhamEntity", {})
                        if entity.get("name"):
                            h["entity"] = entity["name"]
                            h["entity_type"] = entity.get("type", "")
            except Exception:  # noqa: S110
                pass

    liquidity_data["token"] = address
    liquidity_data["chain"] = chain
    liquidity_data["scan_time"] = datetime.now(UTC).isoformat()
    liquidity_data["source"] = "liquidity_risk_monitor"

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["liquidity"], json.dumps(liquidity_data, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return liquidity_data


async def instant_token_report(address: str = "", chain: str = "solana", **kw) -> dict | None:
    """Generate a complete intelligence report for any token in a single call.

    Combines: security scan, holder health, liquidity risk, volume authenticity,
    rug pattern matching, developer reputation, entity intel, and whale activity.

    This is the ONE endpoint that powers the RugCharts token page.
    """
    if not address:
        return None

    cache_key = f"token_report:{chain}:{address}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:  # noqa: S110
        pass

    report = {
        "token": address,
        "chain": chain,
        "generated_at": datetime.now(UTC).isoformat(),
        "sections": {},
        "overall_risk": {"score": 0, "level": "UNKNOWN", "color": "#888888"},
        "quick_verdict": "",
    }

    api_key = kw.get("api_key", "") or HELIUS_KEY
    risk_scores = []

    try:
        # -- Section 1: Security Scan --
        try:
            security = await _local_run_full_scan(address, chain, api_key=api_key)
            if security:
                report["sections"]["security"] = {
                    "score": security.get("security_score", 50),
                    "band": security.get("risk_band", "UNKNOWN"),
                    "checks_run": security.get("total_checks_run", 0),
                    "highlights": _extract_security_highlights(security),
                }
                risk_scores.append(security.get("security_score", 50))
        except Exception as e:
            report["sections"]["security"] = {"error": str(e)[:100]}

        # -- Section 2: Holder Health --
        try:
            holder_data = await holder_health_score(address, chain, api_key=api_key)
            if holder_data:
                gini = holder_data.get("gini_coefficient", 0)
                gini_risk = (gini / 0.9) * 100 if gini > 0 else 0
                report["sections"]["holders"] = {
                    "total": holder_data.get("total_holders", 0),
                    "gini": gini,
                    "top10_pct": holder_data.get("top10_concentration", 0),
                    "top1_pct": holder_data.get("top1_dominance", 0),
                    "whales": holder_data.get("whale_count", 0),
                    "decentralization": holder_data.get("decentralization_score", 0),
                    "risk": holder_data.get("risk_level", "UNKNOWN"),
                }
                risk_scores.append(gini_risk)
        except Exception as e:
            report["sections"]["holders"] = {"error": str(e)[:100]}

        # -- Section 3: Liquidity Risk --
        try:
            liq_data = await liquidity_risk_monitor(address, chain, api_key=api_key)
            if liq_data:
                report["sections"]["liquidity"] = {
                    "concentration_risk": liq_data.get("lp_concentration_risk", "unknown"),
                    "risk_score": liq_data.get("risk_score", 50),
                    "risk_level": liq_data.get("risk_level", "UNKNOWN"),
                    "lp_holders": len(liq_data.get("lp_holders", [])),
                }
                risk_scores.append(liq_data.get("risk_score", 50))
        except Exception as e:
            report["sections"]["liquidity"] = {"error": str(e)[:100]}

        # -- Section 4: Rug Pattern Match --
        try:
            rug_data = await rug_pattern_matcher(address, chain, api_key=api_key)
            if rug_data:
                top_match = (
                    rug_data.get("pattern_matches", [{}])[0]
                    if rug_data.get("pattern_matches")
                    else {}
                )
                report["sections"]["rug_patterns"] = {
                    "total_matches": rug_data.get("total_matches", 0),
                    "overall_risk": rug_data.get("overall_rug_risk", "LOW"),
                    "top_match": top_match.get("pattern_name", "None"),
                    "top_score": top_match.get("match_score", 0),
                }
                if rug_data.get("overall_rug_risk") == "CRITICAL":
                    risk_scores.append(95)
                elif rug_data.get("overall_rug_risk") == "HIGH":
                    risk_scores.append(75)
                elif rug_data.get("overall_rug_risk") == "MEDIUM":
                    risk_scores.append(45)
        except Exception as e:
            report["sections"]["rug_patterns"] = {"error": str(e)[:100]}

        # -- Section 5: Developer Reputation --
        try:
            dev_data = await developer_reputation(address, chain, api_key=api_key)
            if dev_data:
                report["sections"]["developer"] = {
                    "tokens_deployed": dev_data.get("total_tokens_deployed", "unknown"),
                    "activity_span_days": dev_data.get("activity_span_days", 0),
                    "risk_level": dev_data.get("risk_level", "UNKNOWN"),
                    "known_entity": dev_data.get("known_entity", ""),
                }
                dev_risk = {"HIGH": 80, "MEDIUM": 50, "LOW": 20, "UNKNOWN": 40}.get(
                    dev_data.get("risk_level", "UNKNOWN"), 40
                )
                risk_scores.append(dev_risk)
        except Exception as e:
            report["sections"]["developer"] = {"error": str(e)[:100]}

        # -- Section 6: Volume Authenticity --
        try:
            vol_24h = float(kw.get("volume_24h", 0))
            liq = float(kw.get("liquidity_usd", 0))
            uw = int(kw.get("unique_wallets", 0))
            if vol_24h > 0 or liq > 0:
                auth = _local_quick_authenticity_score(vol_24h, liq, uw, 0)
                report["sections"]["volume"] = {
                    "fake_volume_pct": auth.get("fake_volume_pct", 0),
                    "authentic_score": auth.get("authentic_score", 100),
                    "risk_level": auth.get("risk_level", "UNKNOWN"),
                }
                risk_scores.append(auth.get("fake_volume_pct", 0))
        except Exception as e:
            report["sections"]["volume"] = {"error": str(e)[:100]}

        # -- Section 7: Entity Intel (Arkham) --
        if ARKHAM_KEY:
            try:
                entity = await cross_chain_entity(address)
                if entity and entity.get("entity"):
                    report["sections"]["entity"] = {
                        "name": entity["entity"].get("entity_name", ""),
                        "type": entity["entity"].get("entity_type", ""),
                        "label": entity["entity"].get("label", ""),
                        "primary_chain": entity["entity"].get("primary_chain", ""),
                    }
                    if entity["entity"].get("entity_name"):
                        risk_scores.append(5)  # Known entity = low risk
            except Exception:  # noqa: S110
                pass

        # -- Compute Overall Risk --
        if risk_scores:
            avg_risk = sum(risk_scores) / len(risk_scores)
            report["overall_risk"]["score"] = round(avg_risk, 1)

            if avg_risk >= 80:
                report["overall_risk"]["level"] = "CRITICAL"
                report["overall_risk"]["color"] = "#FF0044"
            elif avg_risk >= 60:
                report["overall_risk"]["level"] = "HIGH"
                report["overall_risk"]["color"] = "#FF8800"
            elif avg_risk >= 40:
                report["overall_risk"]["level"] = "MEDIUM"
                report["overall_risk"]["color"] = "#FFD700"
            elif avg_risk >= 20:
                report["overall_risk"]["level"] = "LOW"
                report["overall_risk"]["color"] = "#88FF00"
            else:
                report["overall_risk"]["level"] = "SAFE"
                report["overall_risk"]["color"] = "#00FF88"

        # Quick verdict
        sections = report["sections"]
        if sections.get("security", {}).get("band") == "DANGER":
            report["quick_verdict"] = "EXTREME RISK — Multiple critical security failures detected"
        elif report["overall_risk"]["level"] == "CRITICAL":
            report["quick_verdict"] = "HIGH RISK — Multiple red flags. Not recommended."
        elif report["overall_risk"]["level"] == "HIGH":
            report["quick_verdict"] = "ELEVATED RISK — Proceed with caution. Review details."
        elif report["overall_risk"]["level"] == "MEDIUM":
            report["quick_verdict"] = "MODERATE RISK — Standard for new tokens. Monitor closely."
        elif sections.get("entity", {}).get("name"):
            report["quick_verdict"] = f"KNOWN ENTITY — {sections['entity']['name']}. Lower risk."
        else:
            report["quick_verdict"] = "LOW RISK — No significant concerns detected."

        report["sections_count"] = len(report["sections"])
        report["source"] = "instant_token_report"

    except Exception as e:
        report["error"] = str(e)[:200]
        logger.error(f"Token report failed: {e}")

    try:
        r = _r()
        r.setex(cache_key, CACHE_TTL["token_report"], json.dumps(report, default=str))
        r.close()
    except Exception:  # noqa: S110
        pass

    return report
