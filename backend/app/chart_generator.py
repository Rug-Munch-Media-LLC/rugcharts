"""Telegram chart generator — matplotlib PNG with RMI branding.
Replaces plotly/kaleido with mplfinance + matplotlib for reliable server-side rendering.
"""

import io
import logging
from datetime import UTC, datetime

import httpx
import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec

logger = logging.getLogger("chart_generator")

RMI_BRAND = {
    "bg": "#0f0f1a",
    "grid": "#1a1a2e",
    "up": "#00c853",
    "down": "#ff1744",
    "accent": "#7c4dff",
    "text": "#e0e0e0",
}

# Fallback OHLCV sources (Binance blocked from Talos)
_OHLCV_SOURCES = ["kraken", "coinbase", "kucoin"]


async def fetch_ohlcv(token: str, chain: str = "solana", days: int = 7) -> pd.DataFrame | None:
    """Fetch OHLCV from Kraken/Coinbase. Returns DataFrame with timestamp, open, high, low, close, volume."""
    import ccxt

    for exc_name in _OHLCV_SOURCES:
        try:
            exchange_class = getattr(ccxt, exc_name)
            ex = exchange_class()
            symbol = f"{token}/USDT" if "/" not in token else token
            ohlcv = ex.fetch_ohlcv(symbol, "1h", limit=days * 24)
            if ohlcv and len(ohlcv) > 10:
                df = pd.DataFrame(
                    ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"]
                )
                df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
                return df
        except Exception:  # noqa: S112
            continue

    # Fallback: Kraken REST API directly
    try:
        pair = token.upper().replace("/", "")
        url = f"https://api.kraken.com/0/public/OHLC?pair={pair}USD&interval=60"
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(url)
            if r.status_code == 200:
                data = r.json()
                for _key, ohlcv_list in data.get("result", {}).items():
                    if isinstance(ohlcv_list, list) and len(ohlcv_list) > 10:
                        df = pd.DataFrame(
                            ohlcv_list,
                            columns=[
                                "timestamp",
                                "open",
                                "high",
                                "low",
                                "close",
                                "volume",
                                "vwap",
                                "count",
                            ],
                        )
                        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="s")
                        for col in ["open", "high", "low", "close", "volume"]:
                            df[col] = df[col].astype(float)
                        return df[["timestamp", "open", "high", "low", "close", "volume"]]
    except Exception:  # noqa: S110
        pass
    return None


