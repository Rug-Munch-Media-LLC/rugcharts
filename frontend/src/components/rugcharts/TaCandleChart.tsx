import kandInit, { ema as kandEma } from 'kand'
import kandWasmUrl from 'kand/kand_bg.wasm?url'
import type { Chart, DeepPartial, KLineData, Styles } from 'klinecharts'
import { dispose, init, registerIndicator } from 'klinecharts'
import { useEffect, useRef } from 'react'

/**
 * TaCandleChart — self-contained technical-analysis candlestick chart.
 *
 * Renders OHLCV candles with KLineChart and computes indicators in the
 * browser:
 *  - EMA overlay  → kand (WASM TA-Lib `ema`)  — same close series
 *  - MACD subpane → kand `ema` machinery (12/26 fast+slow, 9 signal)
 *  - RSI subpane  → Wilder smoothing in TS (kand@0.1.1 only ships EMA)
 *
 * The computed series are exposed to KLineChart as custom indicators
 * (`KAND_EMA`, `KAND_MACD`, `KAND_RSI`), so values render as overlays and
 * in the crosshair tooltip. The component is deliberately self-contained:
 * it does not touch any existing RugCharts components.
 */

/** One OHLCV candle accepted by the chart (klinecharts KLineData shape). */
export type TaCandleData = KLineData

export interface TaCandleChartProps {
  /** OHLCV candles, oldest first. */
  data: TaCandleData[]
  /** Symbol label shown in the chart header. */
  ticker?: string
  /** Container height in pixels. */
  height?: number
}

/** Figure data returned by the custom indicators. */
interface EmaFigureData {
  ema: number | null
}
interface MacdFigureData {
  dif: number | null
  dea: number | null
  macd: number | null
}
interface RsiFigureData {
  rsi: number | null
}

/* ------------------------------------------------------------------ */
/* kand (WASM) bootstrap                                               */
/* ------------------------------------------------------------------ */

let kandReady = false
let kandInitPromise: Promise<void> | null = null

/** Initialise the kand WASM module once; safe to call repeatedly. */
function ensureKandReady(): Promise<void> {
  if (kandInitPromise === null) {
    kandInitPromise = kandInit(kandWasmUrl).then(() => {
      kandReady = true
    })
  }
  return kandInitPromise
}

/* ------------------------------------------------------------------ */
/* Indicator computation (pure, synchronous — called by KLineChart's   */
/* custom-indicator calc pipeline with the chart's dataList)           */
/* ------------------------------------------------------------------ */

function computeKandEma(dataList: KLineData[], period: number): EmaFigureData[] {
  if (!kandReady) return dataList.map(() => ({ ema: null }))
  const closes = Float64Array.from(dataList, (item) => item.close)
  const raw = kandEma(closes, period)
  return dataList.map((_, index) => {
    const value = raw[index]
    return {
      // kand's EMA leaves the warm-up window (index < period - 1) as NaN.
      ema: index < period - 1 || value === undefined || Number.isNaN(value) ? null : value,
    }
  })
}

