'use client'

import { useEffect, useRef, useState } from 'react'
import type { RestorationSite, SiteSpeciesRef } from '@/lib/types'
import api from '@/lib/api'
import { addSiteArea, updateSiteArea, deleteSiteArea } from '@/lib/mangrove-api'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { X, MapPin, Leaf, TreePine, BarChart2, Clock, Ban, Sprout, User as UserIcon, Loader2, Pencil } from 'lucide-react'

// Lucide icon per site status, used in the legend and the detail panel header.
const STATUS_ICON: Record<string, React.ElementType> = {
  active:      Sprout,
  in_progress: Clock,
  inactive:    Ban,
}

interface SitePolygonMapProps {
  sites: RestorationSite[]
  height?: string
  center?: [number, number]
  zoom?: number
  onSiteClick?: (site: RestorationSite) => void
  selectedSiteId?: number
  publicMode?: boolean
  /** Enables the mangrove-area drawing tool (menro/admin/staff, single site). */
  editable?: boolean
  /** Called with the updated site after a boundary is drawn/edited and saved. */
  onBoundarySaved?: (site: RestorationSite) => void
}

// Coastal barangays of Gloria — the 8 coastal ones. Centre/bounds corrected to
// the real coastline (confirmed Agsalin ~12.8838,121.4728; coast just east).
const GLORIA_CENTER: [number, number] = [12.9330, 121.4800]
// Tight bounds covering only the coastal strip of Gloria
const GLORIA_COASTAL_BOUNDS: [[number, number], [number, number]] = [
  [12.8600, 121.4500],
  [13.0000, 121.5100],
]

// Fallback spread center for sites without coordinates
const GLORIA_FALLBACK: [number, number] = [12.9330, 121.4800]

// Status glyphs are drawn as inline SVG paths (no emoji) so they render
// identically on every device and can never be corrupted by text encoding.
const STATUS_GLYPH: Record<string, string> = {
  // leaf / sprout — active
  active:      '<path d="M0 7 V-2 M0 -2 C0 -6 4 -8 8 -7 C8 -3 4 -1 0 -2 M0 0 C0 -3 -4 -5 -7 -4 C-7 -1 -3 1 0 0 Z" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // clock — in progress
  in_progress: '<circle cx="0" cy="0" r="7" fill="none" stroke="white" stroke-width="2"/><path d="M0 -4 V0 L3 2" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // ban / no-entry — inactive
  inactive:    '<circle cx="0" cy="0" r="7" fill="none" stroke="white" stroke-width="2"/><line x1="-5" y1="-5" x2="5" y2="5" stroke="white" stroke-width="2" stroke-linecap="round"/>',
}

const STATUS_CONFIG: Record<string, {
  color: string; fill: string; label: string; bg: string; text: string
}> = {
  active:      { color: '#15803d', fill: '#22c55e', label: 'Active',      bg: '#f0fdf4', text: '#15803d' },
  in_progress: { color: '#b45309', fill: '#f59e0b', label: 'In Progress', bg: '#fffbeb', text: '#b45309' },
  inactive:    { color: '#4b5563', fill: '#9ca3af', label: 'Inactive',    bg: '#f9fafb', text: '#4b5563' },
}

