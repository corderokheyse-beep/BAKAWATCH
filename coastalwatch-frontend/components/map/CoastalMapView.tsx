'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Report, RestorationSite } from '@/lib/types'
import { CATEGORY_ICONS } from '@/lib/utils'
import { simpleZoneFor } from '@/lib/mangrove-zonation'

// ── The 8 coastal barangays of Gloria, Oriental Mindoro ───────────────────────
// The coastal barangays that host the 8 Gloria restoration sites. Coordinates
// mirror the sites' own locations so the barangay label sits on its site.
// (Previously this held fictional barangays with decorative emoji that did not
// correspond to any real site — those have been removed.)
export const COASTAL_BARANGAYS: {
  name: string
  coords: [number, number]
  isHighlighted?: boolean
}[] = [
  // Coordinates corrected against the confirmed Agsalin location (Bing/TomTom
  // ~12.8838,121.4728) and the real coastal barangay order. Pins sit on the
  // shoreline just east of each barangay centre.
  { name: 'Agsalin',      coords: [12.880514, 121.476902], isHighlighted: true },
  { name: 'Maragooc',     coords: [12.895, 121.4775] },
  { name: 'Guimbonan',    coords: [12.912, 121.4780] },
  { name: 'Sta. Theresa', coords: [12.929, 121.4785] },
  { name: 'Balete',       coords: [12.943, 121.4782] },
  { name: 'San Antonio',  coords: [12.957, 121.4788] },
  { name: 'Kawit',        coords: [12.971, 121.4790] },
  { name: 'Tambong',      coords: [12.988, 121.4795] },
]

// Tight bounds covering only the coastal strip of Gloria
const GLORIA_COASTAL_BOUNDS: [[number, number], [number, number]] = [
  [12.8600, 121.4500],
  [13.0000, 121.5100],
]
const GLORIA_COASTAL_CENTER: [number, number] = [12.9330, 121.4800]

// ── Status / category config ──────────────────────────────────────────────────
const SITE_STATUS_CONFIG: Record<string, {
  color: string; fill: string; label: string; icon: string; bg: string; text: string
}> = {
  active:      { color: '#15803d', fill: '#22c55e', label: 'Active',      icon: '🌿', bg: '#f0fdf4', text: '#15803d' },
  in_progress: { color: '#b45309', fill: '#f59e0b', label: 'In Progress', icon: '⏳', bg: '#fffbeb', text: '#b45309' },
  inactive:    { color: '#4b5563', fill: '#9ca3af', label: 'Inactive',    icon: '⛔', bg: '#f9fafb', text: '#4b5563' },
}

// Zonation colour palette (seaward → landward) for the Mangrove Zones overlay,
// matching the simplified 7-zone vocabulary used by the Inventory form.
export const ZONE_COLORS: Record<string, { color: string; fill: string }> = {
  'Seaward':                 { color: '#0e7490', fill: '#06b6d4' },
  'Seaward to Middle Zone':  { color: '#0d9488', fill: '#14b8a6' },
  'Middle Intertidal Zone':  { color: '#15803d', fill: '#22c55e' },
  'Middle to Landward Zone': { color: '#4d7c0f', fill: '#84cc16' },
  'Riverine':                { color: '#1d4ed8', fill: '#3b82f6' },
  'Brackish Estuary':        { color: '#7c3aed', fill: '#a78bfa' },
  'Landward':                { color: '#92400e', fill: '#b45309' },
}
// Generic mangrove green when a site's zone can't be determined from its species.
const MANGROVE_GREEN = { color: '#166534', fill: '#16a34a' }

/** Resolve a site's dominant simplified zone from its recorded species. */
export function siteDominantZone(site: RestorationSite): string | null {
  const list = (site.site_species ?? (site as any).species_list ?? []) as Array<{ scientific_name?: string }>
  const counts: Record<string, number> = {}
  for (const sp of list) {
    const z = simpleZoneFor(sp.scientific_name)
    if (z) counts[z] = (counts[z] ?? 0) + 1
  }
  let best: string | null = null, bestN = 0
  for (const [z, n] of Object.entries(counts)) if (n > bestN) { best = z; bestN = n }
  return best
}

const REPORT_STATUS_COLOR: Record<string, string> = {
  approved: '#16a34a',
  pending:  '#d97706',
  rejected: '#dc2626',
}

