import { NextResponse } from 'next/server'

// Server-side proxy for Open-Meteo weather API.
// The browser fetch was timing out in production because api.open-meteo.com
// was unreachable from the client network on Vercel. Proxying through a Next.js
// API route makes the request server-to-server, which always works.
export async function GET() {
  const params = new URLSearchParams({
    latitude:      '12.983294',
    longitude:     '121.4666648',
    current:       [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    hourly:        [
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
    ].join(','),
    daily:         [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
    ].join(','),
    forecast_days: '5',
    timezone:      'Asia/Manila',
  })

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      {
        // Cache on the server for 15 minutes to reduce upstream calls
        next: { revalidate: 900 },
      },
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `Open-Meteo returned HTTP ${res.status}` },
        { status: 502 },
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        // Allow the browser to cache the proxied response for 10 minutes
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=300',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
