// ─────────────────────────────────────────────────────────────────────────────
// Visual PDF reports for the MENRO Admin map.
//
// MENRO admins attach these to their Provincial office reports, so they must be
// readable documents — not raw CSV. Each builder produces a branded A4 PDF with
// summary tables and, where available, site/monitoring photos and before/after
// comparisons. Built on the same jspdf + jspdf-autotable stack already used by
// the Reports generator (app/reports/mangrove), including the proven
// imageToDataUrl → addImage pattern so a missing/blocked image never breaks the
// document.
// ─────────────────────────────────────────────────────────────────────────────

import api from '@/lib/api'
import { getReportPhotoUrls } from '@/lib/utils'
import type { Report, RestorationSite, SitePhoto } from '@/lib/types'

const BRAND: [number, number, number] = [26, 71, 49] // #1a4731 forest green
const MARGIN = 14

interface PdfTableCell {
  content: string
  styles: { fillColor: [number, number, number]; cellWidth: number }
}

const todayStr = () => new Date().toISOString().split('T')[0]
const fileSlug = (s: string) =>
  s.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'

function fmtDate(v: unknown): string {
  if (!v) return '—'
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Fetch an image URL and return a base64 data URL for jsPDF addImage.
// Returns null on failure so a missing/blocked image never breaks the PDF.
async function imageToDataUrl(url: string): Promise<{ data: string; fmt: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const fmt = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const data: string = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
    return { data, fmt }
  } catch { return null }
}

// Shared jsPDF bootstrap — returns the doc plus small layout helpers used by
// every builder (branded header band, section heading, key/value + grid tables,
// page-break guard, and footer).
async function makeDoc(titleLine: string, subtitle: string) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  let y = 15

  // Header band
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, pageW, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text(`BAKAWATCH — ${titleLine}`, MARGIN, 11)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('Municipal Environment & Natural Resources Office (MENRO) · LGU Gloria, Oriental Mindoro', MARGIN, 17)
  doc.setFontSize(7.5)
  doc.text(subtitle, MARGIN, 21.5)
  doc.setTextColor(0, 0, 0)
  y = 32

  const setY = (v: number) => { y = v }
  const getY = () => y
  const ensure = (need: number) => { if (y + need > pageH - 16) { doc.addPage(); y = 18 } }

  const heading = (title: string) => {
    ensure(14)
    doc.setFillColor(240, 245, 242)
    doc.rect(MARGIN, y, pageW - MARGIN * 2, 7, 'F')
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BRAND)
    doc.text(title, MARGIN + 2, y + 5)
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal')
    y += 11
  }

  // Two-column key/value table.
  const kv = (rows: [string, unknown][]) => {
    autoTable(doc, {
      startY: y,
      theme: 'striped',
      body: rows.map(([k, v]) => [k, String(v ?? '—')]),
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold', textColor: [60, 60, 60] } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 7
  }

  // Generic header/body grid table.
  const grid = (head: string[][], body: (string | number | PdfTableCell)[][], opts?: any) => {
    autoTable(doc, {
      startY: y, head, body, theme: 'striped', showHead: 'everyPage',
      headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [247, 250, 248] },
      margin: { left: MARGIN, right: MARGIN },
      ...opts,
    })
    y = (doc as any).lastAutoTable.finalY + 7
  }

  const footer = () => {
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.setFontSize(7); doc.setTextColor(150, 150, 150)
      doc.text(
        `Generated ${new Date().toLocaleString('en-PH')} · BAKAWATCH MENRO Gloria`,
        MARGIN, pageH - 8,
      )
      doc.text(`Page ${i} of ${pages}`, pageW - MARGIN, pageH - 8, { align: 'right' })
    }
    doc.setTextColor(0, 0, 0)
  }

  return { doc, pageW, pageH, setY, getY, ensure, heading, kv, grid, footer }
}

// Draw a labelled image box; shows a placeholder when the image is unavailable.
function drawImageBox(
  doc: any, dataUrl: { data: string; fmt: string } | null,
  x: number, yTop: number, w: number, h: number, label: string, placeholder: string,
) {
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90)
  doc.text(label, x, yTop - 1.5)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0)
  doc.setDrawColor(210, 210, 210)
  doc.rect(x, yTop, w, h)
  if (dataUrl) {
    try { doc.addImage(dataUrl.data, dataUrl.fmt, x, yTop, w, h); return } catch { /* fall through */ }
  }
  doc.setFontSize(7); doc.setTextColor(160, 160, 160)
  doc.text(placeholder, x + w / 2, yTop + h / 2, { align: 'center' })
  doc.setTextColor(0, 0, 0)
}

