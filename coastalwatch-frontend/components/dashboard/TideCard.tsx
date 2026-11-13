'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Waves, ArrowUp, ArrowDown, RefreshCw, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// ── Types ─────────────────────────────────────────────────────────────────────
interface TideEvent {
  time: string        // ISO string
  height: number      // metres
  type: 'high' | 'low'
}

interface TideState {
  currentHeight: number
  trend: 'rising' | 'falling' | 'steady'
  nextHigh: TideEvent | null
  nextLow:  TideEvent | null
  todayEvents: TideEvent[]
  hours: string[]       // labels for chart
  heights: number[]     // heights for chart
  currentIndex: number  // pointer into hours/heights for the "now" line
  fetchedAt: Date
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format an ISO time string to a readable time like "2:28 PM" */
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
  }).format(new Date(iso))
}

/** Human-friendly countdown: "2 hr 42 min" */
function countdown(from: Date, to: Date): string {
  const diffMs  = to.getTime() - from.getTime()
  if (diffMs <= 0) return 'now'
  const totalMin = Math.round(diffMs / 60_000)
  const hrs  = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hrs === 0) return `${mins} min`
  if (mins === 0) return `${hrs} hr`
  return `${hrs} hr ${mins} min`
}

/**
 * Detect tide extremes (peaks and troughs) from an array of hourly heights.
 * A simple 3-point comparison: point i is an extreme if it is strictly
 * greater (high) or strictly less (low) than both its neighbours.
 */
function detectExtremes(times: string[], heights: number[]): TideEvent[] {
  const events: TideEvent[] = []
  for (let i = 1; i < heights.length - 1; i++) {
    const prev = heights[i - 1]
    const cur  = heights[i]
    const next = heights[i + 1]
    if (cur > prev && cur > next) {
      events.push({ time: times[i], height: cur, type: 'high' })
    } else if (cur < prev && cur < next) {
      events.push({ time: times[i], height: cur, type: 'low' })
    }
  }
  return events
}

