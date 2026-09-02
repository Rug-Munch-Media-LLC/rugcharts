# syntax=docker/dockerfile:1
# rugcharts-backend — FastAPI charting API
# Multi-stage: deps → runtime
# Target: production uvicorn server

# ── Stage 1: Dependencies ───────────────────────────────────────────
FROM python:3.12-slim AS deps

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install runtime deps only (requirements.txt separates test deps)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOME=/app

WORKDIR $APP_HOME

# Non-root user (uid 1000)
RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --create-home --shell /usr/sbin/nologin app

# Copy installed deps from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application code
COPY backend/app ./app

# Run as non-root
USER 1000:1000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status==200 else 1)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
