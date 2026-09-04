"""RugCharts router package.

Aggregates the six RugCharts sub-routers (trending, ohlcv, intel, signals,
analyze, plugins) into a single ``router`` mounted at ``/api/v1/rugcharts``.
"""

from fastapi import APIRouter

from ._common import _validate_chain, _validate_pair_address
from .analyze import router as analyze_router
from .intel import router as intel_router
from .ohlcv import router as ohlcv_router
from .plugins import router as plugins_router
from .signals import router as signals_router
from .trending import router as trending_router

router = APIRouter(prefix="/api/v1", tags=["rugcharts"])

router.include_router(trending_router)
router.include_router(ohlcv_router)
router.include_router(intel_router)
router.include_router(signals_router)
router.include_router(analyze_router)
router.include_router(plugins_router)
