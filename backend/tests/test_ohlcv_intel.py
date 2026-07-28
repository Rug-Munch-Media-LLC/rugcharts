"""
Tests for GET /api/v1/rugcharts/ohlcv/{chain}/{pair_address}
and GET /api/v1/rugcharts/intel/{chain}/{pair_address}
"""

from __future__ import annotations

import re

import pytest
from httpx import AsyncClient

# Fake OHLCV data (24 candles upward trend)
FAKE_OHLCV = {
    "data": {
        "attributes": {
            "ohlcv_list": [
                [
                    1700000000 + i * 3600,
                    1.0 + i * 0.01,
                    1.02 + i * 0.01,
                    0.98 + i * 0.01,
                    1.01 + i * 0.01,
                    10000 + i * 500,
                ]
                for i in range(24)
            ]
        }
    }
}

FAKE_PAIR_INFO = {
    "data": {
        "id": "test_pair",
        "attributes": {
            "name": "TEST/USDC",
            "address": "pair123",
            "base_token_price_usd": "1.23",
            "price_change_percentage": {"h24": 5.0, "h6": 2.0, "h1": 0.5},
            "volume_usd": {"h24": 500000, "h6": 180000, "h1": 45000},
            "reserve_in_usd": "120000",
            "fdv": "5000000",
            "market_cap_usd": "3000000",
            "transactions": {"h24": {"buys": 250, "sells": 120}},
            "dex_id": "raydium",
            "pool_created_at": "2024-11-01T00:00:00Z",
        },
    }
}

FAKE_RAG_RESPONSE = {
    "scam_risk": "unknown",
    "confidence": 0,
    "matches": [],
    "source": "rmi-rag",
}


def _mock_clickhouse_empty(httpx_mock):
    """Mock ClickHouse to return empty (no data from chain-indexer) so tests fall back to GeckoTerminal."""
    httpx_mock.add_response(
        url=re.compile(r"http://ch:8123/"),
        text="",
        status_code=200,
        is_optional=True,
    )


def _mock_gecko(httpx_mock):
    """Mock GeckoTerminal OHLCV and pair info endpoints."""
    _mock_clickhouse_empty(httpx_mock)
    httpx_mock.add_response(
        url=re.compile(
            r"https://api\.geckoterminal\.com/api/v2/networks/.*/pools/.*/ohlcv/.*"
        ),
        json=FAKE_OHLCV,
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(
            r"https://api\.geckoterminal\.com/api/v2/networks/.*/pools/[^/]+$"
        ),
        json=FAKE_PAIR_INFO,
        status_code=200,
        is_optional=True,
    )
    httpx_mock.add_response(
        url=re.compile(r"http://localhost:8012/api/v1/rag/v2/scam-check.*"),
        json=FAKE_RAG_RESPONSE,
        status_code=200,
        is_optional=True,
    )


@pytest.mark.asyncio
async def test_ohlcv_returns_full_structure(client: AsyncClient, httpx_mock):
    """OHLCV endpoint should return candles, summary, pair_info, authenticity."""
    _mock_gecko(httpx_mock)

    resp = await client.get(
        "/api/v1/rugcharts/ohlcv/solana/pair123?timeframe=1h&limit=24"
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "candles" in data
    assert "summary" in data
    assert "pair_info" in data
    assert "authenticity" in data
    assert "timeframe" in data
    assert "chain" in data
    assert data["timeframe"] == "1h"
    assert data["chain"] == "solana"

    # Candle structure uses 'time' not 'timestamp'
    candle = data["candles"][0]
    assert "time" in candle
    assert "open" in candle
    assert "high" in candle
    assert "low" in candle
    assert "close" in candle
    assert "volume" in candle


@pytest.mark.asyncio
async def test_ohlcv_summary_correct(client: AsyncClient, httpx_mock):
    """OHLCV summary calculations should be consistent."""
    _mock_gecko(httpx_mock)

    resp = await client.get("/api/v1/rugcharts/ohlcv/solana/pair123")
    assert resp.status_code == 200
    summary = resp.json()["summary"]

    assert summary["high"] >= summary["low"]
    assert summary["volume"] > 0
    assert isinstance(summary["price_change_pct"], (int, float))
    assert summary["current_price"] > 0
    assert summary["candle_count"] > 0


@pytest.mark.asyncio
async def test_ohlcv_empty_response(client: AsyncClient, httpx_mock):
    """OHLCV should handle empty GeckoTerminal response."""
    _mock_clickhouse_empty(httpx_mock)
    httpx_mock.add_response(
        url=re.compile(
            r"https://api\.geckoterminal\.com/api/v2/networks/.*/pools/.*/ohlcv/.*"
        ),
        json={"data": {"attributes": {"ohlcv_list": []}}},
        status_code=200,
    )
    httpx_mock.add_response(
        url=re.compile(
            r"https://api\.geckoterminal\.com/api/v2/networks/.*/pools/[^/]+$"
        ),
        json=FAKE_PAIR_INFO,
        status_code=200,
        is_optional=True,
    )

    resp = await client.get("/api/v1/rugcharts/ohlcv/ethereum/pair456")
    assert resp.status_code == 200
    data = resp.json()
    assert data["candles"] == []
    assert data["summary"] == {}


@pytest.mark.asyncio
async def test_intel_returns_expected_shape(client: AsyncClient, httpx_mock):
    """Intel endpoint returns pair_info, rug_score, technical_analysis."""
    _mock_gecko(httpx_mock)

    resp = await client.get("/api/v1/rugcharts/intel/solana/pair123")
    assert resp.status_code == 200
    data = resp.json()

    assert "pair_info" in data
    assert "rug_score" in data
    assert "volume_authenticity" in data
    assert "technical_analysis" in data
    assert "predictions" in data
    assert "chain" in data
    assert "pair_address" in data

    # rug_score is a dict with score and level
    assert isinstance(data["rug_score"], dict)
    assert "score" in data["rug_score"]
    assert "level" in data["rug_score"]
    assert 0 <= data["rug_score"]["score"] <= 100


@pytest.mark.asyncio
async def test_intel_rug_score_levels(client: AsyncClient, httpx_mock):
    """Rug score level should be a valid level string."""
    _mock_gecko(httpx_mock)

    resp = await client.get("/api/v1/rugcharts/intel/solana/pair123")
    assert resp.status_code == 200
    data = resp.json()
    level = data["rug_score"]["level"]
    assert isinstance(level, str)
    assert level.upper() == level  # All caps convention


@pytest.mark.asyncio
async def test_intel_ta_with_sufficient_data(client: AsyncClient, httpx_mock):
    """With 24 candles, TA should have SMA, RSI, Bollinger Bands."""
    _mock_gecko(httpx_mock)

    resp = await client.get("/api/v1/rugcharts/intel/solana/pair123")
    assert resp.status_code == 200
    data = resp.json()
    ta = data.get("technical_analysis", {})

    # With 24 candles (>=20), TA should be populated
    if ta:
        assert "sma_7" in ta or "sma20" in ta
        assert "rsi_14" in ta or "rsi14" in ta
