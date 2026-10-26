'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Info,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react'

const WEATHER_LATITUDE = 12.983294
const WEATHER_LONGITUDE = 121.4666648

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

  const loadForecast = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast')
      url.search = new URLSearchParams({
        latitude: String(WEATHER_LATITUDE),
        longitude: String(WEATHER_LONGITUDE),
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'apparent_temperature',
          'is_day',
          'precipitation',
          'weather_code',
          'wind_speed_10m',
          'wind_direction_10m',
        ].join(','),
        hourly: [
          'temperature_2m',
          'precipitation_probability',
          'precipitation',
          'weather_code',
        ].join(','),
        daily: [
          'weather_code',
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_probability_max',
        ].join(','),
        forecast_days: '5',
        timezone: 'Asia/Manila',
      }).toString()

      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Open-Meteo returned HTTP ${response.status}.`)
      }

      const data = await response.json() as OpenMeteoResponse
      setForecast(normalizeForecast(data))
    } catch {
      setError('Weather forecast is temporarily unavailable.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadForecast()
    const timer = window.setInterval(() => void loadForecast(true), 30 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [loadForecast])

  return (
    <section className="card overflow-hidden border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <CloudSun className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Weather Forecast</h2>
            <p className="text-xs text-gray-500">{forecast?.location ?? 'Gloria, Oriental Mindoro'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadForecast(true)}
          disabled={loading || refreshing}
          aria-label="Refresh weather forecast"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-100 bg-white px-3 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-5 h-36 animate-pulse rounded-xl bg-sky-100/70" aria-label="Loading weather forecast" />
      ) : error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : forecast && (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-xl bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current conditions</p>
              <div className="mt-3 flex items-center gap-4">
                <WeatherIcon code={forecast.current.weather_code} isDay={forecast.current.is_day === 1} className="h-12 w-12 text-sky-600" />
                <div>
                  <p className="text-4xl font-bold leading-none text-sky-950">
                    {Math.round(forecast.current.temperature_2m)}°
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {weatherDescription(forecast.current.weather_code)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-sky-100 pt-3 text-xs text-gray-600">
                <p className="flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5 text-orange-500" />Feels {Math.round(forecast.current.apparent_temperature)}°C</p>
                <p className="flex items-center gap-1.5"><Droplets className="h-3.5 w-3.5 text-sky-500" />Humidity {forecast.current.relative_humidity_2m}%</p>
                <p className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-teal-600" />Wind {Math.round(forecast.current.wind_speed_10m)} km/h</p>
                <p className="flex items-center gap-1.5"><CloudRain className="h-3.5 w-3.5 text-blue-500" />Rain {forecast.current.precipitation} mm</p>
              </div>
            </div>

            <div className="rounded-xl bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next hours</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {forecast.hourly.map(hour => (
                  <div key={hour.time} className="rounded-lg bg-sky-50/80 px-2 py-3 text-center">
                    <p className="text-[11px] font-medium text-gray-500">
                      {formatForecastTime(hour.time, forecast.timezone, { hour: 'numeric' })}
                    </p>
                    <WeatherIcon code={hour.weather_code} className="mx-auto my-2 h-5 w-5 text-sky-600" />
                    <p className="text-sm font-bold text-gray-800">
                      {hour.temperature == null ? '—' : `${Math.round(hour.temperature)}°`}
                    </p>
                    <p className="mt-1 text-[10px] text-blue-700">
                      {hour.precipitation_probability == null ? '—' : `${hour.precipitation_probability}% rain`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">5-day outlook</p>
            <div className="mt-2 divide-y divide-sky-50">
              {forecast.daily.map((day, index) => (
                <div key={day.date} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2 text-sm">
                  <span className="font-medium text-gray-700">
                    {index === 0 ? 'Today' : formatForecastTime(day.date, forecast.timezone, { weekday: 'short' })}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-gray-500">
                    <WeatherIcon code={day.weather_code} className="h-4 w-4 text-sky-600" />
                    <span className="hidden sm:inline">{weatherDescription(day.weather_code ?? -1)}</span>
                  </span>
                  <span className="text-right font-semibold text-gray-800">
                    {day.temperature_max == null ? '—' : `${Math.round(day.temperature_max)}°`}
                    <span className="ml-1 font-normal text-gray-400">
                      {day.temperature_min == null ? '' : `${Math.round(day.temperature_min)}°`}
                    </span>
                  </span>
                  <span className="w-12 text-right text-xs text-blue-700">
                    {day.precipitation_probability_max == null ? '—' : `${day.precipitation_probability_max}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-sky-100 pt-3 text-[11px] text-gray-500">
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
    </section>
  )
}
