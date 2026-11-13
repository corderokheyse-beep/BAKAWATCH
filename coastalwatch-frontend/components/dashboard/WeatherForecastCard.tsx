'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  CloudSun, ChevronDown, ChevronUp, Droplets, Info, RefreshCw,
  Sun, Thermometer, Wind, Waves, ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip,
  type ChartOptions, type Plugin,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// Gloria, Oriental Mindoro coordinates (used by the server-side proxy route)

// ── Tide types & helpers ───────────────────────────────────────────────────
// ── Marine conditions types & helpers ─────────────────────────────────────
interface WaveEvent { time: string; height: number; type: 'peak' | 'trough' }
interface MarineState {
  currentWaveHeight: number
  currentCurrentVelocity: number
  trend: 'increasing' | 'decreasing' | 'steady'
  nextPeak:    WaveEvent | null
  nextTrough:  WaveEvent | null
  todayEvents: WaveEvent[]
  fetchedAt:   Date
  // Chart data — 24-hour window
  chartLabels:   string[]   // hour labels e.g. "2 AM"
  chartHeights:  number[]   // wave_height values
  chartNowIndex: number     // index of current hour for the "now" line
  allEvents:     WaveEvent[] // all extremes across 48 h for dot annotations
}

function fmtTideTime(isoHour: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(isoHour + ':00+08:00'))
}

function tideCountdown(from: Date, isoHour: string): string {
  const to = new Date(isoHour + ':00+08:00')
  const diffMs = to.getTime() - from.getTime()
  if (diffMs <= 0) return 'now'
  const totalMin = Math.round(diffMs / 60_000)
  const hrs  = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hrs === 0) return `${mins} min`
  if (mins === 0) return `${hrs} hr`
  return `${hrs} hr ${mins} min`
}

function detectWaveExtremes(times: string[], heights: number[]): WaveEvent[] {
  const events: WaveEvent[] = []
  for (let i = 1; i < heights.length - 1; i++) {
    const prev = heights[i - 1], cur = heights[i], next = heights[i + 1]
    if (cur > prev && cur > next) events.push({ time: times[i], height: cur, type: 'peak' })
    else if (cur < prev && cur < next) events.push({ time: times[i], height: cur, type: 'trough' })
  }
  return events
}

function seaConditionLabel(waveH: number): string {
  if (waveH < 0.1) return 'Calm'
  if (waveH < 0.5) return 'Slight'
  if (waveH < 1.25) return 'Moderate'
  if (waveH < 2.5) return 'Rough'
  return 'Very Rough'
}

