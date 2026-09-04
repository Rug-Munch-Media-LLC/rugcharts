"""
Tests for GET /api/v1/rugcharts/trending
Verifies trending tokens endpoint returns sorted token data.
"""

from __future__ import annotations

import re

import pytest
from httpx import AsyncClient

FAKE_BOOSTED_TOKENS = [
    {
        "chainId": "solana",
        "tokenAddress": "abc111",
        "name": "Token A",
        "symbol": "TKA",
        "description": "Token A",
        "icon": "",
        "url": "",
    },
    {
        "chainId": "solana",
        "tokenAddress": "abc222",
        "name": "Token B",
        "symbol": "TKB",
        "description": "Token B",
        "icon": "",
        "url": "",
    },
]

FAKE_PROFILES = [
    {"chainId": "solana", "tokenAddress": "abc333", "name": "Token C", "symbol": "TKC"},
]

FAKE_PAIR_ABC111 = [
    {
        "chainId": "solana",
        "dexId": "raydium",
        "pairAddress": "pair111",
        "baseToken": {"name": "Token A", "symbol": "TKA", "address": "abc111"},
        "quoteToken": {"name": "USDC", "symbol": "USDC"},
        "priceUsd": "1.23",
        "priceChange": {"h24": 5.0, "h6": 2.0, "h1": 0.5},
        "volume": {"h24": 100000, "h6": 50000, "h1": 10000},
        "liquidity": {"usd": 50000},
        "fdv": 1000000,
        "marketCap": 500000,
        "pairCreatedAt": 1700000000000,
        "txns": {"h24": {"buys": 100, "sells": 50, "total": 150, "makers": 40}},
    }
]

FAKE_PAIR_ABC222 = [
    {
        "chainId": "solana",
        "dexId": "raydium",
        "pairAddress": "pair222",
        "baseToken": {"name": "Token B", "symbol": "TKB", "address": "abc222"},
        "quoteToken": {"name": "USDC"},
        "priceUsd": "0.55",
        "priceChange": {"h24": -3.0},
        "volume": {"h24": 50000},
        "liquidity": {"usd": 20000},
        "fdv": 500000,
        "txns": {"h24": {"buys": 30, "sells": 20}},
    }
]

FAKE_PAIR_ABC333 = [
    {
        "chainId": "solana",
        "dexId": "raydium",
        "pairAddress": "pair333",
        "baseToken": {"name": "Token C", "symbol": "TKC", "address": "abc333"},
        "quoteToken": {"name": "USDC"},
        "priceUsd": "2.00",
        "priceChange": {"h24": 10.0},
        "volume": {"h24": 25000},
        "liquidity": {"usd": 30000},
        "fdv": 2000000,
        "txns": {"h24": {"buys": 60, "sells": 10}},
    }
]


@pytest.mark.asyncio
async def test_trending_returns_expected_shape(client: AsyncClient, httpx_mock):
    """Trending endpoint should return token list with metadata."""
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-boosts/top/v1",
        json=FAKE_BOOSTED_TOKENS,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-profiles/latest/v1",
        json=FAKE_PROFILES,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc111",
        json=FAKE_PAIR_ABC111,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc222",
        json=FAKE_PAIR_ABC222,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc333",
        json=FAKE_PAIR_ABC333,
        status_code=200,
    )

    resp = await client.get("/api/v1/rugcharts/trending?chain=solana&limit=10")
    assert resp.status_code == 200
    data = resp.json()

    assert "tokens" in data
    assert "count" in data
    assert "chain" in data
    assert data["chain"] == "solana"
    assert data["count"] == len(data["tokens"])
    assert data["count"] > 0

    for token in data["tokens"]:
        assert "address" in token
        assert "symbol" in token
        assert "name" in token
        assert "chain" in token
        assert "source" in token


@pytest.mark.asyncio
async def test_trending_empty_data(client: AsyncClient, httpx_mock):
    """Trending endpoint should handle empty API response gracefully."""
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-boosts/top/v1",
        json=[],
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-profiles/latest/v1",
        json=[],
        status_code=200,
    )

    resp = await client.get("/api/v1/rugcharts/trending?chain=solana")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tokens"] == []
    assert data["count"] == 0


@pytest.mark.asyncio
async def test_trending_chain_filtering(client: AsyncClient, httpx_mock):
    """Trending should filter by chain correctly."""
    boosted = [
        {
            "chainId": "ethereum",
            "tokenAddress": "0xaaa",
            "name": "Eth Token",
            "symbol": "ETH1",
        },
        {
            "chainId": "solana",
            "tokenAddress": "abc444",
            "name": "Sol Token",
            "symbol": "SOL1",
        },
    ]
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-boosts/top/v1",
        json=boosted,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-profiles/latest/v1",
        json=[],
        status_code=200,
    )
    # Enrichment calls might or might not happen depending on chain filtering
    httpx_mock.add_response(
        url=re.compile(r"https://api\.dexscreener\.com/tokens/v1/.*"),
        json=[],
        status_code=200,
        is_optional=True,
    )

    resp = await client.get("/api/v1/rugcharts/trending?chain=solana")
    assert resp.status_code == 200
    data = resp.json()
    for token in data["tokens"]:
        assert token["chain"] == "solana"


@pytest.mark.asyncio
async def test_trending_sorted_by_volume(client: AsyncClient, httpx_mock):
    """Trending tokens should be sorted by volume descending."""
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-boosts/top/v1",
        json=FAKE_BOOSTED_TOKENS,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-profiles/latest/v1",
        json=[],
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc111",
        json=FAKE_PAIR_ABC111,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc222",
        json=FAKE_PAIR_ABC222,
        status_code=200,
    )

    resp = await client.get("/api/v1/rugcharts/trending?chain=solana")
    assert resp.status_code == 200
    data = resp.json()
    volumes = [t.get("volume_24h", 0) for t in data["tokens"]]
    assert volumes == sorted(volumes, reverse=True), (
        "Tokens should be sorted by volume descending"
    )


@pytest.mark.asyncio
async def test_trending_redis_cache(client: AsyncClient, httpx_mock, _mock_redis):
    """Trending should cache results in Redis."""
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-boosts/top/v1",
        json=FAKE_BOOSTED_TOKENS,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/token-profiles/latest/v1",
        json=[],
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc111",
        json=FAKE_PAIR_ABC111,
        status_code=200,
    )
    httpx_mock.add_response(
        url="https://api.dexscreener.com/tokens/v1/solana/abc222",
        json=FAKE_PAIR_ABC222,
        status_code=200,
    )

    resp1 = await client.get("/api/v1/rugcharts/trending?chain=solana")
    assert resp1.status_code == 200

    cache_keys = [k for k in _mock_redis.keys("rugcharts:trending:*")]
    assert len(cache_keys) >= 1
