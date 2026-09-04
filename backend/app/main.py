"""
RugCharts Backend — FastAPI application entry point.

Mounts the rugcharts router and provides a health check.

Usage:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers.rugcharts import router as rugcharts_router
from app.ws.trades import router as trades_ws_router

logger = logging.getLogger("rugcharts")

APP_NAME = "rugcharts-backend"
APP_VERSION = "1.0.0"

_started_at = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    global _started_at
    _started_at = time.time()
    logger.info(f"{APP_NAME} v{APP_VERSION} starting...")
    yield
    logger.info(f"{APP_NAME} shutting down...")


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="RugCharts — multi-chain token intelligence API",
    lifespan=lifespan,
)

app.include_router(rugcharts_router)
logger.info("Mounted rugcharts_router at /api/v1/rugcharts/*")

app.include_router(trades_ws_router)
logger.info("Mounted trades_ws_router at /ws/trades/{chain}/{pair_address}")


@app.get("/")
async def root():
    return {
        "service": APP_NAME,
        "version": APP_VERSION,
        "status": "ok",
        "endpoints": {
            "rugcharts": "/api/v1/rugcharts/trending",
            "docs": "/docs",
        },
    }


@app.get("/health")
async def health():
    return {
        "service": APP_NAME,
        "version": APP_VERSION,
        "status": "ok",
        "uptime_seconds": int(time.time() - _started_at),
    }
