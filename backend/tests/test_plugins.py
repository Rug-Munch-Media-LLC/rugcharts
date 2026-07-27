"""
Tests for GET /api/v1/rugcharts/plugins/all
Verifies plugin data shape matching PluginViewer.tsx expectations.
"""

import re

import pytest
from httpx import AsyncClient

FAKE_DEX = [
    {
        "chainId": "solana",
        "dexId": "raydium",
        "pairAddress": "abc123pair",
        "baseToken": {"name": "Test Token", "symbol": "TEST", "address": "abc123"},
        "quoteToken": {"name": "USDC"},
        "priceUsd": "0.001234",
        "priceChange": {"h24": 15.5, "h6": 5.2, "h1": 1.1},
        "volume": {"h24": 500000, "h6": 180000, "h1": 45000},
        "liquidity": {"usd": 120000},
        "fdv": 5000000,
        "marketCap": 3000000,
        "pairCreatedAt": 1700000000000,
        "txns": {
            "h24": {"buys": 250, "sells": 120, "total": 370, "makers": 85},
            "h6": {"buys": 90, "sells": 50},
            "h1": {"buys": 25, "sells": 12},
        },
    }
]

FAKE_GOPLUS = {
    "code": 1,
    "message": "OK",
    "result": {
        "abc123": {
            "honeypool_contract": "0",
            "is_mintable": "0",
            "is_blacklisted": "0",
            "owner_change_balance": "0",
            "cannot_sell_all": "0",
            "is_proxy": "0",
        }
    },
}


def _mock_external(httpx_mock, helius_json=None):
    """Helper to mock all external APIs for plugins test."""
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc123",
        json=FAKE_DEX,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.gopluslabs\.io/api/v1/token_security/.*"),
        json=FAKE_GOPLUS,
        status_code=200,
    )
    # Helius might not be called (depends on HELIUS_API_KEY env var)
    if helius_json is not None:
        httpx_mock.add_response(
            url=re.compile(r"https://mainnet\.helius-rpc\.com/.*"),
            json=helius_json,
            status_code=200,
            is_optional=True,
        )


@pytest.mark.asyncio
async def test_plugins_all_returns_expected_shape(client: AsyncClient):
    """Verify plugins endpoint returns the expected structure."""
    resp = await client.get("/api/v1/rugcharts/plugins/all")
    assert resp.status_code == 200
    data = resp.json()

    assert "plugins" in data
    assert isinstance(data["plugins"], dict)
    assert "count" in data
    assert data["count"] == len(data["plugins"])

    expected_plugins = [
        "wallet_flow",
        "risk_heatmap",
        "supply_donut",
        "wash_trading",
        "contract_risk",
        "social_divergence",
        "holder_evolution",
        "fund_flow",
        "cluster_activity",
        "token_health",
    ]
    for name in expected_plugins:
        assert name in data["plugins"], f"Missing plugin: {name}"

    for name, plugin in data["plugins"].items():
        assert "type" in plugin
        assert "title" in plugin
        assert "description" in plugin
        assert "data" in plugin
        assert "summary" in plugin
        assert isinstance(plugin["data"], list)
        assert isinstance(plugin["summary"], dict)
        if "chart_config" in plugin:
            assert isinstance(plugin["chart_config"], dict)


@pytest.mark.asyncio
async def test_plugins_with_token_data(client: AsyncClient, httpx_mock, monkeypatch):
    """Plugins with a real token address should include dynamic data."""
    monkeypatch.setenv("HELIUS_API_KEY", "test_key")
    _mock_external(
        httpx_mock,
        helius_json={
            "jsonrpc": "2.0",
            "result": {
                "value": [
                    {"address": "w1", "amount": "500000", "decimals": 6, "uiAmount": 500.0},
                    {"address": "w2", "amount": "300000", "decimals": 6, "uiAmount": 300.0},
                ]
            },
        },
    )

    resp = await client.get("/api/v1/rugcharts/plugins/all?token_address=abc123&chain=solana")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 10
    plugins = data["plugins"]

    # wallet_flow has data
    wf = plugins["wallet_flow"]
    assert len(wf["data"]) > 0
    assert wf["summary"]["total_buys"] >= 0

    # supply_donut has distribution
    sd = plugins["supply_donut"]
    assert len(sd["data"]) > 0
    assert "genuine_holders_pct" in sd["summary"]

    # token_health has scorecard
    th = plugins["token_health"]
    assert len(th["data"]) > 0
    assert "overall_score" in th["summary"]
    assert "recommendations" in th["summary"]
    assert isinstance(th["summary"]["recommendations"], list)

    # contract_risk has GoPlus-derived data
    cr = plugins["contract_risk"]
    assert len(cr["data"]) > 0
    assert "average_risk" in cr["summary"]
    assert "red_flags" in cr["summary"]


@pytest.mark.asyncio
async def test_plugins_all_chart_config_types(client: AsyncClient, httpx_mock):
    """Verify chart_config structures match what PluginRenderer.tsx renders."""
    _mock_external(httpx_mock, helius_json=None)

    resp = await client.get("/api/v1/rugcharts/plugins/all?token_address=abc123&chain=solana")
    assert resp.status_code == 200
    plugins = resp.json()["plugins"]

    # wallet_flow: chart_config.groups
    wf = plugins["wallet_flow"]
    assert "groups" in wf.get("chart_config", {})
    for g in wf["chart_config"]["groups"]:
        assert "key" in g and "label" in g and "color" in g

    # risk_heatmap: chart_config.dimensions
    rh = plugins["risk_heatmap"]
    assert "dimensions" in rh.get("chart_config", {})
    assert len(rh["chart_config"]["dimensions"]) >= 3

    # wash_trading: chart_config.lines
    wt = plugins["wash_trading"]
    assert "lines" in wt.get("chart_config", {})
    for l in wt["chart_config"]["lines"]:
        assert "key" in l and "label" in l and "color" in l

    # supply_donut: data items
    sd = plugins["supply_donut"]
    for item in sd["data"]:
        assert "label" in item and "value" in item and "color" in item


@pytest.mark.asyncio
async def test_plugins_redis_caching(client: AsyncClient, httpx_mock, _mock_redis):
    """Plugins with token data should be cached."""
    _mock_external(httpx_mock, helius_json=None)

    resp1 = await client.get("/api/v1/rugcharts/plugins/all?token_address=abc123&chain=solana")
    assert resp1.status_code == 200

    keys = [k for k in _mock_redis.keys("rugcharts:plugins:*")]
    assert len(keys) >= 1

    # Without token, no cache (static)
    resp2 = await client.get("/api/v1/rugcharts/plugins/all")
    assert resp2.status_code == 200
    assert resp2.json()["count"] == 10


@pytest.mark.asyncio
async def test_plugins_static_without_token(client: AsyncClient):
    """Without token_address, plugins should return metadata not data."""
    resp = await client.get("/api/v1/rugcharts/plugins/all")
    assert resp.status_code == 200
    plugins = resp.json()["plugins"]

    for name, plugin in plugins.items():
        assert "meta" in plugin
        assert "icon" in plugin["meta"]
        assert "color" in plugin["meta"]
        assert plugin["data"] == []
        assert plugin["summary"].get("requires_token") is True
