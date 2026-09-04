"""Tests for the WebSocket trade streaming endpoint."""

from unittest.mock import AsyncMock, patch

from app.ws.trades import hub, router
from fastapi import FastAPI
from starlette.testclient import TestClient

SAMPLE_TRADES = [
    {
        "token": "pair123",
        "chain": "solana",
        "price": 0.0,
        "volume": 5000.0,
        "timestamp": 1700000000,
        "side": "buy",
    }
]


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    return app


def test_ws_trades_streams_data_and_stops_poller_on_disconnect():
    with patch(
        "app.ws.trades.fetch_latest_trades",
        new=AsyncMock(return_value=SAMPLE_TRADES),
    ):
        client = TestClient(_app())
        with client.websocket_connect("/ws/trades/solana/pair123") as ws:
            msg = ws.receive_json()
            assert msg["token"] == "pair123"
            assert msg["chain"] == "solana"
            assert msg["volume"] == 5000.0
            assert msg["side"] == "buy"
        # After disconnect the poller for this pair should be gone.
        assert hub.active_pairs == 0


def test_ws_trades_multiple_connections_share_poller():
    with patch(
        "app.ws.trades.fetch_latest_trades",
        new=AsyncMock(return_value=SAMPLE_TRADES),
    ):
        client = TestClient(_app())
        with (
            client.websocket_connect("/ws/trades/solana/pairX") as ws1,
            client.websocket_connect("/ws/trades/solana/pairX") as ws2,
        ):
            assert ws1.receive_json() == SAMPLE_TRADES[0]
            assert ws2.receive_json() == SAMPLE_TRADES[0]
        assert hub.active_pairs == 0