interface PdfPhoto {
  url: string
  label: string
}

function getReportEvidencePhotos(report: Report, timeline: any): PdfPhoto[] {
  const photos: PdfPhoto[] = []
  const seen = new Set<string>()
  const add = (url: unknown, label: string) => {
    if (typeof url !== 'string' || !url || seen.has(url)) return
    seen.add(url)
    photos.push({ url, label })
  }

  getReportPhotoUrls(report).forEach((url, index) => add(url, `INITIAL REPORT · PHOTO ${index + 1}`))

  const updates = Array.isArray(timeline?.updates) ? timeline.updates : []
  updates.forEach((update: any, updateIndex: number) => {
    const updatePhotos = Array.isArray(update?.photos)
      ? update.photos.map((photo: any) => typeof photo === 'string' ? photo : photo?.url)
      : []
    if (updatePhotos.length > 0) {
      updatePhotos.forEach((url: unknown, photoIndex: number) =>
        add(url, `UPDATE ${updateIndex + 1} · PHOTO ${photoIndex + 1} · ${fmtDate(update.update_date)}`),
      )
    } else {
      add(update?.image_url, `UPDATE ${updateIndex + 1} · ${fmtDate(update.update_date)}`)
    }
  })

  return photos
}

async function addPhotoGallery(
  doc: any,
  pageW: number,
  getY: () => number,
  setY: (value: number) => void,
  ensure: (height: number) => void,
  photos: PdfPhoto[],
) {
  if (!photos.length) return

  const gap = 8
  const imgW = (pageW - MARGIN * 2 - gap) / 2
  const imgH = imgW * 0.66

  for (let index = 0; index < photos.length; index += 2) {
    ensure(imgH + 10)
    const rowY = getY() + 2
    const row = photos.slice(index, index + 2)
    const images = await Promise.all(row.map(photo => imageToDataUrl(photo.url)))

    row.forEach((photo, column) => {
      const x = MARGIN + column * (imgW + gap)
      drawImageBox(
        doc,
        images[column],
        x,
        rowY,
        imgW,
        imgH,
        photo.label,
        'Image unavailable',
      )
    })
    setY(rowY + imgH + 8)
  }
}

// Capture the live Leaflet map (basemap + site overlays + markers) as a PNG data
// URL via html2canvas, so the Map Data PDF opens with a visual of the map — like
// the reference LGU maps the MENRO office attaches to Provincial reports. Returns
// null if the element isn't on screen or the capture fails, so the PDF still
// generates with its tables.
async function captureMapImage(
  elementId = 'menro-map-capture',
): Promise<{ data: string; w: number; h: number } | null> {
  if (typeof document === 'undefined') return null
  const el = document.getElementById(elementId)
  if (!el) return null
  try {
    const html2canvas = (await import('html2canvas')).default
    // Let React apply export-only map layers, then give tiles time to settle.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await new Promise(r => setTimeout(r, 400))
    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#eaf1ee',
      logging: false,
      scale: 2, // sharper print output
      // Keep the snapshot clean: drop Leaflet's on-map UI (zoom buttons, the
      // layer toggle, and the attribution bar) so the report shows just the map.
      ignoreElements: (node: Element) =>
        node.classList?.contains('leaflet-control-container') ||
        node.classList?.contains('leaflet-control-zoom') ||
        node.classList?.contains('leaflet-control-layers') ||
        node.classList?.contains('leaflet-control-attribution'),
    })
    return { data: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height }
  } catch {
    return null
  }
}

