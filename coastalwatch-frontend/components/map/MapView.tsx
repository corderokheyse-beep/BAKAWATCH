'use client'

import { useEffect, useRef } from 'react'
import type { Report, RestorationProject } from '@/lib/types'
import { CATEGORY_ICONS } from '@/lib/utils'

interface MapViewProps {
  reports?: Report[]
  projects?: RestorationProject[]
  height?: string
  onReportClick?: (report: Report) => void
  onProjectClick?: (project: RestorationProject) => void
  center?: [number, number]
  zoom?: number
  onMapClick?: (lat: number, lng: number) => void
  /** A single, reactive location pin (e.g. for picking a report location). */
  marker?: { lat: number; lng: number } | null
  markerColor?: string
}

export default function MapView({
  reports = [],
  projects = [],
  height = '500px',
  onReportClick,
  onProjectClick,
  center = [12.9620, 121.5050],  // Gloria, Oriental Mindoro coastline
  zoom = 13,
  onMapClick,
  marker = null,
  markerColor = '#dc2626',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const LRef         = useRef<any>(null)
  const pickMarkerRef = useRef<any>(null)  // the reactive location pin
  const initRef      = useRef(false)   // guard against strict-mode double-invoke

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (initRef.current) return        // already initialised in this mount cycle
    initRef.current = true

    let destroyed = false
    import('leaflet').then((L) => {
      if (destroyed || !containerRef.current) return
      LRef.current = L

      // Destroy any leftover instance on the DOM node (e.g. HMR)
      if ((containerRef.current as any)._leaflet_id != null) {
        mapRef.current?.remove()
        mapRef.current = null
      }

      // Fix webpack-mangled default icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current, {
        preferCanvas: true,
        minZoom: 10,
        maxZoom: 19,
        maxBounds: [[12.8800, 121.4200], [13.0400, 121.5800]],
        maxBoundsViscosity: 0.8,
      }).setView(center, zoom)
      mapRef.current = map

      // Satellite basemap (Esri World Imagery) + readable place/road labels.
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Imagery © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
          maxZoom: 19,
          crossOrigin: true,
        },
      ).addTo(map)
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Labels © <a href="https://www.esri.com" target="_blank">Esri</a>',
          maxZoom: 19,
          crossOrigin: true,
        },
      ).addTo(map)

      if (onMapClick) {
        map.on('click', (e: any) => onMapClick(e.latlng.lat, e.latlng.lng))
      }

      // ── Report markers ──────────────────────────────────────────────────
      reports.forEach((report) => {
        if (report.latitude == null || report.longitude == null) return
        const bg = report.status === 'resolved' ? '#22c55e' : report.status === 'pending' ? '#facc15' : '#3b82f6'

        const icon = L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50%;background:${bg};
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);
            display:flex;align-items:center;justify-content:center;font-size:14px;">
            ${CATEGORY_ICONS[report.category] ?? '📍'}</div>`,
          className:   '',
          iconSize:    [32, 32],
          iconAnchor:  [16, 32],
          popupAnchor: [0, -34],
        })

        const marker = L.marker([report.latitude, report.longitude], { icon }).addTo(map)
        marker.bindPopup(`
          <div style="min-width:180px;font-family:sans-serif">
            <p style="font-weight:600;font-size:13px;margin:0 0 4px">${report.title}</p>
            <p style="font-size:11px;color:#6b7280;margin:0 0 6px">${report.category} · ${report.status}</p>
            ${report.image_url
              ? `<img src="${report.image_url}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:4px"/>`
              : ''}
            <p style="font-size:11px;color:#9ca3af;margin:0">${report.location_name ?? ''}</p>
          </div>`)
        if (onReportClick) marker.on('click', () => onReportClick(report))
      })

      // ── Project markers ─────────────────────────────────────────────────
      projects.forEach((project) => {
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;border-radius:50%;background:#2563eb;
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);
            display:flex;align-items:center;justify-content:center;font-size:16px;">🌱</div>`,
          className:   '',
          iconSize:    [36, 36],
          iconAnchor:  [18, 36],
          popupAnchor: [0, -38],
        })

        const marker = L.marker([project.latitude, project.longitude], { icon }).addTo(map)
        marker.bindPopup(`
          <div style="min-width:180px;font-family:sans-serif">
            <p style="font-weight:600;font-size:13px;margin:0 0 4px">${project.name}</p>
            <p style="font-size:11px;color:#6b7280;margin:0 0 6px">${project.status} · ${project.progress_percent}% complete</p>
            <div style="background:#e5e7eb;border-radius:9999px;height:6px;margin-bottom:4px">
              <div style="background:#22c55e;height:6px;border-radius:9999px;width:${project.progress_percent}%"></div>
            </div>
            <p style="font-size:11px;color:#9ca3af;margin:0">${project.trees_planted.toLocaleString()} / ${project.trees_target.toLocaleString()} trees</p>
          </div>`)
        if (onProjectClick) marker.on('click', () => onProjectClick(project))
      })
    }).catch((error) => {
      if (!destroyed) console.error('[MapView] Failed to initialize Leaflet.', error)
    })

    return () => {
      // Cleanup runs before the next effect and on unmount
      destroyed = true
      try { mapRef.current?.remove() } catch { /* map already removed */ }
      mapRef.current = null
      LRef.current = null
      pickMarkerRef.current = null
      initRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactive location pin ──────────────────────────────────────────────────
  // Runs whenever `marker` changes so the pin actually appears/moves on click
  // (the main init effect above runs only once, so it can't do this).
  useEffect(() => {
    let cancelled = false
    // Wait until Leaflet + the map are ready (init effect resolves async).
    const attach = () => {
      const L = LRef.current, map = mapRef.current
      if (!L || !map) { if (!cancelled) requestAnimationFrame(attach); return }

      if (!marker) {
        if (pickMarkerRef.current) { pickMarkerRef.current.remove(); pickMarkerRef.current = null }
        return
      }

      // A clear teardrop pin with a pulsing halo so the picked spot is obvious.
      const html = `
        <div style="position:relative;width:36px;height:46px;">
          <span style="position:absolute;left:50%;top:14px;transform:translateX(-50%);
            width:26px;height:26px;border-radius:50%;background:${markerColor}40;
            animation:bw-pin-pulse 1.6s ease-out infinite;"></span>
          <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg"
            style="position:relative;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.35));">
            <path d="M18 45 C18 45 33 26 33 15 A15 15 0 1 0 3 15 C3 26 18 45 18 45 Z"
              fill="${markerColor}" stroke="#fff" stroke-width="2.5"/>
            <circle cx="18" cy="15" r="5.5" fill="#fff"/>
          </svg>
        </div>`
      const icon = L.divIcon({ html, className: '', iconSize: [36, 46], iconAnchor: [18, 45] })

      if (pickMarkerRef.current) {
        pickMarkerRef.current.setLatLng([marker.lat, marker.lng])
        pickMarkerRef.current.setIcon(icon)
      } else {
        pickMarkerRef.current = L.marker([marker.lat, marker.lng], { icon, zIndexOffset: 1000 }).addTo(map)
      }
      // Center the map on the selected pin. setView is intentional here: a
      // current-location fix should be immediately visible without requiring
      // the user to tap the map afterward.
      try {
        map.invalidateSize({ pan: false })
        map.setView([marker.lat, marker.lng], Math.max(map.getZoom(), 15), { animate: false })
      } catch {}
    }
    attach()
    return () => { cancelled = true }
  }, [marker?.lat, marker?.lng, markerColor]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`@keyframes bw-pin-pulse{0%{transform:translateX(-50%) scale(0.6);opacity:0.7}100%{transform:translateX(-50%) scale(1.8);opacity:0}}`}</style>
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full rounded-xl overflow-hidden"
      />
    </>
  )
}
