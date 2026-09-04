"""RugCharts trending sub-router."""

import json

import httpx
from fastapi import APIRouter, Query

from ._common import (
    CACHE_TTL,
    DEXSCREENER_CHAINS,
    _r,
    logger,
)

router = APIRouter(prefix="/rugcharts", tags=["rugcharts"])


async def _fetch_dexscreener_trending(chain: str, limit: int = 20) -> list[dict]:
    """Fetch trending tokens from DexScreener with real price data."""
    cache_key = f"rugcharts:trending:{chain}:{limit}"
    try:
        r = _r()
        cached = r.get(cache_key)
        if cached:
            r.close()
            return json.loads(cached)
        r.close()
    except Exception:
        pass

    dex_chain = DEXSCREENER_CHAINS.get(chain, chain)

    tokens = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get boosted tokens (trending)
            r = await client.get("https://api.dexscreener.com/token-boosts/top/v1")
            if r.status_code == 200:
                data = r.json()
                items = data if isinstance(data, list) else data.get("tokens", [])
                for item in items:
                    # Filter by chain if specified
                    item_chain = item.get("chainId", "")
                    if chain and item_chain != dex_chain:
                        continue
                    tokens.append(
                        {
                            "address": item.get("tokenAddress", ""),
                            "name": item.get("name", item.get("description", "")),
                            "symbol": item.get("symbol", ""),
                            "chain": item_chain,
                            "icon": item.get("icon", ""),
                            "url": item.get("url", ""),
                            "source": "boosted",
                        }
                    )
                    if len(tokens) >= limit:
                        break

            # Also get new pairs for the chain (high volume new launches)
            r2 = await client.get("https://api.dexscreener.com/token-profiles/latest/v1")
            if r2.status_code == 200:
                data2 = r2.json()
                items2 = data2 if isinstance(data2, list) else []
                for item in items2:
                    item_chain = item.get("chainId", "")
                    if chain and item_chain != dex_chain:
                        continue
                    # Check if already in list
                    addr = item.get("tokenAddress", "")
                    if any(t["address"] == addr for t in tokens):
                        continue
                    tokens.append(
                        {
                            "address": addr,
                            "name": item.get("name", ""),
                            "symbol": item.get("symbol", ""),
                            "chain": item_chain,
                            "icon": item.get("icon", ""),
                            "url": item.get("url", ""),
                            "source": "new_launch",
                        }
                    )
                    if len(tokens) >= limit:
                        break

            # Enrich with pair data for volume/price
            if tokens:
                addresses = [t["address"] for t in tokens[:10]]
                for addr in addresses:
                    try:
                        r3 = await client.get(
                            f"https://api.dexscreener.com/tokens/v1/{dex_chain}/{addr}"
                        )
                        if r3.status_code == 200:
                            pairs = r3.json()
                            if isinstance(pairs, list) and pairs:
                                pair = pairs[0]  # Best pair
                                for t in tokens:
                                    if t["address"] == addr:
                                        t["price_usd"] = float(pair.get("priceUsd", 0) or 0)
                                        t["change_24h"] = float(
                                            (pair.get("priceChange", {}) or {}).get("h24", 0) or 0
                                        )
                                        t["volume_24h"] = float(
                                            (pair.get("volume", {}) or {}).get("h24", 0) or 0
                                        )
                                        t["liquidity_usd"] = float(
                                            (pair.get("liquidity", {}) or {}).get("usd", 0) or 0
                                        )
                                        t["fdv"] = float(pair.get("fdv", 0) or 0)
                                        t["dex"] = pair.get("dexId", "")
                                        t["pair_address"] = pair.get("pairAddress", "")
                                        t["buys_24h"] = (
                                            (pair.get("txns", {}) or {})
                                            .get("h24", {})
                                            .get("buys", 0)
                                        )
                                        t["sells_24h"] = (
                                            (pair.get("txns", {}) or {})
                                            .get("h24", {})
                                            .get("sells", 0)
                                        )
                                        t["makers"] = (
                                            (pair.get("txns", {}) or {})
                                            .get("h24", {})
                                            .get("makers", 0)
                                        )
                                        break
                    except Exception:
                        pass

    except Exception as e:
        logger.warning(f"DexScreener trending fetch failed: {e}")

    # Sort by volume
    tokens.sort(key=lambda t: t.get("volume_24h", 0), reverse=True)

    if tokens:
        try:
            r = _r()
            r.setex(cache_key, CACHE_TTL, json.dumps(tokens))
            r.close()
        except Exception:
            pass

    return tokens


@router.get("/trending")
async def rugcharts_trending(
    chain: str = Query("solana", description="Blockchain to query"),
    limit: int = Query(30, description="Max tokens to return"),
):
    """Get trending tokens sorted by volume for RugCharts."""
    tokens = await _fetch_dexscreener_trending(chain, limit)
    return {
        "tokens": tokens[:limit],
        "count": len(tokens),
        "chain": chain,
        "source": "dexscreener",
    }