const SEVERITY_RADIUS: Record<string, number> = { low: 25, medium: 60, high: 120, critical: 200 }
function affectedRadius(r: Report): number {
  if (r.affected_radius_m != null && r.affected_radius_m > 0) return r.affected_radius_m
  return SEVERITY_RADIUS[r.severity ?? 'medium'] ?? SEVERITY_RADIUS.medium
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REPORT PANEL → PDF (threat / growth-monitoring case)
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadReportPdf(report: Report) {
  const { doc, pageW, getY, setY, ensure, heading, kv, grid, footer } =
    await makeDoc('Field Report', `${report.category ?? ''} · Report #${report.id}`)

  heading(report.title ?? `Report #${report.id}`)
  kv([
    ['Report ID', report.id],
    ['Category', report.category],
    ['Status', report.status],
    ['Severity', report.severity ?? 'medium'],
    ['Affected area', `~${affectedRadius(report)} m radius`],
    ['Location', report.location_name ?? '—'],
    ['Coordinates',
      (report as any).latitude ?? (report as any).lat
        ? `${(report as any).latitude ?? (report as any).lat}, ${(report as any).longitude ?? (report as any).lng}`
        : '—'],
    ['Reported', fmtDate(report.created_at)],
  ])

  if (report.description) {
    heading('Description')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(report.description, pageW - MARGIN * 2)
    ensure(lines.length * 4.6 + 4)
    doc.text(lines, MARGIN, getY()); setY(getY() + lines.length * 4.6 + 4)
  }

  if (report.admin_notes) {
    heading('MENRO Notes')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(report.admin_notes, pageW - MARGIN * 2)
    ensure(lines.length * 4.6 + 4)
    doc.text(lines, MARGIN, getY()); setY(getY() + lines.length * 4.6 + 4)
  }

  // Pull monitoring history + before/after from the timeline endpoint.
  let timeline: any = null
  let timelineUnavailable = false
  try {
    const { data } = await api.get(`/reports/${report.id}/timeline`)
    timeline = data
  } catch {
    timelineUnavailable = true
  }

  // Monitoring timeline (status history + field updates), newest first.
  const history = timeline?.status_history ?? []
  const updates = timeline?.updates ?? []
  const evidencePhotos = getReportEvidencePhotos(report, timeline)
  if (evidencePhotos.length) heading('Photo Evidence')
  await addPhotoGallery(doc, pageW, getY, setY, ensure, evidencePhotos)

  if (timelineUnavailable) {
    heading('Monitoring photos unavailable')
    const note = 'Monitoring updates could not be retrieved while this PDF was generated. The report photos above are included; download the report again when the API is available to include monitoring photos.'
    const lines = doc.splitTextToSize(note, pageW - MARGIN * 2)
    ensure(lines.length * 4.6 + 4)
    doc.setFontSize(8)
    doc.text(lines, MARGIN, getY())
    setY(getY() + lines.length * 4.6 + 4)
  }

  if (history.length || updates.length) {
    heading('Monitoring History')
    const rows: (string | number)[][] = []
    for (const h of history) {
      rows.push([
        fmtDate(h.created_at),
        h.previous_status ? `${h.previous_status} → ${h.new_status}` : h.new_status,
        h.changer?.name ?? '—',
        h.note ?? '',
      ])
    }
    for (const u of updates) {
      rows.push([
        fmtDate(u.update_date),
        u.status ?? 'update',
        u.updater?.name ?? '—',
        [u.observation, u.action_taken ? `Action: ${u.action_taken}` : ''].filter(Boolean).join(' — '),
      ])
    }
    rows.sort((a, b) => new Date(String(b[0])).getTime() - new Date(String(a[0])).getTime())
    grid(
      [['Date', 'Status', 'By', 'Notes']],
      rows,
      { columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 32 }, 2: { cellWidth: 28 } } },
    )
  }

  footer()
  doc.save(`threat-report-${report.id}-${fileSlug(report.title ?? '')}-${todayStr()}.pdf`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SITE PANEL → PDF (restoration site profile)
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadSitePdf(site: RestorationSite) {
  const { doc, pageW, getY, setY, ensure, heading, kv, grid, footer } =
    await makeDoc('Restoration Site Report', `${site.name ?? ''}${site.barangay ? ` · Brgy. ${site.barangay}` : ''}`)

  heading(site.name ?? `Site #${site.id}`)
  kv([
    ['Site ID', site.id],
    ['Barangay', site.barangay ?? '—'],
    ['Status', site.status],
    ['Established', site.established_year ?? '—'],
    ['Area', site.area_hectares != null ? `${site.area_hectares} ha` : '—'],
    ['Planted', site.planted_hectares != null ? `${site.planted_hectares} ha` : '—'],
    ['Species recorded', site.site_species?.length ?? (site as any).species_list_count ?? 0],
    ['Survival rate', site.survival_rate != null ? `${site.survival_rate}%` : '—'],
    ['Plantation records', site.plantation_count ?? '—'],
    ['Assigned Bantay Bakawan', site.assigned_worker?.name ?? 'Unassigned'],
    ['Coordinates',
      (site as any).latitude ? `${(site as any).latitude}, ${(site as any).longitude}` : '—'],
  ])

  if (site.description) {
    heading('About')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(site.description, pageW - MARGIN * 2)
    ensure(lines.length * 4.6 + 4)
    doc.text(lines, MARGIN, getY()); setY(getY() + lines.length * 4.6 + 4)
  }

  // Mangrove species list.
  const species = site.site_species ?? (site as any).species_list ?? []
  if (Array.isArray(species) && species.length) {
    heading('Mangrove Species')
    grid(
      [['#', 'Scientific name', 'Local name']],
      species.map((sp: any, i: number) => [i + 1, sp.scientific_name ?? '—', sp.local_name ?? '—']),
      { columnStyles: { 0: { cellWidth: 12 } } },
    )
  }

  // Site photos — before/after where available.
  let photos: SitePhoto[] = []
  try {
    const { data } = await api.get(`/sites/${site.id}/photos`)
    photos = Array.isArray(data) ? data : (data?.data ?? [])
  } catch { /* photos optional */ }

  if (photos.length) {
    const before = photos.find(p => p.photo_type === 'before') ?? null
    const after  = photos.find(p => p.photo_type === 'after')  ?? null
    heading('Site Photos')
    const imgW = (pageW - MARGIN * 2 - 8) / 2
    const imgH = imgW * 0.66
    ensure(imgH + 6)
    const [b, a] = await Promise.all([
      before ? imageToDataUrl(before.cloudinary_url) : Promise.resolve(null),
      after  ? imageToDataUrl(after.cloudinary_url)  : Promise.resolve(null),
    ])
    const boxY = getY() + 2
    drawImageBox(doc, b, MARGIN, boxY, imgW, imgH, 'BEFORE', 'No before photo')
    drawImageBox(doc, a, MARGIN + imgW + 8, boxY, imgW, imgH, 'AFTER', 'No after photo')
    setY(boxY + imgH + 8)
  }

  footer()
  doc.save(`site-${site.id}-${fileSlug(site.name ?? '')}-${todayStr()}.pdf`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MAP DATA → PDF (overview of all sites + visible reports)
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadMapDataPdf(sites: RestorationSite[], reports: Report[]) {
  const { doc, pageW, getY, setY, ensure, heading, grid, footer } =
    await makeDoc('Map Data Report', `${sites.length} sites · ${reports.length} reports · Gloria, Oriental Mindoro`)

  // Map snapshot — the visual the Provincial report needs.
  const map = await captureMapImage()
  heading('Site Map — Gloria, Oriental Mindoro')
  if (map) {
    const imgW = pageW - MARGIN * 2
    const imgH = Math.min(120, imgW * (map.h / map.w)) // cap height so it fits a page
    ensure(imgH + 4)
    doc.setDrawColor(210, 210, 210)
    doc.rect(MARGIN, getY(), imgW, imgH)
    try { doc.addImage(map.data, 'JPEG', MARGIN, getY(), imgW, imgH) } catch { /* keep going */ }
    setY(getY() + imgH + 4)
    doc.setFontSize(7); doc.setTextColor(150, 150, 150)
    doc.text('Live map snapshot · Imagery © Esri, Maxar, Earthstar Geographics · Labels © Esri', MARGIN, getY())
    doc.setTextColor(0, 0, 0); setY(getY() + 6)
  } else {
    const note = 'The live map snapshot could not be captured. The site and report data are included below.'
    ensure(10)
    doc.setFontSize(8); doc.setTextColor(150, 90, 40)
    doc.text(note, MARGIN, getY())
    setY(getY() + 8); doc.setTextColor(0, 0, 0)
  }

  heading('Mangrove Zonation Legend')
  const zoneLegend: [string, [number, number, number]][] = [
    ['Seaward', [6, 182, 212]],
    ['Seaward to Middle Zone', [20, 184, 166]],
    ['Middle Intertidal Zone', [34, 197, 94]],
    ['Middle to Landward Zone', [132, 204, 22]],
    ['Riverine', [59, 130, 246]],
    ['Brackish Estuary', [167, 139, 250]],
    ['Landward', [180, 83, 9]],
  ]
  const legendRows = zoneLegend.map(([label, color]) => [
    { content: '', styles: { fillColor: color, cellWidth: 10 } },
    label,
  ])
  grid([['Zone color', 'Mangrove zonation']], legendRows, {
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 100 } },
    styles: { cellPadding: 2 },
  })
  doc.setFontSize(7.5); doc.setTextColor(110, 110, 110)
  const zoneNote = 'Colored shapes show mapped restoration-site areas by their recorded dominant species zonation; they are not a surveyed coastal-wide zoning boundary. No zone-area measurements are inferred.'
  const zoneNoteLines = doc.splitTextToSize(zoneNote, pageW - MARGIN * 2)
  ensure(zoneNoteLines.length * 3.6 + 4)
  doc.text(zoneNoteLines, MARGIN, getY())
  setY(getY() + zoneNoteLines.length * 3.6 + 5)
  doc.setTextColor(0, 0, 0)

  // Summary band.
  heading('Overview')
  const activeSites = sites.filter(s => s.status === 'active').length
  const inProgress  = sites.filter(s => s.status === 'in_progress').length
  const totalArea   = sites.reduce((a, s) => a + (s.area_hectares ?? 0), 0)
  const totalPlanted = sites.reduce((a, s) => a + (s.planted_hectares ?? 0), 0)
  grid(
    [['Metric', 'Value']],
    [
      ['Total sites', sites.length],
      ['Active sites', activeSites],
      ['In-progress sites', inProgress],
      ['Total area (ha)', totalArea.toFixed(1)],
      ['Total planted (ha)', totalPlanted.toFixed(1)],
      ['Reports on map', reports.length],
      ['Pending reports', reports.filter(r => String(r.status).toLowerCase() === 'pending').length],
    ],
    { columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' } } },
  )

  // Sites table.
  heading('Restoration Sites')
  if (sites.length) {
    grid(
      [['Name', 'Barangay', 'Status', 'Area (ha)', 'Planted (ha)', 'Survival %', 'Est.']],
      sites.map(s => [
        s.name, s.barangay ?? '—', s.status,
        s.area_hectares ?? '—', s.planted_hectares ?? '—',
        s.survival_rate != null ? `${s.survival_rate}%` : '—',
        s.established_year ?? '—',
      ]),
      { columnStyles: { 0: { cellWidth: 42 } } },
    )
  } else {
    ensure(8); doc.setFontSize(9); doc.setTextColor(150, 150, 150)
    doc.text('No sites to display.', MARGIN, getY()); setY(getY() + 8); doc.setTextColor(0, 0, 0)
  }

  // Reports table.
  heading('Reports (Threat & Growth Monitoring)')
  if (reports.length) {
    grid(
      [['Title', 'Category', 'Status', 'Severity', 'Location', 'Reported']],
      reports.map(r => [
        r.title, r.category, r.status, r.severity ?? 'medium',
        r.location_name ?? '—', fmtDate(r.created_at),
      ]),
      { columnStyles: { 0: { cellWidth: 46 } } },
    )
  } else {
    ensure(8); doc.setFontSize(9); doc.setTextColor(150, 150, 150)
    doc.text('No reports to display.', MARGIN, getY()); setY(getY() + 8); doc.setTextColor(0, 0, 0)
  }

  if (reports.length) {
    for (let offset = 0; offset < reports.length; offset += 4) {
      const batch = reports.slice(offset, offset + 4)
      const timelines = await Promise.all(batch.map(async report => {
        try {
          const { data } = await api.get(`/reports/${report.id}/timeline`)
          return data
        } catch {
          return null
        }
      }))

      for (let index = 0; index < batch.length; index++) {
        const report = batch[index]
        const evidence = getReportEvidencePhotos(report, timelines[index])
        if (!evidence.length && timelines[index] !== null) continue
        const title = report.title ?? 'Untitled report'
        heading(`Report #${report.id} · ${title.length > 48 ? `${title.slice(0, 45)}…` : title}`)
        await addPhotoGallery(doc, pageW, getY, setY, ensure, evidence)
        if (timelines[index] === null) {
          const note = 'Monitoring update photos could not be retrieved because the report timeline was unavailable during export.'
          ensure(10)
          doc.setFontSize(8); doc.setTextColor(150, 90, 40)
          doc.text(note, MARGIN, getY())
          setY(getY() + 8); doc.setTextColor(0, 0, 0)
        }
      }
    }
  }

  footer()
  doc.save(`map-data-${todayStr()}.pdf`)
}