const REPORT_STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  pending:  'Pending',
  rejected: 'Rejected',
}

// Severity drives the affected-area circle: colour + default radius (metres).
const SEVERITY_CONFIG: Record<string, { color: string; radius: number; label: string }> = {
  low:      { color: '#eab308', radius: 25,  label: 'Low' },
  medium:   { color: '#f97316', radius: 60,  label: 'Medium' },
  high:     { color: '#ef4444', radius: 120, label: 'High' },
  critical: { color: '#b91c1c', radius: 200, label: 'Critical' },
}

/** Resolve the affected-area radius (metres) for a report. */
export function reportAffectedRadius(report: Report): number {
  if (report.affected_radius_m != null && report.affected_radius_m > 0) return report.affected_radius_m
  const sev = report.severity ?? 'medium'
  return SEVERITY_CONFIG[sev]?.radius ?? SEVERITY_CONFIG.medium.radius
}

export function reportSeverityColor(report: Report): string {
  const sev = report.severity ?? 'medium'
  return SEVERITY_CONFIG[sev]?.color ?? SEVERITY_CONFIG.medium.color
}

// ── Pin builders ──────────────────────────────────────────────────────────────
function buildSitePin(cfg: typeof SITE_STATUS_CONFIG[string], label: string, isSelected: boolean): string {
  const size = isSelected ? 48 : 40
  const pulse = isSelected
    ? `<circle cx="${(size+10)/2}" cy="${(size+10)/2}" r="${size/2+6}" fill="${cfg.fill}" opacity="0.18"/>`
    : ''
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;
      filter:drop-shadow(0 4px 10px rgba(0,0,0,0.28))">
      <svg width="${size+10}" height="${size+10}" viewBox="0 0 ${size+10} ${size+10}" xmlns="http://www.w3.org/2000/svg">
        ${pulse}
        <circle cx="${(size+10)/2}" cy="${(size+10)/2-2}" r="${size/2}"
          fill="${cfg.fill}" stroke="white" stroke-width="3"/>
        <text x="${(size+10)/2}" y="${(size+10)/2+7}"
          text-anchor="middle" font-size="${isSelected?22:17}" font-family="system-ui">${cfg.icon}</text>
        <polygon
          points="${(size+10)/2-5},${(size+10)/2+size/2-2} ${(size+10)/2+5},${(size+10)/2+size/2-2} ${(size+10)/2},${(size+10)/2+size/2+8}"
          fill="${cfg.fill}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      <div style="background:white;color:${cfg.text};font-size:10px;font-weight:700;
        font-family:Inter,system-ui,sans-serif;padding:2px 8px;border-radius:20px;
        border:1.5px solid ${cfg.color};white-space:nowrap;margin-top:-2px;
        box-shadow:0 2px 6px rgba(0,0,0,0.15);max-width:130px;overflow:hidden;
        text-overflow:ellipsis;">${label}</div>
    </div>`
}

function buildReportPin(report: Report): string {
  const bg    = REPORT_STATUS_COLOR[report.status] ?? '#6b7280'
  const emoji = CATEGORY_ICONS[report.category] ?? '📍'
  const pulse = report.status === 'pending'
    ? `<circle cx="18" cy="18" r="20" fill="${bg}" opacity="0.15"/>`
    : ''
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;
      filter:drop-shadow(0 3px 8px rgba(0,0,0,0.25))">
      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        ${pulse}
        <circle cx="20" cy="18" r="16" fill="${bg}" stroke="white" stroke-width="2.5"/>
        <text x="20" y="24" text-anchor="middle" font-size="14" font-family="system-ui">${emoji}</text>
        <polygon points="15,32 25,32 20,40" fill="${bg}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </div>`
}

