"""
Tests for GET /api/v1/rugcharts/signals/{token}
Verifies signal generation and response shape matching AISignals.tsx.
"""

import re

import pytest
from httpx import AsyncClient

# Fake DexScreener token data for tests
FAKE_TOKEN = [
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

FAKE_OHLCV = {
    "data": {
        "attributes": {
            "ohlcv_list": [
                [t, 0.0012, 0.00125, 0.00118, 0.00122, 45000 + i * 1000]
                for i, t in enumerate(range(1700000000, 1700072000, 3600))
            ]
        }
    }
}

FAKE_PAIR_INFO = {
    "data": {
        "id": "test",
        "attributes": {
            "name": "TEST/USDC",
            "address": "abc123pair",
            "base_token_price_usd": "0.001234",
            "price_change_percentage": {"h24": 15.5},
            "volume_usd": {"h24": 500000, "h6": 180000, "h1": 45000},
            "reserve_in_usd": "120000",
            "fdv": "5000000",
            "market_cap_usd": "3000000",
            "transactions": {"h24": {"buys": 250, "sells": 120}},
            "dex_id": "raydium",
            "pool_created_at": "2024-01-01T00:00:00Z",
        },
    }
}


def _mock_dexscreener(httpx_mock, url=None):
    """Helper to mock DexScreener token endpoint."""
    httpx_mock.add_response(
        url=url or "https://api.dexscreener.com/tokens/v1/solana/abc123",
        json=FAKE_TOKEN,
        status_code=200,
    )


def _mock_gecko(httpx_mock):
    """Helper to mock GeckoTerminal endpoints."""
    # Need to make pair info URL NOT match OHLCV regex
    httpx_mock.add_response(
        url=re.compile(r"https://api\.geckoterminal\.com/api/v2/networks/.*/pools/.*/ohlcv/.*"),
        json=FAKE_OHLCV,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.geckoterminal\.com/api/v2/networks/.*/pools/[^/]+$"),
        json=FAKE_PAIR_INFO,
        status_code=200,
        is_optional=True,
    )


@pytest.mark.asyncio
async def test_signals_returns_expected_shape(client: AsyncClient, httpx_mock):
    """Verify the signals endpoint returns the exact shape AISignals.tsx expects."""
    _mock_dexscreener(httpx_mock)
    _mock_gecko(httpx_mock)

    resp = await client.get("/api/v1/rugcharts/signals/abc123?chain=solana")

    assert resp.status_code == 200
    data = resp.json()

    # Top-level shape: must have signals or entries array
    assert "signals" in data or "entries" in data
    signals = data.get("signals", data.get("entries", []))
    assert isinstance(signals, list)
    assert len(signals) > 0

    # Check every AISignal field the frontend consumes
    for sig in signals:
        # Required fields (with fallback mapping)
        assert "id" in sig
        assert sig.get("type") or sig.get("signal_type"), "Missing type or signal_type"
        assert sig.get("timestamp") or sig.get("time"), "Missing timestamp or time"
        assert sig.get("price_at_signal") or sig.get("price"), "Missing price_at_signal or price"
        assert sig.get("confidence") or sig.get("score"), "Missing confidence or score"
        assert sig.get("title") or sig.get("summary"), "Missing title or summary"

        # Type must be one of the valid types
        sig_type = sig.get("type", sig.get("signal_type", "buy"))
        assert sig_type in ("buy", "sell", "warning", "opportunity", "exit"), (
            f"Invalid type: {sig_type}"
        )

        # Numeric values are valid
        if sig.get("confidence"):
            assert 0 <= sig["confidence"] <= 100
        if sig.get("score"):
            assert 0 <= sig["score"] <= 100

        # indicators is an array
        indicators = sig.get("indicators", [])
        assert isinstance(indicators, list)

        # Optional fields must be correct types if present
        if sig.get("target_price"):
            assert isinstance(sig["target_price"], (int, float))
        if sig.get("stop_loss"):
            assert isinstance(sig["stop_loss"], (int, float))
        if sig.get("timeframe"):
            assert isinstance(sig["timeframe"], str)
        if sig.get("outcome"):
            assert sig["outcome"] in ("hit", "miss", "pending")
        if sig.get("reasoning"):
            assert isinstance(sig["reasoning"], str)

    # Metadata
    assert data.get("count", len(signals)) == len(signals)
    assert data.get("chain") == "solana"
    assert data.get("token") == "abc123"
    assert "current_price" in data


@pytest.mark.asyncio
async def test_signals_empty_for_unknown_token(client: AsyncClient, httpx_mock):
    """Signals for an unknown token should return empty array, not error."""
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

    resp = await client.get("/api/v1/rugcharts/signals/unknown_token?chain=solana")

    assert resp.status_code == 200
    data = resp.json()
    signals = data.get("signals", [])
    assert isinstance(signals, list)
    assert len(signals) == 0
    assert data["count"] == 0


@pytest.mark.asyncio
async def test_signals_include_expected_signal_types(client: AsyncClient, httpx_mock):
    """With buy-heavy data, verify we get buy/opportunity signal types."""
    _mock_dexscreener(httpx_mock)
    _mock_gecko(httpx_mock)

    resp = await client.get("/api/v1/rugcharts/signals/abc123?chain=solana")
    assert resp.status_code == 200

    data = resp.json()
    signals = data.get("signals", data.get("entries", []))
    assert len(signals) > 0

    # Signal types present
    types = {s.get("type", s.get("signal_type")) for s in signals}
    assert "buy" in types or "opportunity" in types


@pytest.mark.asyncio
async def test_signals_redis_caching(client: AsyncClient, httpx_mock, _mock_redis):  # noqa: PT019
    """First call should populate Redis cache; second call should use cache."""
    _mock_dexscreener(httpx_mock)
    _mock_gecko(httpx_mock)

    # First call (will hit APIs)
    resp1 = await client.get("/api/v1/rugcharts/signals/abc123?chain=solana")
    assert resp1.status_code == 200

    # Check cache was written
    cache_keys = list(_mock_redis.keys("rugcharts:signals:*"))
    assert len(cache_keys) >= 1

    # Second call (should use cache)
    resp2 = await client.get("/api/v1/rugcharts/signals/abc123?chain=solana")
    assert resp2.status_code == 200
    assert resp2.json()["count"] == resp1.json()["count"]


@pytest.mark.asyncio
async def test_signals_different_chains(client: AsyncClient, httpx_mock):
    """Signals should work with different chain parameters."""
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/tokens/v1/ethereum/.*"),
        json=[],
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/latest/dex/search\?q=.*"),
        json={"pairs": []},
        status_code=200,
    )

    resp = await client.get("/api/v1/rugcharts/signals/abc123?chain=ethereum")
    assert resp.status_code == 200
    data = resp.json()
    assert data["chain"] == "ethereum"
    assert isinstance(data["signals"], list)