function computeKandMacd(dataList: KLineData[], params: number[]): MacdFigureData[] {
  const fast = params[0] ?? 12
  const slow = params[1] ?? 26
  const signal = params[2] ?? 9
  if (!kandReady) return dataList.map(() => ({ dif: null, dea: null, macd: null }))

  const closes = Float64Array.from(dataList, (item) => item.close)
  // All three MACD legs are kand EMA passes over the close series.
  const emaFast = kandEma(closes, fast)
  const emaSlow = kandEma(closes, slow)

  // kand's EMA leaves the warm-up window as NaN. Seed those dif values
  // with 0 so the recursive signal pass never ingests NaN.
  const difValidStart = Math.max(fast, slow) - 1
  const difValues = Array.from({ length: dataList.length }, () => 0)
  for (let index = difValidStart; index < dataList.length; index++) {
    const fastValue = emaFast[index]
    const slowValue = emaSlow[index]
    difValues[index] = fastValue === undefined || slowValue === undefined ? 0 : fastValue - slowValue
  }
  const deaValues = kandEma(Float64Array.from(difValues), signal)
  const deaValidStart = difValidStart + signal - 1

  return dataList.map((_, index) => {
    const dif = index < difValidStart ? null : (difValues[index] ?? null)
    const deaValue = deaValues[index]
    const dea =
      index < deaValidStart || dif === null || deaValue === undefined || Number.isNaN(deaValue) ? null : deaValue
    const macd = dif === null || dea === null ? null : (dif - dea) * 2
    return { dif, dea, macd }
  })
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Wilder's RSI. kand@0.1.1 exports only `ema`, so RSI is computed here
 * with the standard Wilder smoothing (seed over the first `period`
 * changes, then exponential smoothing).
 */
function computeRsi(dataList: KLineData[], period: number): RsiFigureData[] {
  const closes = dataList.map((item) => item.close)
  const result: RsiFigureData[] = Array.from({ length: dataList.length })
  let avgGain = 0
  let avgLoss = 0
  for (let index = 0; index < closes.length; index++) {
    result[index] = { rsi: null }
    if (index === 0) continue

    const change = (closes[index] ?? 0) - (closes[index - 1] ?? 0)
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    if (index <= period) {
      avgGain += gain
      avgLoss += loss
      if (index === period) {
        avgGain /= period
        avgLoss /= period
        result[index] = { rsi: rsiFromAverages(avgGain, avgLoss) }
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      result[index] = { rsi: rsiFromAverages(avgGain, avgLoss) }
    }
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Custom indicator registration (once per module)                     */
/* ------------------------------------------------------------------ */

let indicatorsRegistered = false

function registerKandIndicators(): void {
  if (indicatorsRegistered) return
  indicatorsRegistered = true

  registerIndicator<EmaFigureData, number>({
    name: 'KAND_EMA',
    shortName: 'EMA',
    series: 'price',
    calcParams: [20],
    figures: [{ key: 'ema', title: 'EMA: ', type: 'line' }],
    styles: { lines: [{ color: '#f59e0b', size: 1 }] },
    calc: (dataList, indicator) => computeKandEma(dataList, indicator.calcParams[0] ?? 20),
  })

  registerIndicator<MacdFigureData, number>({
    name: 'KAND_MACD',
    shortName: 'MACD',
    series: 'normal',
    calcParams: [12, 26, 9],
    figures: [
      { key: 'dif', title: 'DIF: ', type: 'line' },
      { key: 'dea', title: 'DEA: ', type: 'line' },
      { key: 'macd', title: 'MACD: ', type: 'bar', baseValue: 0 },
    ],
    styles: {
      lines: [
        { color: '#22d3ee', size: 1 },
        { color: '#a78bfa', size: 1 },
      ],
      bars: [{ upColor: '#22c55e', downColor: '#ef4444', noChangeColor: '#94a3b8' }],
    },
    calc: (dataList, indicator) => computeKandMacd(dataList, indicator.calcParams),
  })

  registerIndicator<RsiFigureData, number>({
    name: 'KAND_RSI',
    shortName: 'RSI',
    series: 'normal',
    calcParams: [14],
    figures: [{ key: 'rsi', title: 'RSI: ', type: 'line' }],
    styles: { lines: [{ color: '#f472b6', size: 1 }] },
    calc: (dataList, indicator) => computeRsi(dataList, indicator.calcParams[0] ?? 14),
  })
}

/* ------------------------------------------------------------------ */
/* Dark theme (keys verified against klinecharts v10 style types)      */
/* ------------------------------------------------------------------ */

const darkStyles: DeepPartial<Styles> = {
  grid: {
    horizontal: { show: true, size: 1, color: 'rgba(148, 163, 184, 0.12)', dashedValue: [2, 2] },
    vertical: { show: true, size: 1, color: 'rgba(148, 163, 184, 0.12)', dashedValue: [2, 2] },
  },
  candle: {
    bar: {
      upColor: '#22c55e',
      downColor: '#ef4444',
      noChangeColor: '#94a3b8',
      upBorderColor: '#22c55e',
      downBorderColor: '#ef4444',
      noChangeBorderColor: '#94a3b8',
      upWickColor: '#22c55e',
      downWickColor: '#ef4444',
      noChangeWickColor: '#94a3b8',
    },
    priceMark: {
      last: { upColor: '#22c55e', downColor: '#ef4444', noChangeColor: '#94a3b8' },
    },
  },
  xAxis: {
    axisLine: { color: 'rgba(148, 163, 184, 0.25)' },
    tickLine: { show: false },
    tickText: { color: '#94a3b8' },
  },
  yAxis: {
    axisLine: { color: 'rgba(148, 163, 184, 0.25)' },
    tickLine: { show: false },
    tickText: { color: '#94a3b8' },
  },
  separator: { color: 'rgba(148, 163, 184, 0.15)', size: 1 },
  crosshair: {
    horizontal: {
      line: { color: 'rgba(148, 163, 184, 0.5)', size: 1 },
      text: { backgroundColor: '#334155', color: '#f1f5f9' },
    },
    vertical: {
      line: { color: 'rgba(148, 163, 184, 0.5)', size: 1 },
      text: { backgroundColor: '#334155', color: '#f1f5f9' },
    },
  },
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function TaCandleChart({ data, ticker = 'OHLCV', height = 460 }: TaCandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const dataRef = useRef<TaCandleData[]>(data)

  // Keep the newest candles available to the chart's async loader.
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Create the chart once the kand WASM module is ready.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    registerKandIndicators()
    void ensureKandReady().then(() => {
      if (cancelled) return
      const chart = init(container, { locale: 'en-US', styles: darkStyles })
      if (!chart) return
      chartRef.current = chart
      chart.setSymbol({ ticker })
      chart.setPeriod({ span: 1, type: 'day' })
      chart.createIndicator('VOL')
      // Kand-computed EMA overlaid on the candle pane.
      chart.createIndicator({ name: 'KAND_EMA', paneId: 'candle_pane' }, true)
      // Kand-computed MACD + RSI in their own subpanes.
      chart.createIndicator('KAND_MACD')
      chart.createIndicator('KAND_RSI')
      chart.setDataLoader({
        getBars: ({ callback }) => callback(dataRef.current),
      })
    })

    return () => {
      cancelled = true
      if (chartRef.current) {
        dispose(chartRef.current)
        chartRef.current = null
      }
    }
  }, [ticker])

  // Push new candles into the live chart whenever the prop changes.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setSymbol({ ticker })
    chart.setPeriod({ span: 1, type: 'day' })
    chart.setDataLoader({
      getBars: ({ callback }) => callback(data),
    })
  }, [data, ticker])

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#0d0d15]"
      style={{ height }}
      role="img"
      aria-label={`Technical analysis candlestick chart for ${ticker}`}
    />
  )
}