/** Build the full TideState from raw Open-Meteo marine response */
function parseTideData(raw: {
  hourly: { time: string[]; sea_level_height: number[] }
}): TideState {
  const { time, sea_level_height } = raw.hourly

  if (!time?.length || !sea_level_height?.length) {
    throw new Error('Incomplete tide data received.')
  }

  const now = new Date()
  // Clamp to Asia/Manila "now" hour
  const nowPhStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(now).replace(' ', 'T').slice(0, 13) // "YYYY-MM-DDTHH"

  // Find index closest to current hour
  let currentIndex = 0
  for (let i = 0; i < time.length; i++) {
    if (time[i].startsWith(nowPhStr)) { currentIndex = i; break }
  }

  // Show 24 hours of data centred around now (from 0 to 24)
  const start = Math.max(0, currentIndex - 2)
  const end   = Math.min(time.length - 1, start + 23)
  const slicedTimes   = time.slice(start, end + 1)
  const slicedHeights = sea_level_height.slice(start, end + 1)

  const currentHeight = sea_level_height[currentIndex] ?? 0
  const prevHeight    = sea_level_height[Math.max(0, currentIndex - 1)] ?? currentHeight
  const trend: TideState['trend'] =
    currentHeight > prevHeight + 0.02 ? 'rising'
    : currentHeight < prevHeight - 0.02 ? 'falling'
    : 'steady'

  // Detect all extremes in the full 48-hour dataset
  const allEvents = detectExtremes(time, sea_level_height)

  // Today's events: those whose time falls within today (Manila date)
  const todayDateStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now) // "YYYY-MM-DD"

  const todayEvents = allEvents.filter(e => e.time.startsWith(todayDateStr))

  // Next high and low from now
  const nowMs = now.getTime()
  const futureEvents = allEvents.filter(e => new Date(e.time + ':00+08:00').getTime() > nowMs)
  const nextHigh = futureEvents.find(e => e.type === 'high') ?? null
  const nextLow  = futureEvents.find(e => e.type === 'low')  ?? null

  // Chart labels — just show the hour
  const hours = slicedTimes.map(t => {
    const h = parseInt(t.slice(11, 13), 10)
    return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`
  })

  return {
    currentHeight,
    trend,
    nextHigh,
    nextLow,
    todayEvents,
    hours,
    heights: slicedHeights,
    currentIndex: currentIndex - start,
    fetchedAt: now,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TideCard() {
  const [tide, setTide]           = useState<TideState | null>(null)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded]   = useState(false)
  const nowRef = useRef(new Date())

  const loadTides = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError('')
    nowRef.current = new Date()

    try {
      const res = await fetch('/api/tides', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const raw = await res.json()
      setTide(parseTideData(raw))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Tide data unavailable (${msg}). Click Refresh to try again.`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadTides()
    const timer = setInterval(() => void loadTides(true), 30 * 60 * 1000)
    return () => clearInterval(timer)
  }, [loadTides])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className="card !p-4 sm:!p-5 overflow-hidden border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50">

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Waves className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Tide Monitor</h2>
            <p className="text-xs text-gray-500">Gloria, Oriental Mindoro</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tide && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-800 transition hover:bg-blue-100"
            >
              {expanded ? 'Less' : 'View chart'}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadTides(true)}
            disabled={loading || refreshing}
            aria-label="Refresh tide data"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-2.5 text-xs font-semibold text-blue-800 transition hover:bg-blue-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-3 h-20 animate-pulse rounded-xl bg-blue-100/70" />
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && tide && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">

            {/* ── Left: current status ── */}
            <div className="rounded-xl bg-white/80 px-4 py-3 border border-blue-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Current Tide</p>
              <div className="flex items-end gap-3">
                <p className="text-3xl font-extrabold text-blue-900 leading-none">
                  {tide.currentHeight.toFixed(2)}
                  <span className="text-base font-semibold text-blue-500 ml-1">m</span>
                </p>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mb-0.5 ${
                  tide.trend === 'rising'
                    ? 'bg-blue-100 text-blue-700'
                    : tide.trend === 'falling'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-gray-100 text-gray-600'
                }`}>
                  {tide.trend === 'rising'
                    ? <><ArrowUp className="w-3 h-3" /> Rising</>
                    : tide.trend === 'falling'
                      ? <><ArrowDown className="w-3 h-3" /> Falling</>
                      : 'Steady'}
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                {tide.nextLow && (
                  <p className="text-xs text-gray-600">
                    Next <span className="font-bold text-red-600">low tide</span> in{' '}
                    <span className="font-bold">
                      {countdown(nowRef.current, new Date(tide.nextLow.time + ':00+08:00'))}
                    </span>
                  </p>
                )}
                {tide.nextHigh && (
                  <p className="text-xs text-gray-600">
                    Next <span className="font-bold text-blue-700">high tide</span> in{' '}
                    <span className="font-bold">
                      {countdown(nowRef.current, new Date(tide.nextHigh.time + ':00+08:00'))}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* ── Right: today's tide schedule ── */}
            <div className="rounded-xl bg-white/80 px-4 py-3 border border-blue-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Today's Tides
              </p>
              {tide.todayEvents.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No tide events detected for today.</p>
              ) : (
                <div className="space-y-1.5">
                  {tide.todayEvents.map((ev, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`flex items-center justify-center w-5 h-5 rounded-full ${
                          ev.type === 'high' ? 'bg-blue-100' : 'bg-red-100'
                        }`}>
                          {ev.type === 'high'
                            ? <ArrowUp className="w-3 h-3 text-blue-600" />
                            : <ArrowDown className="w-3 h-3 text-red-500" />}
                        </span>
                        <span className={`text-xs font-semibold ${
                          ev.type === 'high' ? 'text-blue-700' : 'text-red-600'
                        }`}>
                          {ev.type === 'high' ? 'High tide' : 'Low tide'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 font-medium tabular-nums">
                        {fmtTime(ev.time + ':00+08:00')}
                      </span>
                      <span className="text-xs font-bold text-gray-800 tabular-nums w-14 text-right">
                        {ev.height.toFixed(2)} m
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Expandable 24-hour tide curve ── */}
          {expanded && (
            <div className="mt-3 rounded-xl bg-white/80 border border-blue-100 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                24-Hour Tide Curve
              </p>
              <div className="h-36">
                <Line
                  data={{
                    labels: tide.hours,
                    datasets: [
                      {
                        data: tide.heights,
                        fill: true,
                        tension: 0.4,
                        borderColor: '#3b82f6',
                        borderWidth: 2,
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        pointRadius: tide.heights.map((_, i) =>
                          i === tide.currentIndex ? 5 : 0
                        ),
                        pointBackgroundColor: tide.heights.map((_, i) =>
                          i === tide.currentIndex ? '#ef4444' : '#3b82f6'
                        ),
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: ctx => ` ${(ctx.parsed.y as number).toFixed(2)} m`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                        grid: { display: false },
                      },
                      y: {
                        ticks: { font: { size: 9 }, callback: v => `${v} m` },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                      },
                    },
                  }}
                />
              </div>
              <p className="mt-2 text-[10px] text-gray-400">
                Red dot = current time. Heights are sea level predictions from Open-Meteo Marine API (±30 min accuracy).
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 pt-2 text-[10px] text-gray-400">
            <p>Tide data by Open-Meteo Marine API. Estimates only — not for navigation.</p>
            <span>
              Updated {new Intl.DateTimeFormat('en-PH', {
                timeZone: 'Asia/Manila',
                hour: 'numeric',
                minute: '2-digit',
              }).format(tide.fetchedAt)}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
