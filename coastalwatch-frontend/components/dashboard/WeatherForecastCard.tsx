'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ChevronDown,
  ChevronUp,
  Droplets,
  Info,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
  Waves,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

// Gloria, Oriental Mindoro coordinates (used by the server-side proxy route)

// ── Tide types & helpers ───────────────────────────────────────────────────
interface TideEvent { time: string; height: number; type: 'high' | 'low' }
interface TideState {
  currentHeight: number
  trend: 'rising' | 'falling' | 'steady'
  nextHigh: TideEvent | null
  nextLow:  TideEvent | null
  todayEvents: TideEvent[]
  fetchedAt: Date
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
  const hrs = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hrs === 0) return `${mins} min`
  if (mins === 0) return `${hrs} hr`
  return `${hrs} hr ${mins} min`
}

function detectTideExtremes(times: string[], heights: number[]): TideEvent[] {
  const events: TideEvent[] = []
  for (let i = 1; i < heights.length - 1; i++) {
    const prev = heights[i - 1], cur = heights[i], next = heights[i + 1]
    if (cur > prev && cur > next) events.push({ time: times[i], height: cur, type: 'high' })
    else if (cur < prev && cur < next) events.push({ time: times[i], height: cur, type: 'low' })
  }
  return events
}

function parseTideResponse(raw: { hourly: { time: string[]; sea_level_height: number[] } }): TideState {
  const { time, sea_level_height } = raw.hourly
  const now = new Date()
  const nowHour = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).format(now).replace(' ', 'T').slice(0, 13)

  let currentIndex = 0
  for (let i = 0; i < time.length; i++) {
    if (time[i].startsWith(nowHour)) { currentIndex = i; break }
  }

  const currentHeight = sea_level_height[currentIndex] ?? 0
  const prevHeight    = sea_level_height[Math.max(0, currentIndex - 1)] ?? currentHeight
  const trend: TideState['trend'] =
    currentHeight > prevHeight + 0.02 ? 'rising'
    : currentHeight < prevHeight - 0.02 ? 'falling' : 'steady'

  const allEvents = detectTideExtremes(time, sea_level_height)
  const todayStr  = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)

  const todayEvents   = allEvents.filter(e => e.time.startsWith(todayStr))
  const nowMs         = now.getTime()
  const futureEvents  = allEvents.filter(e => new Date(e.time + ':00+08:00').getTime() > nowMs)
  const nextHigh      = futureEvents.find(e => e.type === 'high') ?? null
  const nextLow       = futureEvents.find(e => e.type === 'low')  ?? null

  return { currentHeight, trend, nextHigh, nextLow, todayEvents, fetchedAt: now }
}

// ── TideSection: embedded tide card shown inside WeatherForecastCard ──────────
function TideSection() {
  const [tide, setTide]           = useState<TideState | null>(null)
  const [tideError, setTideError] = useState('')
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
      setTide(parseTideResponse(await res.json()))
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
      {/* Tide header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Waves className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold text-gray-900">Tide Monitor</span>
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
          <p>Tide data unavailable ({tideError}). Click Refresh.</p>
        </div>
      )}

      {!tideLoading && !tideError && tide && (
        <div className="grid gap-3 sm:grid-cols-2">

          {/* Current + next tides */}
          <div className="rounded-xl bg-white/80 border border-blue-100 px-3 py-2.5">
            <div className="flex items-end gap-2 mb-2">
              <p className="text-2xl font-extrabold text-blue-900 leading-none">
                {tide.currentHeight.toFixed(2)}
                <span className="text-sm font-semibold text-blue-400 ml-0.5">m</span>
              </p>
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full mb-0.5 ${
                tide.trend === 'rising' ? 'bg-blue-100 text-blue-700'
                : tide.trend === 'falling' ? 'bg-red-100 text-red-600'
                : 'bg-gray-100 text-gray-500'
              }`}>
                {tide.trend === 'rising'
                  ? <><ArrowUp className="w-2.5 h-2.5" /> Rising</>
                  : tide.trend === 'falling'
                    ? <><ArrowDown className="w-2.5 h-2.5" /> Falling</>
                    : 'Steady'}
              </span>
            </div>
            <div className="space-y-1">
              {tide.nextLow && (
                <p className="text-[11px] text-gray-600">
                  Next <span className="font-bold text-red-600">low</span> in{' '}
                  <span className="font-semibold">{tideCountdown(nowRef.current, tide.nextLow.time)}</span>
                </p>
              )}
              {tide.nextHigh && (
                <p className="text-[11px] text-gray-600">
                  Next <span className="font-bold text-blue-700">high</span> in{' '}
                  <span className="font-semibold">{tideCountdown(nowRef.current, tide.nextHigh.time)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Today's tide schedule */}
          <div className="rounded-xl bg-white/80 border border-blue-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Today's Tides</p>
            {tide.todayEvents.length === 0
              ? <p className="text-xs text-gray-400 italic">No events detected.</p>
              : (
                <div className="space-y-1">
                  {tide.todayEvents.slice(0, 4).map((ev, i) => (
                    <div key={i} className="flex items-center justify-between gap-1">
                      <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                        ev.type === 'high' ? 'text-blue-700' : 'text-red-600'
                      }`}>
                        {ev.type === 'high'
                          ? <ArrowUp className="w-3 h-3" />
                          : <ArrowDown className="w-3 h-3" />}
                        {ev.type === 'high' ? 'High' : 'Low'}
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
      )}

      <p className="mt-2 text-[10px] text-gray-400">
        Tide data by Open-Meteo Marine API. Estimates only — not for navigation.
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