def generate_chart_png(
    df: pd.DataFrame, token: str, chain: str, days: int = 7
) -> tuple[bytes, str]:
    """Generate branded chart PNG + text summary. Returns (png_bytes, markdown_caption)."""
    df = df.copy()
    close = df["close"].values.astype(float)

    # Compute indicators (simple math, no TA-Lib dependency)
    df["sma_20"] = pd.Series(close).rolling(window=min(20, len(close))).mean().values
    df["sma_50"] = pd.Series(close).rolling(window=min(50, len(close))).mean().values

    # RSI
    delta = np.diff(close)
    gain = np.where(delta > 0, delta, 0)
    loss = np.where(delta < 0, -delta, 0)
    avg_gain = pd.Series(gain).rolling(window=14).mean().values
    avg_loss = pd.Series(loss).rolling(window=14).mean().values
    rs = np.divide(avg_gain, avg_loss, out=np.zeros_like(avg_gain), where=avg_loss != 0)
    rsi = 100 - (100 / (1 + rs))
    rsi = np.insert(rsi, 0, 50)  # First row has no RSI

    # MACD (computed values unused in current chart layout)
    # Build chart
    fig = plt.figure(figsize=(10, 7), facecolor=RMI_BRAND["bg"])
    gs = GridSpec(3, 1, height_ratios=[3, 1, 1], hspace=0.08)

    # Price panel
    ax1 = fig.add_subplot(gs[0])
    ax1.set_facecolor(RMI_BRAND["bg"])

    # Candlesticks (simplified as line + fill)
    ax1.plot(df["timestamp"], df["close"], color=RMI_BRAND["accent"], linewidth=1, alpha=0.8)
    ax1.fill_between(
        df["timestamp"],
        df["close"],
        df["open"],
        where=(df["close"] >= df["open"]),
        color=RMI_BRAND["up"],
        alpha=0.3,
    )
    ax1.fill_between(
        df["timestamp"],
        df["close"],
        df["open"],
        where=(df["close"] < df["open"]),
        color=RMI_BRAND["down"],
        alpha=0.3,
    )

    # SMAs
    sma20_color = "#7c4dff"
    sma50_color = "#00c853"
    if not df["sma_20"].isna().all():
        ax1.plot(
            df["timestamp"], df["sma_20"], color=sma20_color, linewidth=1, alpha=0.7, label="SMA 20"
        )
    if not df["sma_50"].isna().all():
        ax1.plot(
            df["timestamp"], df["sma_50"], color=sma50_color, linewidth=1, alpha=0.7, label="SMA 50"
        )

    # Bollinger Bands
    std = df["close"].rolling(20).std()
    mid = df["close"].rolling(20).mean()
    upper = mid + 2 * std
    lower = mid - 2 * std
    ax1.fill_between(df["timestamp"], upper, lower, alpha=0.05, color=RMI_BRAND["accent"])

    # Current price label
    last_close = df.iloc[-1]["close"]
    ax1.axhline(y=last_close, color=RMI_BRAND["accent"], linewidth=0.5, linestyle="--", alpha=0.5)
    ax1.annotate(
        f"${last_close:.2f}",
        xy=(df["timestamp"].iloc[-1], last_close),
        xytext=(10, 10),
        textcoords="offset points",
        color="white",
        fontsize=12,
        fontweight="bold",
        bbox={
            "boxstyle": "round,pad=0.3",
            "facecolor": RMI_BRAND["bg"],
            "edgecolor": RMI_BRAND["accent"],
            "alpha": 0.8,
        },
    )

    ax1.set_title(
        f"{token.upper()} / {chain.upper()} — Last {days}d",
        color="white",
        fontsize=14,
        fontweight="bold",
        pad=10,
    )
    ax1.grid(True, alpha=0.1, color=RMI_BRAND["grid"])
    ax1.legend(
        loc="upper left",
        fontsize=8,
        labelcolor="white",
        facecolor=RMI_BRAND["bg"],
        edgecolor="none",
    )
    ax1.tick_params(colors=RMI_BRAND["text"], labelsize=8)
    ax1.set_xticklabels([])
    plt.setp(ax1.get_xticklabels(), visible=False)

    # RSI panel
    ax2 = fig.add_subplot(gs[1], sharex=ax1)
    ax2.set_facecolor(RMI_BRAND["bg"])
    ax2.plot(df["timestamp"], rsi, color=RMI_BRAND["accent"], linewidth=1.5)
    ax2.axhline(y=70, color="red", linewidth=0.5, linestyle="--", alpha=0.5)
    ax2.axhline(y=30, color="green", linewidth=0.5, linestyle="--", alpha=0.5)
    ax2.axhline(y=50, color="gray", linewidth=0.3, linestyle=":", alpha=0.3)
    ax2.set_ylabel("RSI", color=RMI_BRAND["text"], fontsize=9)
    ax2.set_ylim(0, 100)
    ax2.grid(True, alpha=0.05, color=RMI_BRAND["grid"])
    ax2.tick_params(colors=RMI_BRAND["text"], labelsize=7)
    ax2.set_xticklabels([])
    plt.setp(ax2.get_xticklabels(), visible=False)

    # Volume panel
    ax3 = fig.add_subplot(gs[2], sharex=ax1)
    ax3.set_facecolor(RMI_BRAND["bg"])
    colors = [
        RMI_BRAND["up"] if df.iloc[i]["close"] >= df.iloc[i]["open"] else RMI_BRAND["down"]
        for i in range(len(df))
    ]
    ax3.bar(df["timestamp"], df["volume"], color=colors, width=0.8, alpha=0.6)
    ax3.set_ylabel("Volume", color=RMI_BRAND["text"], fontsize=9)
    ax3.grid(True, alpha=0.05, color=RMI_BRAND["grid"])
    ax3.tick_params(colors=RMI_BRAND["text"], labelsize=7)
    ax3.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
    ax3.xaxis.set_major_locator(mdates.DayLocator())

    # Watermark
    fig.text(
        0.98,
        0.98,
        "⚡ RMI Analytics",
        fontsize=11,
        color="white",
        alpha=0.08,
        ha="right",
        va="top",
        fontweight="bold",
    )

    # Timestamp
    fig.text(
        0.5,
        0.01,
        f"Generated {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}",
        fontsize=7,
        color="gray",
        alpha=0.5,
        ha="center",
    )

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, facecolor=RMI_BRAND["bg"], bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    # Text summary
    prev_close = df.iloc[-2]["close"]
    change = ((last_close - prev_close) / prev_close) * 100
    rsi_now = rsi[-1]
    sma_20 = df["sma_20"].iloc[-1] if not df["sma_20"].isna().iloc[-1] else last_close
    ma_signal = "above" if last_close > sma_20 else "below"

    caption = (
        f"{'📈' if change >= 0 else '📉'} *{token.upper()}* | {chain.upper()}\n"
        f"💵 ${last_close:,.4f} ({change:+.2f}% 24h)\n"
        f"📊 RSI(14): {rsi_now:.1f} ({'overbought' if rsi_now > 70 else 'oversold' if rsi_now < 30 else 'neutral'})\n"
        f"📊 SMA 20: ${sma_20:,.4f} (price is {ma_signal})\n"
    )

    return buf.getvalue(), caption


async def chart_command(
    token: str, chain: str = "solana", days: int = 7
) -> tuple[bytes | None, str]:
    """Generate chart + summary for Telegram. Returns (png_bytes, caption)."""
    df = await fetch_ohlcv(token, chain, days)
    if df is None or len(df) < 10:
        return None, f"❌ No price data for *{token}* on {chain}"
    try:
        png, caption = generate_chart_png(df, token, chain, days)
        return png, caption
    except Exception as e:
        logger.error(f"Chart generation failed: {e}")
        return None, f"❌ Chart error: {str(e)[:100]}"
