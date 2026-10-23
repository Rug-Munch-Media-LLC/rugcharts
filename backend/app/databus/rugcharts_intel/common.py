"""Shared config, helpers, and data for the RugCharts intelligence layer."""

import logging
import os
from typing import Any

import httpx
import redis

logger = logging.getLogger("rugcharts_intel")

REDIS_HOST = os.getenv("REDIS_HOST", "rmi-redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

HELIUS_KEY = os.getenv("HELIUS_API_KEY", "")
ARKHAM_KEY = os.getenv("ARKHAM_API_KEY", "")
MORALIS_KEY = os.getenv("MORALIS_API_KEY", "")

CACHE_TTL = {
    "whale_alert": 60,
    "token_launch": 120,
    "insider": 600,
    "liquidity": 300,
    "holder_health": 600,
    "cross_chain": 3600,
    "rug_pattern": 7200,
    "dev_reputation": 86400,
    "token_report": 300,
}


def _r():
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=2,
    )


# Known rug pull patterns for similarity matching.
RUG_PATTERNS = [
    {
        "pattern": "liquidity_removal_100pct",
        "name": "Full LP Drain",
        "severity": "CRITICAL",
        "description": "100% of liquidity removed in single transaction. Classic rug pull.",
    },
    {
        "pattern": "honeypot_sell_tax_100",
        "name": "Honeypot — 100% Sell Tax",
        "severity": "CRITICAL",
        "description": "Buy works, sell reverts. Token is locked.",
    },
    {
        "pattern": "mint_infinite",
        "name": "Infinite Mint",
        "severity": "CRITICAL",
        "description": "Unrestricted mint() function drains all value.",
    },
    {
        "pattern": "creator_dump_80pct",
        "name": "Creator Dump >80%",
        "severity": "CRITICAL",
        "description": "Creator wallet sold >80% of supply within hours of launch.",
    },
    {
        "pattern": "slow_rug_72h",
        "name": "Slow Rug (72h)",
        "severity": "HIGH",
        "description": "Gradual LP removal over 3 days to avoid detection.",
    },
    {
        "pattern": "team_wallet_dump",
        "name": "Team Wallet Cascade",
        "severity": "HIGH",
        "description": "Multiple team wallets selling in sequence.",
    },
    {
        "pattern": "fake_volume_boost",
        "name": "Wash Trading Pump",
        "severity": "HIGH",
        "description": "Artificial volume to reach trending, then dump.",
    },
    {
        "pattern": "ownership_renounced_scam",
        "name": "Renounced Trap",
        "severity": "MEDIUM",
        "description": "Ownership renounced but hidden backdoor in contract.",
    },
    {
        "pattern": "proxy_upgrade_rug",
        "name": "Proxy Upgrade Attack",
        "severity": "MEDIUM",
        "description": "Upgradeable proxy changed to malicious implementation.",
    },
    {
        "pattern": "flash_loan_attack",
        "name": "Flash Loan Drain",
        "severity": "HIGH",
        "description": "Flash loan used to manipulate price and drain LP.",
    },
]


