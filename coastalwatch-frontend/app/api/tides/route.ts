import { NextResponse } from 'next/server'

// Server-side proxy for Open-Meteo Marine API — wave height for
// Gloria, Oriental Mindoro (lat 12.9833, lon 121.4667).
// NOTE: Open-Meteo Marine does NOT provide sea_level_height or harmonic tide
// predictions. We fetch wave_height + ocean_current_velocity instead, which
// are the actual available parameters. The tide card uses these to show
// current sea conditions rather than harmonic high/low tide predictions.

export async function GET() {
  const params = new URLSearchParams({
    latitude:      '12.9833',
    longitude:     '121.4667',
    hourly:        'wave_height,ocean_current_velocity,wave_direction',
    forecast_days: '2',
    timezone:      'Asia/Manila',
  })

  try {
    const res = await fetch(
      `https://marine-api.open-meteo.com/v1/marine?${params}`,
      { next: { revalidate: 1800 } },
    )

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json(
        { error: `Marine API returned HTTP ${res.status}: ${body}` },
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
