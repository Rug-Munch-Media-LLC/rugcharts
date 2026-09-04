"""Real-time trade streaming over WebSocket.

Endpoint: /ws/trades/{chain}/{pair_address}

On connect, a per-pair poller task fetches the latest trades from the
DataBus every 2 seconds and broadcasts them as JSON to every connected
subscriber:

    {"token": ..., "chain": ..., "price": ..., "volume": ...,
     "timestamp": ..., "side": ...}

Multiple concurrent connections to the same pair share a single poller.
When the last subscriber for a pair disconnects, the poller stops.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.databus.rugcharts_intel import whale_alert_stream

logger = logging.getLogger("rugcharts.ws")

router = APIRouter(tags=["websocket"])

POLL_INTERVAL_SECONDS = 2.0


async def fetch_latest_trades(chain: str, pair_address: str) -> list[dict]:
    """Fetch the latest trades for a pair from the DataBus.

    Uses the whale_alert_stream DataBus feed (recent large transactions on
    the pair) and maps each movement into the canonical trade shape.
    Returns [] when the feed is unavailable.
    """
    try:
        feed = await whale_alert_stream(address=pair_address, chain=chain)
    except Exception as e:  # pragma: no cover - defensive
        logger.debug(f"trade fetch failed for {chain}/{pair_address}: {e}")
        return []

    if not feed:
        return []

    trades: list[dict] = []
    for movement in feed.get("whale_movements", []):
        trades.append(
            {
                "token": pair_address,
                "chain": chain,
                "price": 0.0,
                "volume": float(movement.get("amount", 0) or 0),
                "timestamp": movement.get("timestamp") or int(time.time()),
                "side": "buy",
            }
        )
    return trades


class TradeHub:
    """Fan-out hub: one poller task per (chain, pair), many subscribers."""

    def __init__(self) -> None:
        self._subscribers: dict[tuple[str, str], set[WebSocket]] = defaultdict(set)
        self._tasks: dict[tuple[str, str], asyncio.Task] = {}

    async def subscribe(self, key: tuple[str, str], ws: WebSocket) -> None:
        self._subscribers[key].add(ws)
        if key not in self._tasks or self._tasks[key].done():
            chain, pair = key
            self._tasks[key] = asyncio.create_task(self._poll_loop(key, chain, pair))
            logger.info(f"started trade poller for {chain}/{pair}")

    def unsubscribe(self, key: tuple[str, str], ws: WebSocket) -> None:
        subs = self._subscribers.get(key)
        if not subs:
            return
        subs.discard(ws)
        if not subs:
            task = self._tasks.pop(key, None)
            if task:
                task.cancel()
            self._subscribers.pop(key, None)
            logger.info(f"stopped trade poller for {key[0]}/{key[1]} (no subscribers)")

    @property
    def active_pairs(self) -> int:
        return len(self._tasks)

    async def _poll_loop(self, key: tuple[str, str], chain: str, pair: str) -> None:
        try:
            while True:
                trades = await fetch_latest_trades(chain, pair)
                for trade in trades:
                    await self._broadcast(key, trade)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"trade poller {chain}/{pair} crashed: {e}")

    async def _broadcast(self, key: tuple[str, str], trade: dict) -> None:
        payload = json.dumps(trade, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._subscribers.get(key, ())):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unsubscribe(key, ws)


hub = TradeHub()


@router.websocket("/ws/trades/{chain}/{pair_address}")
async def trades_ws(websocket: WebSocket, chain: str, pair_address: str) -> None:
    """Stream live trades for a pair as JSON messages."""
    await websocket.accept()
    key = (chain, pair_address)
    await hub.subscribe(key, websocket)
    try:
        while True:
            # Keep the connection alive; client messages are ignored.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(key, websocket)