function parseTideResponse(raw: {
  hourly: { time: string[]; wave_height: number[]; ocean_current_velocity: number[] }
}): MarineState {
  const { time, wave_height, ocean_current_velocity } = raw.hourly
  const now = new Date()
  const nowHour = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).format(now).replace(' ', 'T').slice(0, 13)

  let currentIndex = 0
  for (let i = 0; i < time.length; i++) {
    if (time[i].startsWith(nowHour)) { currentIndex = i; break }
  }

  const currentWaveHeight       = wave_height[currentIndex] ?? 0
  const prevWaveHeight          = wave_height[Math.max(0, currentIndex - 1)] ?? currentWaveHeight
  const currentCurrentVelocity  = ocean_current_velocity[currentIndex] ?? 0

  const trend: MarineState['trend'] =
    currentWaveHeight > prevWaveHeight + 0.05 ? 'increasing'
    : currentWaveHeight < prevWaveHeight - 0.05 ? 'decreasing' : 'steady'

  const allEvents = detectWaveExtremes(time, wave_height)
  const todayStr  = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)

  const todayEvents  = allEvents.filter(e => e.time.startsWith(todayStr))
  const nowMs        = now.getTime()
  const futureEvents = allEvents.filter(e => new Date(e.time + ':00+08:00').getTime() > nowMs)
  const nextPeak     = futureEvents.find(e => e.type === 'peak')   ?? null
  const nextTrough   = futureEvents.find(e => e.type === 'trough') ?? null

  // Build 24-hour chart window: start 2 hours before now, end 22 hours after
  const chartStart = Math.max(0, currentIndex - 2)
  const chartEnd   = Math.min(time.length - 1, chartStart + 23)
  const slicedTime    = time.slice(chartStart, chartEnd + 1)
  const slicedHeights = wave_height.slice(chartStart, chartEnd + 1)

  const chartLabels = slicedTime.map(t => {
    const h = parseInt(t.slice(11, 13), 10)
    return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`
  })

  return {
    currentWaveHeight,
    currentCurrentVelocity,
    trend,
    nextPeak,
    nextTrough,
    todayEvents,
    fetchedAt:    now,
    chartLabels,
    chartHeights: slicedHeights,
    chartNowIndex: currentIndex - chartStart,
    allEvents,
  }
}

// ── WaveChart: TidesChart-style area chart ────────────────────────────────
interface WaveChartProps {
  labels:   string[]
  heights:  number[]
  nowIndex: number
  events:   WaveEvent[]
}

// Custom Chart.js plugin: draws the vertical red "now" line and
// peak/trough dots with time labels — matching the reference image style.
function makeNowLinePlugin(heights: number[]): Plugin<'line'> {
  return {
    id: 'nowLine',
    afterDraw(chart, _args, opts: Record<string, unknown>) {
      const { ctx, chartArea, scales } = chart
      const nowIdx = (opts.nowIndex as number) ?? 0
      const events = (opts.events as WaveEvent[]) ?? []
      const labels = (opts.labels as string[]) ?? []

      // Vertical red "now" line
      const x = scales.x.getPixelForValue(nowIdx)
      if (x >= chartArea.left && x <= chartArea.right) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth   = 1.5
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.restore()
      }

      // Peak/trough dots + time labels
      events.forEach(ev => {
        const h = parseInt(ev.time.slice(11, 13), 10)
        const lbl = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`
        const sliceIdx = labels.indexOf(lbl)
        if (sliceIdx < 0) return

        const ex = scales.x.getPixelForValue(sliceIdx)
        const ey = scales.y.getPixelForValue(heights[sliceIdx] ?? ev.height)
        if (!ex || !ey) return

        const isPeak = ev.type === 'peak'
        ctx.save()
        ctx.beginPath()
        ctx.arc(ex, ey, 4, 0, Math.PI * 2)
        ctx.fillStyle   = isPeak ? '#3b82f6' : '#ef4444'
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = 1.5
        ctx.fill()
        ctx.stroke()

        const timeStr = new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(ev.time + ':00+08:00'))
        ctx.fillStyle = isPeak ? '#1d4ed8' : '#dc2626'
        ctx.font      = 'bold 9px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(timeStr, ex, isPeak ? ey - 10 : ey + 16)
        ctx.restore()
      })
    },
  }
}