function buildPinHtml(cfg: typeof STATUS_CONFIG[string], statusKey: string, label: string, isSelected: boolean): string {
  const size  = isSelected ? 48 : 40
  const dim    = size + 10
  const cx     = dim / 2
  const cy     = dim / 2 - 2
  const glyph  = STATUS_GLYPH[statusKey] ?? STATUS_GLYPH.active
  const pulse  = isSelected
    ? `<circle cx="${cx}" cy="${cy + 2}" r="${size / 2 + 6}" fill="${cfg.fill}" opacity="0.18"/>`
    : ''
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;
      filter:drop-shadow(0 4px 10px rgba(0,0,0,0.28))">
      <svg width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" xmlns="http://www.w3.org/2000/svg">
        ${pulse}
        <circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="${cfg.fill}" stroke="white" stroke-width="3"/>
        <g transform="translate(${cx} ${cy}) scale(${isSelected ? 1.15 : 1})">${glyph}</g>
        <polygon
          points="${cx - 5},${cy + size / 2} ${cx + 5},${cy + size / 2} ${cx},${cy + size / 2 + 10}"
          fill="${cfg.fill}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      <div style="background:white;color:${cfg.text};font-size:10px;font-weight:700;
        font-family:Inter,system-ui,sans-serif;padding:2px 8px;border-radius:20px;
        border:1.5px solid ${cfg.color};white-space:nowrap;margin-top:-2px;
        box-shadow:0 2px 6px rgba(0,0,0,0.15);max-width:130px;overflow:hidden;
        text-overflow:ellipsis;">${label}</div>
    </div>`
}

// Compute a Leaflet polygon layer's area in hectares using the spherical
// shoelace formula (L.GeometryUtil may be unavailable, so compute directly).
function computePolygonHa(L: any, layer: any): number | null {
  try {
    // Gather the outer ring's latlngs (handles GeoJSON group → first feature).
    let latlngs: any = layer.getLatLngs ? layer.getLatLngs() : null
    if (!latlngs && layer.getLayers) {
      const first = layer.getLayers()[0]
      latlngs = first?.getLatLngs?.()
    }
    while (Array.isArray(latlngs) && latlngs.length && Array.isArray(latlngs[0])) latlngs = latlngs[0]
    if (!Array.isArray(latlngs) || latlngs.length < 3) return null

    const R = 6378137 // Earth radius (m)
    const toRad = (d: number) => (d * Math.PI) / 180
    let area = 0
    for (let i = 0, n = latlngs.length; i < n; i++) {
      const p1 = latlngs[i]
      const p2 = latlngs[(i + 1) % n]
      area += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)))
    }
    area = Math.abs((area * R * R) / 2) // m²
    return +(area / 10000).toFixed(4)   // hectares
  } catch { return null }
}

export default function SitePolygonMap({
  sites,
  height = '500px',
  center = GLORIA_CENTER,
  zoom = 13,
  onSiteClick,
  selectedSiteId,
  publicMode = false,
  editable = false,
  onBoundarySaved,
}: SitePolygonMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const layersRef    = useRef<any[]>([])
  const boundaryLayerRef = useRef<any>(null) // the editable site's boundary layer
  const LRef         = useRef<any>(null)
  const roRef        = useRef<ResizeObserver | null>(null)
  const [selected, setSelected] = useState<RestorationSite | null>(null)
  const [drawing, setDrawing]   = useState(false)
  const [drawType, setDrawType] = useState<'mangrove' | 'planted'>('mangrove')
  const [editingBoundary, setEditingBoundary] = useState(false)
  const [areaHa, setAreaHa]     = useState<number | null>(null)
  const [savingBoundary, setSavingBoundary] = useState(false)
  // Multi-area support: the currently-selected drawn area (for edit/remove) and
  // a map of areaId → rendered Leaflet layer.
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const areaLayersRef = useRef<Record<number, any>>({})

  // The single site this map represents when used in editable (detail) mode.
  const editTarget = editable && sites.length === 1 ? sites[0] : null
  const [species, setSpecies]   = useState<SiteSpeciesRef[] | null>(null)
  const [speciesLoading, setSpeciesLoading] = useState(false)

  // Curated species inventory + detail hydration for the selected site.
  const selectedId = selected?.id ?? null
  useEffect(() => {
    if (!selectedId) { setSpecies(null); return }
    let cancelled = false
    const initialSpecies = selected?.site_species ?? selected?.species_list ?? null
    setSpecies(initialSpecies)
    setSpeciesLoading(true)
    api.get(`/sites/${selectedId}`)
      .then(({ data }) => {
        if (cancelled) return
        const resolvedSpecies = data.site_species ?? selected?.site_species ?? selected?.species_list ?? []
        setSpecies(resolvedSpecies)
        setSelected(prev => {
          if (!prev || prev.id !== selectedId) return prev
          return {
            ...prev,
            ...(data.site ?? {}),
            plantation_count: data.plantation_count ?? prev.plantation_count,
            survival_rate: (data.plantation_count ?? prev.plantation_count ?? 0) > 0
              ? (data.survival?.survival_rate ?? prev.survival_rate ?? null)
              : (prev.survival_rate ?? null),
            site_species: resolvedSpecies,
            species_list_count: data.site_species_count ?? resolvedSpecies.length,
          }
        })
      })
      .catch(() => {
        if (!cancelled) setSpecies(selected?.site_species ?? selected?.species_list ?? [])
      })
      .finally(() => { if (!cancelled) setSpeciesLoading(false) })
    return () => { cancelled = true }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initialise map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mapRef.current) return

    // Guards against the Leaflet "_leaflet_pos" crash: if this effect's cleanup
    // runs before the dynamic import resolves (fast unmount / Fast Refresh), or
    // a deferred callback fires after the map is removed, we must not touch the
    // destroyed map.
    let destroyed = false
    let rafId = 0

    // Only resize a map that still exists and is attached to the DOM.
    const safeInvalidate = (map: any) => {
      if (destroyed || !mapRef.current) return
      const container = map?.getContainer?.()
      if (!container || !container.isConnected) return
      try { map.invalidateSize() } catch { /* map torn down mid-call */ }
    }

    // Load Leaflet first, then (when the map is editable) Geoman BEFORE creating
    // the map so it registers map.pm. Importing Geoman after L.map() leaves
    // map.pm undefined, which is what caused the enableDraw crash.
    const boot = editable
      ? import('leaflet').then(async (L) => { await import('@geoman-io/leaflet-geoman-free'); return L })
      : import('leaflet')

    boot.then((L) => {
      // Component unmounted before Leaflet finished loading — abort.
      if (destroyed) return
      if (!containerRef.current) return
      if ((containerRef.current as any)._leaflet_id != null) return

      LRef.current = L

      const map = L.map(containerRef.current, {
        preferCanvas: false,
        zoomControl: false,
        minZoom: 12,
        maxZoom: 18,
        // Constrain to Gloria coastal strip only
        maxBounds: GLORIA_COASTAL_BOUNDS,
        maxBoundsViscosity: 1.0,
      }).setView(center, zoom)

      mapRef.current = map

      // Satellite basemap (Esri World Imagery) + readable place/road labels,
      // matching the Google-Earth-style aerial view used across the system.
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

      L.control.zoom({ position: 'topleft' }).addTo(map)
      L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)

      // When the map fills a flexible container (height:100%), the pixel size
      // isn't final at init. Recalculate once the layout settles, and again on
      // any container resize, so tiles cover the whole area (no grey gaps).
      rafId = requestAnimationFrame(() => safeInvalidate(map))
      if (containerRef.current && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => safeInvalidate(map))
        ro.observe(containerRef.current)
        roRef.current = ro
      }
    })

    return () => {
      destroyed = true
      if (rafId) cancelAnimationFrame(rafId)
      roRef.current?.disconnect()
      roRef.current = null
      try { mapRef.current?.remove() } catch { /* already removed */ }
      mapRef.current = null
      LRef.current   = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redraw markers whenever sites or selection changes ────────────────────
  useEffect(() => {
    const L   = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    // Clear previous layers
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    const bounds: [number, number][] = []

    sites.forEach((site) => {
      const cfg        = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active
      const isSelected = site.id === selectedSiteId

      // ── Drawn areas (multiple per site: green mangrove + red planted) ─────
      let polygonCenter: [number, number] | null = null
      areaLayersRef.current = {}

      // Build the list of areas to render. Prefer the new multi-area list;
      // fall back to the legacy single boundary so pre-migration data still shows.
      const areaList: { id: number; type: 'mangrove' | 'planted'; geojson: any }[] =
        (site.areas && site.areas.length)
          ? site.areas.map(a => ({ id: a.id, type: a.type, geojson: a.geojson }))
          : (site.boundary_geojson
              ? [{ id: -1, type: (site.boundary_type ?? 'mangrove') as 'mangrove' | 'planted', geojson: site.boundary_geojson }]
              : [])

      areaList.forEach(area => {
        let geojson = area.geojson
        if (typeof geojson === 'string') {
          try { geojson = JSON.parse(geojson) } catch { return }
        }
        if (!geojson || typeof geojson !== 'object') return

        const isPlanted = area.type === 'planted'
        const stroke = isPlanted ? '#b91c1c' : cfg.color
        const fill   = isPlanted ? '#ef4444' : cfg.fill
        const isAreaSelected = editable && sites.length === 1 && selectedAreaId === area.id
        const baseOpacity = isAreaSelected ? 0.5 : (isSelected ? 0.34 : 0.24)
        const layer = L.geoJSON(geojson as any, {
          style: {
            color: stroke, weight: isAreaSelected ? 4 : (isSelected ? 3 : 2.5), opacity: 1,
            fillColor: fill, fillOpacity: baseOpacity,
            dashArray: (!isPlanted && site.status === 'in_progress') ? '8 5' : undefined,
          },
        }).addTo(map)

        layer.on('mouseover', () => layer.setStyle({ fillOpacity: baseOpacity + 0.15, weight: 4 }))
        layer.on('mouseout',  () => layer.setStyle({ fillOpacity: baseOpacity, weight: isAreaSelected ? 4 : 2.5 }))
        layer.on('click', () => {
          // In editable single-site mode, clicking an area selects it (for edit/
          // remove); otherwise it opens the site detail panel.
          if (editable && sites.length === 1) { setSelectedAreaId(area.id); setSelected(null) }
          else { setSelected(site); onSiteClick?.(site) }
        })
        layersRef.current.push(layer)
        if (area.id > 0) areaLayersRef.current[area.id] = layer

        try {
          const b = layer.getBounds()
          if (b.isValid()) {
            bounds.push([b.getSouth(), b.getWest()])
            bounds.push([b.getNorth(), b.getEast()])
            const c = b.getCenter()
            polygonCenter = [c.lat, c.lng]
          }
        } catch {}
      })

      // ── Resolve pin position ──────────────────────────────────────────────
      // 1. Explicit lat/lng stored on the site
      // 2. Centroid of the polygon boundary
      // 3. Evenly-spaced fallback around Gloria center (ensures all pins show)
      let lat: number = (site as any).latitude  ?? (site as any).lat
      let lng: number = (site as any).longitude ?? (site as any).lng

      if (!lat || !lng) {
        const pc = polygonCenter as [number, number] | null
        if (pc) {
          lat = pc[0]; lng = pc[1]
        } else {
          const idx   = sites.indexOf(site)
          const angle = (idx / Math.max(sites.length, 1)) * 2 * Math.PI
          const r     = 0.009 // ~1 km radius spread
          lat = GLORIA_CENTER[0] + r * Math.cos(angle)
          lng = GLORIA_CENTER[1] + r * Math.sin(angle)
        }
      }

      bounds.push([lat, lng])

      const label   = site.barangay ?? site.name.split(' ').slice(0, 2).join(' ')
      const pinIcon = L.divIcon({
        className:  '',
        html:       buildPinHtml(cfg, site.status, label, isSelected),
        iconSize:   [isSelected ? 58 : 50, isSelected ? 78 : 68],
        iconAnchor: [isSelected ? 29 : 25, isSelected ? 74 : 64],
      })

      const marker = L.marker([lat, lng], { icon: pinIcon, zIndexOffset: isSelected ? 1000 : 0 }).addTo(map)
      marker.on('click', () => { setSelected(site); onSiteClick?.(site) })
      layersRef.current.push(marker)
    })

    // Fit map to all markers
    if (bounds.length > 0) {
      try { map.fitBounds(bounds as any, { padding: [60, 60], maxZoom: 14 }) } catch {}
    } else {
      map.setView(GLORIA_CENTER, 13)
    }
  }, [sites, selectedSiteId, selectedAreaId, onSiteClick]) // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = selected ? (STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.active) : null

  // The currently-selected drawn area (editable single-site mode).
  const selectedArea = (editable && editTarget?.areas)
    ? editTarget.areas.find(a => a.id === selectedAreaId) ?? null
    : null

  // ── Mangrove-area drawing (menro/admin/staff, single-site detail map) ───────
  // Collects the drawn polygon as GeoJSON and saves it to the existing
  // PUT /sites/{id} boundary_geojson field, so it then renders as a green area
  // and is picked up by the zonation overlay and the map PDF snapshot.
  async function startDrawing(type: 'mangrove' | 'planted') {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map || !editTarget) return
    // Geoman is loaded during map init (see boot above). If for any reason pm
    // isn't attached yet, load it and let Geoman bind to the existing map.
    if (!map.pm) {
      await import('@geoman-io/leaflet-geoman-free')
    }
    if (!map.pm) {
      alert('Drawing tool failed to load. Please refresh and try again.')
      return
    }
    setDrawType(type)
    setDrawing(true)
    setSelected(null)
    // Live-draw template matches the chosen type's colour (red = planted).
    const tpl = type === 'planted'
      ? { color: '#b91c1c', fillColor: '#ef4444' }
      : { color: '#166534', fillColor: '#16a34a' }
    map.pm.enableDraw('Polygon', {
      snappable: true, finishOn: 'dblclick',
      templineStyle: { color: tpl.color },
      hintlineStyle: { color: tpl.color, dashArray: '5,5' },
      pathOptions: { color: tpl.color, fillColor: tpl.fillColor, fillOpacity: 0.3 },
    })
    // When a polygon is completed, add it as a NEW area (keeping existing ones).
    map.once('pm:create', async (e: any) => {
      try {
        const geojson = e.layer.toGeoJSON()?.geometry
        const ha = computePolygonHa(L, e.layer)
        map.removeLayer(e.layer)
        await createArea(geojson, type, ha)
      } finally {
        map.pm.disableDraw()
        setDrawing(false)
      }
    })
  }

  function cancelDrawing() {
    const map = mapRef.current
    try { map?.pm?.disableDraw() } catch {}
    setDrawing(false)
  }

  function extractGeometry(layer: any): any {
    const gj = layer.toGeoJSON?.()
    if (!gj) return null
    if (gj.type === 'Feature') return gj.geometry
    if (gj.type === 'FeatureCollection') return gj.features?.[0]?.geometry ?? null
    return gj
  }

  // Add a NEW drawn area to the site (a site can hold many: green + red).
  async function createArea(geometry: any, type: 'mangrove' | 'planted', ha: number | null) {
    if (!editTarget || !geometry) return
    const label = type === 'planted' ? 'currently-planted (red)' : 'mangrove (green)'
    const haNote = ha != null ? `\n\nMeasured area: ${ha} ha.` : ''
    if (!confirm(`Add this ${label} area to the site?${haNote}`)) return
    setSavingBoundary(true)
    try {
      await addSiteArea(editTarget.id, { type, geojson: JSON.stringify(geometry), area_hectares: ha })
      onBoundarySaved?.(editTarget) // parent re-fetches the site (areas included)
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to add the area.')
    } finally {
      setSavingBoundary(false)
    }
  }

  // ── Edit mode: adjust the SELECTED area's vertices to the exact measurement ──
  async function startEditing() {
    const map = mapRef.current
    const L = LRef.current
    const layer = selectedAreaId != null ? areaLayersRef.current[selectedAreaId] : null
    if (!map || !layer) { alert('Select an area on the map first (click it), then Edit.'); return }
    if (!map.pm) { await import('@geoman-io/leaflet-geoman-free') }
    if (!map.pm) { alert('Editing tool failed to load. Please refresh and try again.'); return }
    setSelected(null)
    setEditingBoundary(true)
    const enable = (lyr: any) => { try { lyr.pm?.enable({ allowSelfIntersection: false }) } catch {} }
    if (layer.getLayers) layer.getLayers().forEach(enable); else enable(layer)
    const update = () => { try { setAreaHa(computePolygonHa(L, layer)) } catch {} }
    try { setAreaHa(computePolygonHa(L, layer)) } catch {}
    layer.on('pm:markerdragend pm:vertexadded pm:vertexremoved', update)
    if (layer.getLayers) layer.getLayers().forEach((l: any) => l.on('pm:markerdragend pm:vertexadded pm:vertexremoved', update))
  }

  async function saveEditedBoundary() {
    const layer = selectedAreaId != null ? areaLayersRef.current[selectedAreaId] : null
    if (!editTarget || !layer || selectedArea == null) return
    const geometry = extractGeometry(layer)
    if (!geometry) { alert('Could not read the edited shape.'); return }
    const ha = computePolygonHa(LRef.current, layer)
    setSavingBoundary(true)
    try {
      await updateSiteArea(editTarget.id, selectedArea.id, {
        geojson: JSON.stringify(geometry), area_hectares: ha,
      })
      try { layer.pm?.disable?.(); layer.getLayers?.().forEach((l: any) => l.pm?.disable?.()) } catch {}
      setEditingBoundary(false)
      onBoundarySaved?.(editTarget)
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to save the edited area.')
    } finally {
      setSavingBoundary(false)
    }
  }

  // Remove the selected drawn area.
  async function removeSelectedArea() {
    if (!editTarget || selectedArea == null) return
    const label = selectedArea.type === 'planted' ? 'planted (red)' : 'mangrove (green)'
    if (!confirm(`Remove this ${label} area?`)) return
    setSavingBoundary(true)
    try {
      await deleteSiteArea(editTarget.id, selectedArea.id)
      setSelectedAreaId(null)
      onBoundarySaved?.(editTarget)
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to remove the area.')
    } finally {
      setSavingBoundary(false)
    }
  }

  function cancelEditing() {
    const layer = selectedAreaId != null ? areaLayersRef.current[selectedAreaId] : null
    try { layer?.pm?.disable?.(); layer?.getLayers?.().forEach((l: any) => l.pm?.disable?.()) } catch {}
    setEditingBoundary(false)
    onBoundarySaved?.(editTarget!) // refresh to discard unsaved vertex drags
  }

  return (
    <>
      <style>{`
        .leaflet-control-zoom a {
          border-radius: 8px !important; border: none !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important;
          color: #374151 !important; font-size: 16px !important;
          width: 32px !important; height: 32px !important; line-height: 32px !important;
        }
        .leaflet-control-zoom { border: none !important; display: flex !important; flex-direction: column !important; gap: 4px !important; }
        .leaflet-control-scale-line {
          border: 2px solid #374151 !important; border-top: none !important;
          color: #374151 !important; font-size: 10px !important;
          background: rgba(255,255,255,0.9) !important; padding: 2px 6px !important;
          border-radius: 0 0 4px 4px !important;
        }
      `}</style>

      <div className="relative">
        <div className="relative" style={{ height }}>
        <div ref={containerRef} style={{ height: '100%' }} className="w-full" />

        {/* ── Mangrove-area draw tool (editable, single-site detail map) ──── */}
        {editTarget && (
          <div className="absolute top-3 left-14 z-[500] flex items-center gap-2">
            {drawing ? (
              <div className="flex items-center gap-2 bg-white rounded-xl shadow-md border border-gray-100 px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <span className="w-3 h-3 rounded-sm" style={{ background: drawType === 'planted' ? '#ef4444' : '#16a34a' }} />
                  Drawing {drawType === 'planted' ? 'planted (red)' : 'mangrove (green)'}
                </span>
                <span className="text-xs text-gray-500">· click points, double-click to finish</span>
                <button onClick={cancelDrawing}
                  className="text-xs font-semibold text-red-600 hover:text-red-700">Cancel</button>
              </div>
            ) : editingBoundary ? (
              <div className="flex items-center gap-2 bg-white rounded-xl shadow-md border border-gray-100 px-3 py-2">
                <span className="text-xs font-semibold text-gray-700">Editing area</span>
                {areaHa != null && (
                  <span className="text-xs font-bold text-primary-700 tabular-nums">{areaHa} ha</span>
                )}
                <span className="text-xs text-gray-500 hidden sm:inline">· drag the corner points to adjust</span>
                <button onClick={saveEditedBoundary} disabled={savingBoundary}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg px-2.5 py-1 disabled:opacity-60">
                  {savingBoundary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
                </button>
                <button onClick={cancelEditing}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Mangrove (green) */}
                <button onClick={() => startDrawing('mangrove')} disabled={savingBoundary}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-700 hover:bg-green-800 rounded-xl px-3 py-2 shadow-md disabled:opacity-60">
                  {savingBoundary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Leaf className="w-3.5 h-3.5" />}
                  Mangrove area
                </button>
                {/* Planted (red) */}
                <button onClick={() => startDrawing('planted')} disabled={savingBoundary}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl px-3 py-2 shadow-md disabled:opacity-60">
                  <span className="w-2.5 h-2.5 rounded-sm bg-white/90" /> Planted area
                </button>
                {/* Selected-area actions — click an area on the map to select it,
                    then Edit (adjust vertices) or Remove it. */}
                {selectedArea ? (
                  <div className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-md">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: selectedArea.type === 'planted' ? '#ef4444' : '#16a34a' }} />
                      {selectedArea.type === 'planted' ? 'Planted' : 'Mangrove'}
                      {selectedArea.area_hectares != null ? ` · ${selectedArea.area_hectares} ha` : ''}
                    </span>
                    <button onClick={startEditing} disabled={savingBoundary}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={removeSelectedArea} disabled={savingBoundary}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700">
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                    <button onClick={() => setSelectedAreaId(null)}
                      className="text-xs font-semibold text-gray-400 hover:text-gray-600">Deselect</button>
                  </div>
                ) : (editTarget.areas && editTarget.areas.length > 0) ? (
                  <span className="inline-flex items-center text-[11px] text-gray-500 bg-white/90 border border-gray-100 rounded-xl px-2.5 py-1.5 shadow-sm">
                    Click an area to edit or remove it
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )}
        </div>

        {/* ── Status legend ─────────────────────────────────────────────── */}
        <div className="static mx-3 mt-3 w-fit z-[400] bg-white/95 backdrop-blur-sm rounded-2xl shadow-md border border-gray-100 px-4 py-3 text-xs space-y-2 sm:absolute sm:bottom-10 sm:left-3 sm:mx-0 sm:mt-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Site Status</p>
          {Object.entries(STATUS_CONFIG).map(([key, c]) => {
            const Icon = STATUS_ICON[key] ?? Sprout
            return (
              <div key={key} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: c.fill }}>
                  <Icon className="w-3 h-3 text-white" strokeWidth={2.5} />
                </span>
                <span className="text-gray-700 font-semibold">{c.label}</span>
              </div>
            )
          })}
          {/* Drawn-area colour key */}
          <div className="border-t border-gray-100 pt-2 mt-1 space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Area</p>
            <div className="flex items-center gap-2.5">
              <span className="w-4 h-4 rounded-sm border border-black/10" style={{ background: '#16a34a' }} />
              <span className="text-gray-700">Mangrove area</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-4 h-4 rounded-sm border border-black/10" style={{ background: '#ef4444' }} />
              <span className="text-gray-700">Currently planted</span>
            </div>
          </div>
        </div>

        {/* ── Site detail panel ─────────────────────────────────────────── */}
        {selected && cfg && (
          <div className="static mx-3 mt-3 mb-3 sm:absolute sm:top-3 sm:right-3 sm:bottom-3 sm:m-0 sm:w-80 z-[500] pointer-events-none flex flex-col justify-start">
            <div
              onWheel={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
              className="pointer-events-auto w-full max-h-[26rem] sm:max-h-full flex flex-col bg-white/98 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in slide-in-from-right-4 duration-200"
            >
              <div className="px-4 py-3 flex items-start justify-between gap-2 shrink-0" style={{ background: cfg.bg, borderBottom: `3px solid ${cfg.color}` }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ background: cfg.color }}>
                  {(() => { const Icon = STATUS_ICON[selected.status] ?? Sprout; return <Icon className="w-4 h-4 text-white" strokeWidth={2.5} /> })()}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{selected.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: cfg.color }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                      {cfg.label}
                    </span>
                    {selected.established_year != null && (
                      <span className="text-[10px] font-semibold text-gray-600 bg-white/80 border border-gray-200/80 px-2 py-0.5 rounded-full">
                        Est. {selected.established_year}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close site details"
                className="shrink-0 p-1 rounded-lg hover:bg-black/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-3.5 space-y-2.5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {selected.barangay && (
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <MapPin className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                  <span className="font-semibold">Brgy. {selected.barangay}, Gloria, Oriental Mindoro</span>
                </div>
              )}

              {/* Assigned Bantay Bakawan */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                <span className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <UserIcon className="w-3.5 h-3.5 text-primary-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Bantay Bakawan</p>
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {selected.assigned_worker?.name ?? 'Unassigned'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {selected.area_hectares != null && (
                  <div className="bg-green-50 rounded-xl p-2 border border-green-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Leaf className="w-3 h-3 text-green-600" />
                      <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Area</p>
                    </div>
                    <p className="text-xs font-extrabold text-green-800">{selected.area_hectares} ha</p>
                  </div>
                )}
                <div className="bg-blue-50 rounded-xl p-2 border border-blue-100">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Leaf className="w-3 h-3 text-blue-600" />
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Species</p>
                  </div>
                  <p className="text-xs font-extrabold text-blue-800">
                    {(species?.length ?? selected.site_species?.length ?? selected.species_list_count ?? selected.species_list?.length ?? 0)}
                  </p>
                </div>
                {!publicMode && selected.plantation_count != null && (
                  <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <TreePine className="w-3 h-3 text-emerald-600" />
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Planted</p>
                    </div>
                    <p className="text-xs font-extrabold text-emerald-800">{selected.plantation_count.toLocaleString()}</p>
                  </div>
                )}
                {!publicMode && selected.survival_rate != null && (
                  <div className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <BarChart2 className="w-3 h-3 text-gray-600" />
                      <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">Survival</p>
                    </div>
                    <p className="text-xs font-extrabold" style={{ color: selected.survival_rate >= 70 ? '#15803d' : selected.survival_rate >= 40 ? '#b45309' : '#b91c1c' }}>
                      {selected.survival_rate}%
                    </p>
                  </div>
                )}
              </div>
              {/* Planted vs unplanted area */}
              {selected.planted_hectares != null && selected.area_hectares != null ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Sprout className="w-3 h-3 text-emerald-600" />
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Planted Area</p>
                    </div>
                    <p className="text-xs font-extrabold text-emerald-800">{selected.planted_hectares} ha</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-2 border border-amber-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Leaf className="w-3 h-3 text-amber-600" />
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Unplanted</p>
                    </div>
                    <p className="text-xs font-extrabold text-amber-800">
                      {Math.max(0, +(selected.area_hectares - selected.planted_hectares).toFixed(4))} ha
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Mangrove species documented at this site */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <Leaf className="w-3 h-3 text-primary-500" />
                  Mangrove Species{species && species.length > 0 ? ` (${species.length})` : ''}
                  {speciesLoading && <Loader2 className="w-3 h-3 text-gray-300 animate-spin" />}
                </p>
                {species && species.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {species.map(sp => (
                      <span key={sp.id}
                        title={sp.local_name ? `${sp.scientific_name} · ${sp.local_name}` : sp.scientific_name}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-0.5">
                        <Leaf className="w-2.5 h-2.5" />
                        <span className="italic">{sp.scientific_name}</span>
                        {sp.local_name && <span className="text-primary-400 not-italic">· {sp.local_name}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 italic">
                    {speciesLoading ? 'Loading species...' : 'No species recorded yet.'}
                  </p>
                )}
              </div>

              {selected.description && (
                <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                  {selected.description}
                </p>
              )}
              {publicMode && (
                <div className="bg-primary-50 rounded-xl p-2.5 border border-primary-100 text-center">
                  <p className="text-xs text-primary-700 font-medium">Sign in to view plantation records, survival rates, and full monitoring data.</p>
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {/* ── Hint ──────────────────────────────────────────────────────── */}
        {sites.length > 0 && !selected && (
          <div className="hidden absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-md border border-gray-100 pointer-events-none items-center gap-1.5 sm:flex">
            <MapPin className="w-3.5 h-3.5 text-primary-600" />
            <p className="text-xs text-gray-600 font-medium">Click a pin to view site details</p>
          </div>
        )}
      </div>
    </>
  )
}