function buildBarangayPin(name: string, isHighlighted = false): string {
  const borderColor = isHighlighted ? '#15803d' : '#0f766e'
  const bgColor     = isHighlighted ? 'rgba(21,128,61,0.92)' : 'rgba(15,118,110,0.9)'
  const dot         = isHighlighted ? '12px' : '10px'
  // A small neutral location dot — no decorative emoji.
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;
      filter:drop-shadow(0 2px 6px rgba(0,0,0,0.2))">
      <div style="background:${borderColor};border:2px solid white;border-radius:50%;
        width:${dot};height:${dot};box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>
      <div style="background:${bgColor};color:white;font-size:${isHighlighted ? '10px' : '9px'};font-weight:700;
        font-family:Inter,system-ui,sans-serif;padding:${isHighlighted ? '2px 8px' : '1px 6px'};border-radius:10px;
        white-space:nowrap;margin-top:3px;max-width:${isHighlighted ? '110px' : '90px'};overflow:hidden;text-overflow:ellipsis;">
        Brgy. ${name}</div>
    </div>`
}

// ── Component ─────────────────────────────────────────────────────────────────
interface CoastalMapViewProps {
  reports: Report[]
  sites: RestorationSite[]
  height?: string
  showBarangays?: boolean
  showSites?: boolean
  /** When true, site areas are coloured by mangrove zonation instead of status. */
  showMangroveZones?: boolean
  onReportClick?: (r: Report) => void
  onSiteClick?: (s: RestorationSite) => void
  selectedReportId?: number | null
  selectedSiteId?: number | null
  lastUpdated?: Date | null
  /** If provided, pans and zooms to this coordinate once after first render. */
  focusLatLng?: [number, number] | null
}

export default function CoastalMapView({
  reports,
  sites,
  height = '100%',
  showBarangays = true,
  showSites = true,
  showMangroveZones = false,
  onReportClick,
  onSiteClick,
  selectedReportId,
  selectedSiteId,
  lastUpdated,
  focusLatLng,
}: CoastalMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const initRef      = useRef(false)
  const markersRef   = useRef<any[]>([])
  const layersRef    = useRef<any[]>([])
  const focusedRef   = useRef(false) // ensures focus happens only once per mount

  // ── Initial map setup (runs once) ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (initRef.current) return
    initRef.current = true

    // If the component unmounts before the dynamic Leaflet import resolves, we
    // must not create a map on a detached container (leads to the Leaflet
    // "_leaflet_pos" crash when later callbacks touch a dead map).
    let destroyed = false

    import('leaflet').then((L) => {
      if (destroyed) return
      if (!containerRef.current) return
      if ((containerRef.current as any)._leaflet_id != null) {
        try { mapRef.current?.remove() } catch { /* already gone */ }
        mapRef.current = null
      }

      const map = L.map(containerRef.current, {
        // Canvas renderer: vector overlays (the affected-area circles) are drawn
        // into a <canvas>, which html2canvas captures pixel-accurately. With the
        // SVG renderer, Leaflet's transform on the overlay pane caused the circles
        // to shift relative to the markers in the exported PDF snapshot.
        preferCanvas: true,
        zoomControl: false,
        minZoom: 12,
        maxZoom: 19,
        // Constrain to Gloria coastal strip only
        maxBounds: GLORIA_COASTAL_BOUNDS,
        maxBoundsViscosity: 1.0,
      }).setView(GLORIA_COASTAL_CENTER, 13)

      mapRef.current = map

      // ── Base layers ──────────────────────────────────────────────────────
      // Satellite (Esri World Imagery) gives the Google-Earth-style aerial look
      // MENRO wants, free and keyless. A street basemap (OSM) is offered as an
      // alternative via the layer toggle. crossOrigin lets html2canvas capture
      // the basemap for the PDF export (both providers send CORS headers).
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Imagery © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
          maxZoom: 19,
          crossOrigin: true,
        },
      )
      const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        maxZoom: 19,
        crossOrigin: true,
      })

      // Dedicated pane for the labels overlay so place names sit above the
      // satellite tiles but below site boundaries and markers.
      map.createPane('labels')
      const labelsPane = map.getPane('labels')
      if (labelsPane) {
        labelsPane.style.zIndex = '350'
        labelsPane.style.pointerEvents = 'none'
      }

      // Place-name + road labels overlay, shown on top of satellite so barangays
      // and roads stay readable. Esri's own reference layer — keyless, CORS-enabled,
      // and watermark-free (matches the Esri World Imagery basemap).
      const labels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Labels © <a href="https://www.esri.com" target="_blank">Esri</a>',
          maxZoom: 19,
          crossOrigin: true,
          pane: 'labels',
        },
      )

      satellite.addTo(map)
      labels.addTo(map)

      // Layer switcher — Satellite (default) vs Street. Labels follow satellite.
      const baseLayers = { 'Satellite': satellite, 'Street': street }
      L.control.layers(baseLayers, {}, { position: 'topright', collapsed: true }).addTo(map)
      map.on('baselayerchange', (e: any) => {
        if (e.name === 'Satellite') { if (!map.hasLayer(labels)) labels.addTo(map) }
        else { if (map.hasLayer(labels)) map.removeLayer(labels) }
      })

      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)
    })

    return () => {
      destroyed = true
      try { mapRef.current?.remove() } catch { /* already removed */ }
      mapRef.current = null
      initRef.current = false
    }
  }, []) // eslint-disable-line

  // ── Re-render markers whenever data changes ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    import('leaflet').then((L) => {
      // The map may have been removed while this async import resolved.
      if (mapRef.current !== map) return
      // Clear old markers / layers
      markersRef.current.forEach(m => m.remove())
      layersRef.current.forEach(l => l.remove())
      markersRef.current = []
      layersRef.current  = []

      // ── Coastal barangay indicators (only the 8 host barangays) ──────────
      if (showBarangays) {
        COASTAL_BARANGAYS.forEach(brgy => {
          const icon = L.divIcon({
            className: '',
            html: buildBarangayPin(brgy.name, brgy.isHighlighted),
            iconSize:   [brgy.isHighlighted ? 110 : 90, 34],
            iconAnchor: [brgy.isHighlighted ? 55 : 45, 17],
          })
          const m = L.marker(brgy.coords, { icon, zIndexOffset: -100, opacity: 0.9 }).addTo(map)
          m.bindTooltip(`<b>Brgy. ${brgy.name}</b>`, {
            direction: 'top', offset: [0, -14], className: 'coastal-tooltip',
          })
          markersRef.current.push(m)
        })
      }

      // ── Restoration site polygons + pins ─────────────────────────────────
      if (showSites) {
        sites.forEach(site => {
          const cfg        = SITE_STATUS_CONFIG[site.status] ?? SITE_STATUS_CONFIG.active
          const isSelected = site.id === selectedSiteId

          // Render EVERY drawn area for the site (green mangrove + red planted).
          // Falls back to the legacy single boundary for pre-migration data.
          const areaList: { type: 'mangrove' | 'planted'; geojson: any }[] =
            (site.areas && site.areas.length)
              ? site.areas.map(a => ({ type: a.type, geojson: a.geojson }))
              : (site.boundary_geojson
                  ? [{ type: (site.boundary_type ?? 'mangrove') as 'mangrove' | 'planted', geojson: site.boundary_geojson }]
                  : [])

          areaList.forEach(area => {
            let geojson = area.geojson
            if (typeof geojson === 'string') {
              try { geojson = JSON.parse(geojson) } catch { return }
            }
            if (!geojson || typeof geojson !== 'object') return

            const isPlanted = area.type === 'planted'
            // Planted areas are always RED. Mangrove areas are green, or — when
            // the Mangrove Zones overlay is on — coloured by dominant zonation.
            let paint: { color: string; fill: string }
            if (isPlanted) {
              paint = { color: '#b91c1c', fill: '#ef4444' }
            } else if (showMangroveZones) {
              const zone = siteDominantZone(site)
              paint = zone ? ZONE_COLORS[zone] : MANGROVE_GREEN
            } else {
              paint = { color: cfg.color, fill: cfg.fill }
            }
            const baseFill = isSelected ? 0.5 : (showMangroveZones || isPlanted ? 0.38 : 0.24)
            const layer = L.geoJSON(geojson as any, {
              style: {
                color: paint.color, weight: isSelected ? 3.5 : 2.5, opacity: 1,
                fillColor: paint.fill, fillOpacity: baseFill,
                dashArray: (!isPlanted && !showMangroveZones && site.status === 'in_progress') ? '8 5' : undefined,
              },
            }).addTo(map)
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: baseFill + 0.18, weight: 3.5 }))
            layer.on('mouseout',  () => layer.setStyle({ fillOpacity: baseFill, weight: isSelected ? 3.5 : 2.5 }))
            layer.on('click', () => onSiteClick?.(site))
            layersRef.current.push(layer)
          })

          const lat = (site as any).latitude  ?? (site as any).lat
          const lng = (site as any).longitude ?? (site as any).lng
          if (!lat || !lng) return

          const label   = site.barangay ?? site.name.split(' ').slice(0, 2).join(' ')
          const pinIcon = L.divIcon({
            className:  '',
            html:       buildSitePin(cfg, label, isSelected),
            iconSize:   [isSelected ? 58 : 50, isSelected ? 78 : 68],
            iconAnchor: [isSelected ? 29 : 25, isSelected ? 74 : 64],
          })
          const m = L.marker([lat, lng], { icon: pinIcon, zIndexOffset: isSelected ? 1000 : 200 }).addTo(map)
          m.on('click', () => onSiteClick?.(site))
          markersRef.current.push(m)
        })
      }

      // ── Report markers + affected-area circles ───────────────────────────
      reports.forEach(report => {
        if (report.latitude == null || report.longitude == null) return
        const isSelected = report.id === selectedReportId

        // Affected-area impact circle (sized by severity / explicit radius),
        // drawn beneath the pin. Highlighted when the report is selected.
        const sevColor = reportSeverityColor(report)
        const radius   = reportAffectedRadius(report)
        const circle = L.circle([report.latitude, report.longitude], {
          radius,
          color: sevColor,
          weight: isSelected ? 2.5 : 1.5,
          opacity: isSelected ? 0.95 : 0.6,
          fillColor: sevColor,
          fillOpacity: isSelected ? 0.28 : 0.14,
          dashArray: report.status === 'pending' ? '6 4' : undefined,
          interactive: true,
        }).addTo(map)
        circle.on('click', () => onReportClick?.(report))
        layersRef.current.push(circle)

        const pinIcon = L.divIcon({
          className:  '',
          html:       buildReportPin(report),
          iconSize:   [40, 40],
          iconAnchor: [20, 40],
        })
        const m = L.marker([report.latitude, report.longitude], {
          icon: pinIcon,
          zIndexOffset: isSelected ? 900 : 100,
        }).addTo(map)
        m.on('click', () => onReportClick?.(report))
        markersRef.current.push(m)
      })
    })
  }, [reports, sites, showBarangays, showSites, showMangroveZones, selectedReportId, selectedSiteId]) // eslint-disable-line

  // ── Focus on a specific lat/lng once (e.g. navigated from dashboard) ────────
  useEffect(() => {
    if (!focusLatLng || focusedRef.current) return
    const map = mapRef.current
    if (!map) return

    // Defer to the next frame so the map's panes are positioned, and skip the
    // animation: an animated setView on a freshly-created / not-yet-sized map
    // (or one that unmounts mid-animation) throws Leaflet's "_leaflet_pos".
    let cancelled = false
    const id = requestAnimationFrame(() => {
      if (cancelled || mapRef.current !== map) return
      const container = map.getContainer?.()
      if (!container || !container.isConnected) return
      try {
        map.invalidateSize()
        map.setView(focusLatLng, 16, { animate: false })
        focusedRef.current = true
      } catch { /* map torn down mid-call */ }
    })
    return () => { cancelled = true; cancelAnimationFrame(id) }
  }, [focusLatLng, reports]) // re-check after reports load in case map wasn't ready yet // eslint-disable-line

  return (
    <>
      <style>{`
        .leaflet-control-zoom a {
          border-radius: 8px !important; border: none !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
          color: #374151 !important; font-size: 16px !important;
          width: 32px !important; height: 32px !important; line-height: 32px !important;
        }
        .leaflet-control-zoom {
          border: none !important; display: flex !important;
          flex-direction: column !important; gap: 4px !important;
        }
        .leaflet-control-scale-line {
          border: 2px solid #374151 !important; border-top: none !important;
          color: #374151 !important; font-size: 10px !important;
          background: rgba(255,255,255,0.9) !important; padding: 2px 6px !important;
          border-radius: 0 0 4px 4px !important;
        }
        .coastal-tooltip {
          background: white !important; border: 1px solid #e5e7eb !important;
          border-radius: 10px !important; padding: 6px 10px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
          font-family: Inter, system-ui, sans-serif !important;
          font-size: 12px !important; color: #111827 !important;
        }
        .coastal-tooltip::before { display: none !important; }
        .leaflet-popup-content-wrapper {
          border-radius: 14px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
          border: 1px solid #e5e7eb !important;
        }
        .leaflet-popup-tip { display: none !important; }
      `}</style>
      {/* id is used by the MENRO "Download map data" PDF export to capture the
          live map (basemap + overlays + markers) via html2canvas. */}
      <div id="menro-map-capture" ref={containerRef} style={{ height, width: '100%' }} />
    </>
  )
}