async def _local_run_full_scan(address: str, chain: str, **kw) -> dict | None:
    """Local token security scan using Helius + GoPlus API.

    Replaces the hallucinated ``from app.databus.token_security import run_full_scan``
    that does not exist in the rugcharts codebase.
    """
    api_key = kw.get("api_key", "") or HELIUS_KEY
    chain_id_map = {"solana": "1", "ethereum": "1", "bsc": "56", "base": "8453"}
    chain_id = chain_id_map.get(chain, "1")

    checks: dict[str, dict[str, Any]] = {}
    score_deductions = 0

    # -- Check 1: Honeypot / ownership via GoPlus --
    goplus_url = f"https://api.gopluslabs.io/api/v1/token_security/{chain_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(goplus_url, params={"contract_addresses": address})
            if r.status_code == 200:
                result = r.json().get("result", {}).get(address.lower(), {})
                if result:
                    is_honeypot = result.get("is_honeypot") == "1"
                    if is_honeypot:
                        checks["honeypot"] = {
                            "status": "fail",
                            "details": "Honeypot detected — sell may be blocked",
                        }
                        score_deductions += 30

                    if result.get("can_take_back_ownership") == "1":
                        checks["ownership"] = {
                            "status": "fail",
                            "details": "Owner can reclaim tokens (honeypot risk)",
                        }
                        score_deductions += 15

                    buy_tax = float(result.get("buy_tax", "0"))
                    sell_tax = float(result.get("sell_tax", "0"))
                    if buy_tax > 10 or sell_tax > 10:
                        checks["high_tax"] = {
                            "status": "warning",
                            "details": f"Buy tax {buy_tax}%, Sell tax {sell_tax}%",
                        }
                        score_deductions += 10

                    if result.get("is_mintable") == "1":
                        checks["mintable"] = {
                            "status": "fail",
                            "details": "Token is mintable — supply can be inflated",
                        }
                        score_deductions += 15

                    if result.get("is_proxy") == "1":
                        checks["proxy"] = {
                            "status": "warning",
                            "details": "Upgradeable proxy — contract can change",
                        }
                        score_deductions += 10

                    if result.get("is_blacklisted") == "1":
                        checks["blacklist"] = {
                            "status": "fail",
                            "details": "Token has blacklist function",
                        }
                        score_deductions += 20

                    if result.get("is_open_source") == "0":
                        checks["source_code"] = {
                            "status": "warning",
                            "details": "Contract source not verified",
                        }
                        score_deductions += 10
    except Exception as e:
        logger.debug(f"GoPlus security scan failed: {e}")

    # -- Check 2: Helius asset info --
    if chain == "solana" and api_key and not checks:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
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
                    if not asset:
                        checks["not_found"] = {
                            "status": "warning",
                            "details": "Token not found on chain",
                        }
                        score_deductions += 10
                    elif asset.get("authorities"):
                        for auth in asset["authorities"]:
                            if (
                                auth.get("type") in ("mint", "freeze")
                                and auth.get("status") == "on"
                            ):
                                checks["authority_active"] = {
                                    "status": "warning",
                                    "details": f"{auth['type']} authority is still active",
                                }
                                score_deductions += 10
        except Exception as e:
            logger.debug(f"Helius asset scan failed: {e}")

    total_checks = len(checks)
    security_score = max(0, min(100, 100 - score_deductions))

    if security_score >= 80:
        risk_band = "SAFE"
    elif security_score >= 60:
        risk_band = "WARNING"
    else:
        risk_band = "DANGER"

    return {
        "security_score": security_score,
        "risk_band": risk_band,
        "total_checks_run": total_checks,
        "checks": checks,
    }


def _local_quick_authenticity_score(
    volume_24h: float,
    liquidity_usd: float,
    unique_wallets: int,
    _txn_count: int = 0,
) -> dict[str, Any]:
    """Compute a volume authenticity score from available metrics.

    Replaces the hallucinated ``from app.databus.volume_authenticity import quick_authenticity_score``
    that does not exist in the rugcharts codebase.
    """
    score = 100
    fake_pct = 0

    # 1. Volume / liquidity ratio
    if liquidity_usd > 0 and volume_24h > 0:
        ratio = volume_24h / liquidity_usd
        if ratio > 100:
            score -= 30
            fake_pct += 30
        elif ratio > 50:
            score -= 20
            fake_pct += 20
        elif ratio > 20:
            score -= 10
            fake_pct += 10

    # 2. Wallet count vs volume
    if unique_wallets > 0 and volume_24h > 0:
        avg_per_wallet = volume_24h / unique_wallets
        if avg_per_wallet > 10000:
            score -= 15
            fake_pct += 15
        elif avg_per_wallet > 5000:
            score -= 8
            fake_pct += 8

    # 3. Low wallet count with high volume = suspicious
    if volume_24h > 10000 and unique_wallets < 50:
        score -= 20
        fake_pct += 20

    score = max(0, min(100, score))
    fake_pct = max(0, min(100, fake_pct))

    if fake_pct >= 60:
        risk_level = "CRITICAL"
    elif fake_pct >= 30:
        risk_level = "HIGH"
    elif fake_pct >= 10:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "fake_volume_pct": fake_pct,
        "authentic_score": score,
        "risk_level": risk_level,
    }


def _extract_security_highlights(security: dict) -> list[str]:
    """Extract key security findings for the quick overview."""
    highlights = []
    checks = security.get("checks", {})
    for cid, cr in checks.items():
        if cr.get("status") == "fail":
            highlights.append(f"FAIL: {cr.get('details', cid)}")
        elif cr.get("status") == "warning":
            highlights.append(f"WARN: {cr.get('details', cid)}")
    return highlights[:5]
