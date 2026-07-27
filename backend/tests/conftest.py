"""
RugCharts test configuration — shared fixtures for endpoint tests.
Uses fakeredis for in-memory Redis mocking.
Each test sets up its own httpx_mock responses for external APIs.
"""

from unittest.mock import patch

import pytest
from fakeredis import FakeRedis
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.routers.rugcharts import router


@pytest.fixture(autouse=True)
def _mock_redis():
    """Replace real Redis with fakeredis for all tests."""
    fake = FakeRedis(decode_responses=True)
    with patch("app.routers.rugcharts._r", return_value=fake):
        yield fake


@pytest.fixture
def app() -> FastAPI:
    """Create a fresh FastAPI app with the rugcharts router for each test."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
async def client(app: FastAPI):
    """Async test client for the rugcharts router."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def _clear_fake_redis(_mock_redis):
    """Clear fake Redis between tests."""
    _mock_redis.flushall()
    yield