function WaveChart({ labels, heights, nowIndex, events }: WaveChartProps) {
  const plugin = makeNowLinePlugin(heights)
  const maxH   = Math.max(...heights, 0.5)

  const data = {
    labels,
    datasets: [
      {
        data:            heights,
        fill:            true,
        tension:         0.4,
        borderColor:     '#3b82f6',
        borderWidth:     2,
        backgroundColor: (ctx: { chart: ChartJS }) => {
          const { chartArea } = ctx.chart
          if (!chartArea) return 'rgba(59,130,246,0.25)'
          const grad = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          grad.addColorStop(0,   'rgba(59,130,246,0.45)')
          grad.addColorStop(0.6, 'rgba(96,165,250,0.25)')
          grad.addColorStop(1,   'rgba(186,230,253,0.05)')
          return grad
        },
        pointRadius:      0,
        pointHoverRadius: 0,
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive:          true,
    maintainAspectRatio: false,
    animation:           false,
    plugins: {
      legend:  { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${(ctx.parsed.y as number).toFixed(2)} m`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, color: '#9ca3af',
        },
        grid:   { display: false },
        border: { display: false },
      },
      y: {
        min:  0,
        max:  Math.ceil(maxH * 10 + 2) / 10,
        ticks: {
          font: { size: 9 }, callback: v => `${(v as number).toFixed(1)} m`, color: '#9ca3af', count: 4,
        },
        grid:   { color: 'rgba(0,0,0,0.05)' },
        border: { display: false },
      },
    },
  }

  // Pass dynamic data into the plugin via its options key
  ;(options as Record<string, unknown>).plugins = {
    ...(options.plugins as object),
    nowLine: { nowIndex, events, labels },
  }

  return (
    <div className="mt-3 rounded-xl bg-white/80 border border-blue-100 px-3 pt-3 pb-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
        24-Hour Wave Height Chart · Gloria, Oriental Mindoro
      </p>
      <div className="relative h-36">
        <Line data={data} options={options} plugins={[plugin]} />
      </div>
      <div className="flex items-center gap-4 mt-1.5 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-red-400 rounded" /> Now
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> Peak
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Calm
        </span>
      </div>
    </div>
  )
}

// ── MarineSection: embedded inside WeatherForecastCard ───────────────────────
function TideSection() {
  const [marine, setMarine]           = useState<MarineState | null>(null)
  const [tideError, setTideError]     = useState('')
  const [tideLoading, setTideLoading] = useState(true)
  const [tideRefreshing, setTideRefreshing] = useState(false)
  const nowRef = useRef(new Date())

  const loadTides = useCallback(async (manual = false) => {
    if (manual) setTideRefreshing(true)
    else setTideLoading(true)
    setTideError('')
    nowRef.current = new Date()
    try {
      const res = await fetch('/api/tides', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      setMarine(parseTideResponse(await res.json()))
    } catch (err) {
      setTideError(err instanceof Error ? err.message : String(err))
    } finally {
      setTideLoading(false)
      setTideRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadTides()
    const t = setInterval(() => void loadTides(true), 30 * 60 * 1000)
    return () => clearInterval(t)
  }, [loadTides])

  return (
    <div className="mt-4 pt-4 border-t border-sky-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Waves className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold text-gray-900">Coastal Conditions</span>
          <span className="text-xs text-gray-400">· Gloria, Oriental Mindoro</span>
        </div>
        <button
          type="button"
          onClick={() => void loadTides(true)}
          disabled={tideLoading || tideRefreshing}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-blue-100 bg-white px-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition"
        >
          <RefreshCw className={`h-3 w-3 ${tideRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {tideLoading && (
        <div className="h-16 animate-pulse rounded-xl bg-blue-100/60" />
      )}

      {!tideLoading && tideError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Marine data unavailable ({tideError}). Click Refresh.</p>
        </div>
      )}

      {!tideLoading && !tideError && marine && (
        <>
        <div className="grid gap-3 sm:grid-cols-2">

          {/* Current conditions */}
          <div className="rounded-xl bg-white/80 border border-blue-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Current Sea State</p>
            <div className="flex items-end gap-2 mb-2">
              <p className="text-2xl font-extrabold text-blue-900 leading-none">
                {marine.currentWaveHeight.toFixed(2)}
                <span className="text-sm font-semibold text-blue-400 ml-0.5">m</span>
              </p>
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full mb-0.5 ${
                marine.trend === 'increasing' ? 'bg-blue-100 text-blue-700'
                : marine.trend === 'decreasing' ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {marine.trend === 'increasing'
                  ? <><ArrowUp className="w-2.5 h-2.5" /> Building</>
                  : marine.trend === 'decreasing'
                    ? <><ArrowDown className="w-2.5 h-2.5" /> Calming</>
                    : 'Steady'}
              </span>
            </div>
            <p className="text-xs font-semibold text-blue-700 mb-1">
              {seaConditionLabel(marine.currentWaveHeight)} waves
            </p>
            <p className="text-[11px] text-gray-500">
              Current: <span className="font-semibold">{marine.currentCurrentVelocity.toFixed(1)} km/h</span>
            </p>
            <div className="mt-2 space-y-0.5">
              {marine.nextTrough && (
                <p className="text-[11px] text-gray-600">
                  Calmer in <span className="font-semibold">{tideCountdown(nowRef.current, marine.nextTrough.time)}</span>
                  <span className="text-gray-400"> · {marine.nextTrough.height.toFixed(2)} m</span>
                </p>
              )}
              {marine.nextPeak && (
                <p className="text-[11px] text-gray-600">
                  Peak in <span className="font-semibold">{tideCountdown(nowRef.current, marine.nextPeak.time)}</span>
                  <span className="text-gray-400"> · {marine.nextPeak.height.toFixed(2)} m</span>
                </p>
              )}
            </div>
          </div>

          {/* Today's wave events */}
          <div className="rounded-xl bg-white/80 border border-blue-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Today's Wave Pattern</p>
            {marine.todayEvents.length === 0
              ? <p className="text-xs text-gray-400 italic">No significant changes.</p>
              : (
                <div className="space-y-1">
                  {marine.todayEvents.slice(0, 4).map((ev, i) => (
                    <div key={i} className="flex items-center justify-between gap-1">
                      <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                        ev.type === 'peak' ? 'text-blue-700' : 'text-green-700'
                      }`}>
                        {ev.type === 'peak'
                          ? <ArrowUp className="w-3 h-3" />
                          : <ArrowDown className="w-3 h-3" />}
                        {ev.type === 'peak' ? 'Peak' : 'Calm'}
                      </span>
                      <span className="text-[11px] text-gray-500 tabular-nums">{fmtTideTime(ev.time)}</span>
                      <span className="text-[11px] font-bold text-gray-800 tabular-nums">{ev.height.toFixed(2)} m</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>

        {/* ── Wave height chart (TidesChart style) ── */}
        <WaveChart
          labels={marine.chartLabels}
          heights={marine.chartHeights}
          nowIndex={marine.chartNowIndex}
          events={marine.allEvents}
        />
        </>
      )}

      <p className="mt-2 text-[10px] text-gray-400">
        Wave data by Open-Meteo Marine API (ECMWF). For field planning only — not for navigation.
      </p>
    </div>
  )
}

interface CurrentWeather {
  time: string
  temperature_2m: number
  relative_humidity_2m: number
  apparent_temperature: number
  is_day: number
  precipitation: number
  weather_code: number
  wind_speed_10m: number
  wind_direction_10m: number
}

interface HourlyWeather {
  time: string
  temperature: number | null
  precipitation_probability: number | null
  precipitation: number | null
  weather_code: number | null
}

interface DailyWeather {
  date: string
  weather_code: number | null
  temperature_max: number | null
  temperature_min: number | null
  precipitation_probability_max: number | null
}

interface WeatherForecast {
  location: string
  timezone: string
  fetched_at: string
  current: CurrentWeather
  hourly: HourlyWeather[]
  daily: DailyWeather[]
}

interface OpenMeteoResponse {
  timezone: string
  current: CurrentWeather
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
    precipitation: number[]
    weather_code: number[]
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
}

function normalizeForecast(data: OpenMeteoResponse): WeatherForecast {
  const currentHour = `${data.current.time.slice(0, 13)}:00`
  const hourly = data.hourly.time
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time >= currentHour)
    .slice(0, 6)
    .map(({ time, index }) => ({
      time,
      temperature: data.hourly.temperature_2m[index] ?? null,
      precipitation_probability: data.hourly.precipitation_probability[index] ?? null,
      precipitation: data.hourly.precipitation[index] ?? null,
      weather_code: data.hourly.weather_code[index] ?? null,
    }))

  const daily = data.daily.time.map((date, index) => ({
    date,
    weather_code: data.daily.weather_code[index] ?? null,
    temperature_max: data.daily.temperature_2m_max[index] ?? null,
    temperature_min: data.daily.temperature_2m_min[index] ?? null,
    precipitation_probability_max: data.daily.precipitation_probability_max[index] ?? null,
  }))

  if (hourly.length === 0 || daily.length === 0) {
    throw new Error('The forecast provider returned incomplete weather data.')
  }

  return {
    location: 'Gloria, Oriental Mindoro',
    timezone: data.timezone || 'Asia/Manila',
    fetched_at: new Date().toISOString(),
    current: data.current,
    hourly,
    daily,
  }
}

function weatherDescription(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if ([51, 53, 55].includes(code)) return 'Drizzle'
  if ([56, 57].includes(code)) return 'Freezing drizzle'
  if ([61, 63, 65].includes(code)) return 'Rain'
  if ([66, 67].includes(code)) return 'Freezing rain'
  if ([71, 73, 75, 77].includes(code)) return 'Snow'
  if ([80, 81, 82].includes(code)) return 'Rain showers'
  if ([85, 86].includes(code)) return 'Snow showers'
  if (code === 95) return 'Thunderstorm'
  if ([96, 99].includes(code)) return 'Thunderstorm with hail'
  return 'Conditions unavailable'
}

function WeatherIcon({ code, isDay = true, className = 'h-5 w-5' }: {
  code: number | null | undefined
  isDay?: boolean
  className?: string
}) {
  if (code == null) return <Cloud className={className} />
  if (code === 0) return isDay ? <Sun className={className} /> : <Cloud className={className} />
  if (code <= 2) return <CloudSun className={className} />
  if (code === 3 || code === 45 || code === 48) return code === 3 ? <Cloud className={className} /> : <CloudFog className={className} />
  if (code <= 57) return <CloudDrizzle className={className} />
  if (code <= 67 || (code >= 80 && code <= 82)) return <CloudRain className={className} />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={className} />
  if (code >= 95) return <CloudLightning className={className} />
  return <Cloud className={className} />
}

function formatForecastTime(value: string, timezone: string, options: Intl.DateTimeFormatOptions): string {
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : value
  return new Intl.DateTimeFormat('en-PH', { timeZone: timezone, ...options }).format(new Date(timestamp))
}

export default function WeatherForecastCard() {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const loadForecast = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      // Use the server-side proxy route (/api/weather) instead of calling
      // Open-Meteo directly from the browser — the direct fetch was timing out
      // in production because the client network couldn't reach api.open-meteo.com.
      const response = await fetch('/api/weather', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${response.status}`)
      }
      const data = await response.json() as OpenMeteoResponse
      setForecast(normalizeForecast(data))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Weather unavailable (${msg}). Click Refresh to try again.`)
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void loadForecast()
    const timer = window.setInterval(() => void loadForecast(true), 30 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [loadForecast])

  return (
    <section className="card !p-4 sm:!p-5 overflow-hidden border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <CloudSun className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Weather Forecast</h2>
            <p className="text-xs text-gray-500">{forecast?.location ?? 'Gloria, Oriental Mindoro'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {forecast && (
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              aria-expanded={expanded}
              aria-controls="weather-forecast-details"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
            >
              {expanded ? 'Less' : 'Hourly details'}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadForecast(true)}
            disabled={loading || refreshing}
            aria-label="Refresh weather forecast"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-100 bg-white px-2.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-sky-100/70" aria-label="Loading weather forecast" />
      ) : error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : forecast && (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,0.8fr)_2fr]">
            <div className="flex min-w-0 items-center gap-3 rounded-xl bg-white/80 px-3 py-2">
              <WeatherIcon code={forecast.current.weather_code} isDay={forecast.current.is_day === 1} className="h-9 w-9 shrink-0 text-sky-600" />
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold leading-none text-sky-950">
                  {Math.round(forecast.current.temperature_2m)}°
                </p>
                <p className="truncate text-xs font-medium text-gray-600">
                  {weatherDescription(forecast.current.weather_code)}
                </p>
              </div>
              <p className="ml-auto shrink-0 text-[11px] text-gray-500">
                Feels {Math.round(forecast.current.apparent_temperature)}°
              </p>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {forecast.daily.map((day, index) => (
                <div key={day.date} className="min-w-0 rounded-xl bg-white/80 px-1.5 py-2 text-center">
                  <p className="text-[10px] font-semibold text-gray-500">
                    {index === 0 ? 'Today' : formatForecastTime(day.date, forecast.timezone, { weekday: 'short' })}
                  </p>
                  <WeatherIcon code={day.weather_code} className="mx-auto my-1 h-4 w-4 text-sky-600" />
                  <p className="text-xs font-semibold text-gray-800">
                    {day.temperature_max == null ? '—' : `${Math.round(day.temperature_max)}°`}
                    <span className="ml-0.5 font-normal text-gray-400">
                      {day.temperature_min == null ? '' : `${Math.round(day.temperature_min)}°`}
                    </span>
                  </p>
                  <p className="text-[10px] text-blue-700">
                    {day.precipitation_probability_max == null ? '—' : `${day.precipitation_probability_max}%`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {expanded && (
            <div id="weather-forecast-details" className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <p className="flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs text-gray-600">
                  <Thermometer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                  Feels {Math.round(forecast.current.apparent_temperature)}°C
                </p>
                <p className="flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs text-gray-600">
                  <Droplets className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                  Humidity {forecast.current.relative_humidity_2m}%
                </p>
                <p className="flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs text-gray-600">
                  <Wind className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                  Wind {Math.round(forecast.current.wind_speed_10m)} km/h
                </p>
                <p className="flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs text-gray-600">
                  <CloudRain className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  Rain {forecast.current.precipitation} mm
                </p>
              </div>

              <div className="rounded-xl bg-white/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Next hours</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {forecast.hourly.map(hour => (
                    <div key={hour.time} className="rounded-lg bg-sky-50/80 px-1.5 py-2 text-center">
                      <p className="text-[10px] font-medium text-gray-500">
                        {formatForecastTime(hour.time, forecast.timezone, { hour: 'numeric' })}
                      </p>
                      <WeatherIcon code={hour.weather_code} className="mx-auto my-1 h-4 w-4 text-sky-600" />
                      <p className="text-xs font-bold text-gray-800">
                        {hour.temperature == null ? '—' : `${Math.round(hour.temperature)}°`}
                      </p>
                      <p className="text-[10px] text-blue-700">
                        {hour.precipitation_probability == null ? '—' : `${hour.precipitation_probability}% rain`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sky-100 pt-2 text-[10px] text-gray-500">
            <p>Weather data by Open-Meteo. Forecasts are estimates.</p>
            <div className="flex items-center gap-3">
              <span>
                Updated {formatForecastTime(forecast.fetched_at, forecast.timezone, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="font-semibold text-sky-700 hover:underline">
                Open-Meteo
              </a>
            </div>
          </div>
        </>
      )}

      {/* ── Tide Monitor ── always shown below weather, same card ── */}
      <TideSection />
    </section>
  )
}
