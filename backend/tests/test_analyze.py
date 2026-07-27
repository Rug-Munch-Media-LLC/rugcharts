"""
Tests for GET /api/v1/rugcharts/analyze/{address}
Verifies analysis response shape matching MultiChainCompare.tsx expectations.
"""

import os
import re

import pytest
from httpx import AsyncClient


# Shared fake data
FAKE_TOKEN_DEX = [
    {
        "chainId": "solana",
        "dexId": "raydium",
        "pairAddress": "abc123pair",
        "baseToken": {"name": "Test Token", "symbol": "TEST", "address": "abc123"},
        "quoteToken": {"name": "USDC", "symbol": "USDC"},
        "priceUsd": "0.001234",
        "priceChange": {"h24": 15.5, "h6": 5.2, "h1": 1.1},
        "volume": {"h24": 500000, "h6": 180000, "h1": 45000},
        "liquidity": {"usd": 120000},
        "fdv": 5000000,
        "marketCap": 3000000,
        "pairCreatedAt": 1700000000000,
        "txns": {
            "h24": {"buys": 250, "sells": 120, "total": 370, "makers": 85},
            "h6": {"buys": 90, "sells": 50, "total": 140},
            "h1": {"buys": 25, "sells": 12, "total": 37},
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

FAKE_HELIUS = {
    "jsonrpc": "2.0",
    "result": {
        "value": [
            {"address": "w1", "amount": "500000", "decimals": 6, "uiAmount": 500.0},
            {"address": "w2", "amount": "300000", "decimals": 6, "uiAmount": 300.0},
        ]
    },
}


@pytest.mark.asyncio
async def test_analyze_returns_expected_shape(client: AsyncClient, httpx_mock, monkeypatch):
    """Verify the analyze endpoint returns all fields MultiChainCompare.tsx consumes."""
    monkeypatch.setenv("HELIUS_API_KEY", "test_key")

    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc123",
        json=FAKE_TOKEN_DEX,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.gopluslabs\.io/api/v1/token_security/.*"),
        json=FAKE_GOPLUS,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://mainnet\.helius-rpc\.com/.*"),
        json=FAKE_HELIUS,
        status_code=200,
    )

    resp = await client.get("/api/v1/rugcharts/analyze/abc123?chain=solana")
    assert resp.status_code == 200
    data = resp.json()

    # Primary fields the frontend uses
    for field in (
        "symbol",
        "name",
        "price_usd",
        "price_change_24h",
        "volume_24h",
        "liquidity_usd",
        "holder_count",
        "top_holder_pct",
        "risk_score",
        "risk_level",
    ):
        assert field in data, f"Missing field: {field}"

    # Fallback/alias fields match their primary equivalents
    assert data["token_symbol"] == data["symbol"]
    assert data["token_name"] == data["name"]
    assert data["price"] == data["price_usd"]
    assert data["priceChange24h"] == data["price_change_24h"]
    assert data["volume"] == data["volume_24h"]
    assert data["liquidity"] == data["liquidity_usd"]
    assert data["holders"] == data["holder_count"]
    assert data["top10Pct"] == data["top_holder_pct"]
    assert data["riskScore"] == data["risk_score"]
    assert data["riskLevel"] == data["risk_level"]
    assert data["ageHours"] == data["age_hours"]

    # Numeric fields
    assert isinstance(data["price_usd"], (int, float))
    assert isinstance(data["price_change_24h"], (int, float))
    assert isinstance(data["holder_count"], int)
    assert isinstance(data["risk_score"], (int, float))
    assert isinstance(data["age_hours"], (int, float))

    # Valid risk level
    assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN")

    # Security section
    assert "security" in data
    assert "honeypot" in data["security"]
    assert "is_mintable" in data["security"]


@pytest.mark.asyncio
async def test_analyze_handles_unknown_address(client: AsyncClient, httpx_mock):
    """Analyze for an unknown address should return defaults, not 500."""
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/tokens/v1/.*"),
        json=[],
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/latest/dex/search\?q=.*"),
        json={"pairs": []},
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.gopluslabs\.io/api/v1/token_security/.*"),
        json={"code": 1, "message": "OK", "result": {}},
        status_code=200,
        is_optional=True,
    )

    resp = await client.get("/api/v1/rugcharts/analyze/0xDeadBeef?chain=ethereum")
    assert resp.status_code == 200
    data = resp.json()

    assert data["symbol"] == "0xDead"  # truncated address as fallback
    assert data["price_usd"] == 0
    assert data["risk_score"] >= 0
    assert data["chain"] == "ethereum"


@pytest.mark.asyncio
async def test_analyze_risk_score_calculation(client: AsyncClient, httpx_mock, monkeypatch):
    """With mock data of a decent token, risk score should be reasonable."""
    monkeypatch.setenv("HELIUS_API_KEY", "test_key")

    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc123",
        json=FAKE_TOKEN_DEX,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.gopluslabs\.io/api/v1/token_security/.*"),
        json=FAKE_GOPLUS,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://mainnet\.helius-rpc\.com/.*"),
        json=FAKE_HELIUS,
        status_code=200,
    )

    resp = await client.get("/api/v1/rugcharts/analyze/abc123?chain=solana")
    assert resp.status_code == 200
    data = resp.json()

    assert 0 <= data["risk_score"] <= 100
    assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    assert "risk_factors" in data
    assert isinstance(data["risk_factors"], list)


@pytest.mark.asyncio
async def test_analyze_redis_caching(client: AsyncClient, httpx_mock, _mock_redis):
    """Analyze endpoint should cache results in Redis."""
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/tokens/v1/.*"),
        json=[],
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/latest/dex/search\?q=.*"),
        json={"pairs": []},
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.gopluslabs\.io/api/v1/token_security/.*"),
        json={"code": 1, "message": "OK", "result": {}},
        status_code=200,
        is_optional=True,
    )

    resp1 = await client.get("/api/v1/rugcharts/analyze/abc123?chain=solana")
    assert resp1.status_code == 200

    keys = [k for k in _mock_redis.keys("rugcharts:analyze:*")]
    assert len(keys) >= 1
