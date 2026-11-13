import { NextResponse } from 'next/server'

// Server-side proxy for Open-Meteo Marine API — sea level heights for
// Gloria, Oriental Mindoro (lat 12.9833, lon 121.4667).
// Fetching server-side avoids ERR_TIMED_OUT that occurs when the browser
// tries to reach marine-api.open-meteo.com directly in production.

export async function GET() {
  const params = new URLSearchParams({
    latitude:      '12.9833',
    longitude:     '121.4667',
    hourly:        'sea_level_height',
    forecast_days: '2',
    timezone:      'Asia/Manila',
  })

  try {
    const res = await fetch(
      `https://marine-api.open-meteo.com/v1/marine?${params}`,
      { next: { revalidate: 1800 } }, // cache 30 minutes server-side
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `Marine API returned HTTP ${res.status}` },
        { status: 502 },
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
