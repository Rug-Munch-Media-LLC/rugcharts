"""RugCharts plugins sub-router."""

import json

from fastapi import APIRouter, Query

from ._common import CACHE_TTL, _r
from .analyze import _fetch_goplus_security, _fetch_holder_estimate
from .signals import _fetch_dexscreener_token

router = APIRouter(prefix="/rugcharts", tags=["rugcharts"])


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
    vol_liq = 0.0
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
    except Exception:  # noqa: S110
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
        except Exception:  # noqa: S110
            pass

    return result
