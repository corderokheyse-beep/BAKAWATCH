'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { fetchSites, fetchGeneratedReports, generateReport, exportReport } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import api from '@/lib/api'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { cn, formatDate } from '@/lib/utils'
import type { RestorationSite, GeneratedReport, Report, ReportType, ReportStatus, PaginatedResponse } from '@/lib/types'
import {
  FileText, AlertTriangle, CheckCircle, XCircle, Clock,
  Download, RefreshCw, Search, X, Eye, Leaf,
  TreePine,
  BarChart2, FileDown, History,
} from 'lucide-react'
import toast from 'react-hot-toast'

// --- Types --------------------------------------------------------------------
type PageTab = 'generate' | 'review' | 'history'

interface ReportPreview {
  total_planted: number; total_alive: number; total_dead: number; survival_rate: number
  avg_salinity: number; avg_ph: number; avg_temp: number
  species_breakdown: { species_name: string; count: number }[]
  report_type: string; period?: string; date_from?: string; date_to?: string
  site_name?: string; barangay?: string

  // Nursery-report fields (present only when report_type === 'nursery')
  total_received?: number; total_transferred?: number; total_damaged?: number
  remaining_stock?: number; batch_count?: number
  species_filter?: string | null
  scope?: 'site' | 'municipality'
  nursery_species?: { species_name: string; local_name?: string | null; received: number; transferred: number; damaged: number; remaining: number }[]
  has_stock_composition?: boolean
  stock_composition?: { stage: string; received: number; remaining: number; batches: number }[]
  nursery_sources?: { source: string; received: number; transferred: number; damaged: number; remaining: number }[]
  records?: {
    date_received: string; species_name: string; stage: string
    quantity_received: number; quantity_planted: number; quantity_damaged: number
    source: string; notes?: string | null; recorded_by?: string | null
  }[]
  // Official documentation metadata
  prepared_by?: string; prepared_by_role?: string
  report_ref?: string; generated_at?: string

  // Threat-monitoring report fields
  counts?: {
    total: number; active: number; pending: number; under_review: number; resolved: number
  }
  cases?: {
    id: number; ref: string; title: string; threat_type?: string | null; category?: string
    severity?: string | null; description?: string; location_name?: string | null
    latitude?: number; longitude?: number; date_reported?: string
    reported_by?: string; reporter_role?: string | null; status: string
    before_photo?: string | null; after_photo?: string | null
    updates?: {
      id: number; date?: string; type: string; fields?: Record<string, unknown>
      observation?: string | null; action_taken?: string | null
      latitude?: number | null; longitude?: number | null; updated_by?: string
      photos?: { url: string }[]
    }[]
    timeline?: { date?: string; label?: string; note?: string | null }[]
  }[]
}

interface ThreatStats { total: number; pending: number; approved: number; rejected: number; investigating: number; resolved: number }

const TABS: { key: PageTab; label: string; icon: any }[] = [
  { key: 'generate', label: 'Generate Report', icon: FileText },
  { key: 'review',   label: 'Pending Reports', icon: AlertTriangle },
  { key: 'history',  label: 'Report History',  icon: History },
]

const REPORT_TYPE_LABELS: Record<string, string> = {
  monthly: 'Monthly', lgu: 'LGU', denr: 'DENR', nursery: 'Nursery', threat_monitoring: 'Threat Monitoring',
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

// Builds the nursery-specific PDF sections. All tables repeat their header on
// every page (showHead: 'everyPage') for a professional multi-page layout.
function buildNurseryPdfSections(
  p: ReportPreview,
  heading: (title: string) => void,
  tbl: (head: string[][], body: (string | number)[][], opts?: any) => void,
  remarks?: string,
) {
  const n = (v: number | undefined) => (v ?? 0).toLocaleString()

  // 1. Executive summary — four clear, non-overlapping terms.
  heading('1. Executive Summary — Seedling Inventory')
  tbl([['Metric', 'Quantity', 'Definition']], [
    ['Total Received',   n(p.total_received),    'Seedlings propagated/received'],
    ['Transferred',      n(p.total_transferred), 'Moved to planting sites'],
    ['Damaged',          n(p.total_damaged),     'Lost / non-viable'],
    ['Remaining Stock',  n(p.remaining_stock),   'Currently available'],
    ['Batches Recorded', n(p.batch_count),       'Inventory entries'],
  ], { columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 30, halign: 'right' } } })

  // 2. Stock composition — only when it carries information.
  if (p.has_stock_composition && p.stock_composition && p.stock_composition.length > 0) {
    heading('2. Stock Composition (by stage)')
    const total = p.stock_composition.reduce((a, s) => a + s.received, 0)
    tbl([['Stage', 'Received', 'Remaining', 'Share (%)']], p.stock_composition.map(s => [
      s.stage, s.received.toLocaleString(), s.remaining.toLocaleString(),
      total > 0 ? `${Math.round(s.received / total * 100)}%` : '0%',
    ]), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } })
  }

  // 3. Species inventory — full accounting with a TOTAL row.
  const species = p.nursery_species ?? []
  if (species.length > 0) {
    heading('3. Species Inventory')
    const body: (string | number)[][] = species.map((r, i) => [
      i + 1, r.species_name, r.local_name ?? '—',
      r.received.toLocaleString(), r.transferred.toLocaleString(),
      r.damaged.toLocaleString(), r.remaining.toLocaleString(),
    ])
    body.push([
      '', 'TOTAL', '',
      n(p.total_received), n(p.total_transferred), n(p.total_damaged), n(p.remaining_stock),
    ])
    tbl([['#', 'Species', 'Local Name', 'Received', 'Transferred', 'Damaged', 'Remaining']], body, {
      columnStyles: { 0: { cellWidth: 8 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    })
  }

  // 4. Source nurseries — full accounting.
  if (p.nursery_sources && p.nursery_sources.length > 0) {
    heading('4. Source Nurseries')
    tbl([['Source', 'Received', 'Transferred', 'Damaged', 'Remaining']], p.nursery_sources.map(s => [
      s.source, s.received.toLocaleString(), s.transferred.toLocaleString(),
      s.damaged.toLocaleString(), s.remaining.toLocaleString(),
    ]), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } })
  }

  // 5. Nursery records.
  if (p.records && p.records.length > 0) {
    heading('5. Nursery Records')
    tbl([['Date', 'Species', 'Stage', 'Received', 'Transferred', 'Source']],
      p.records.map(r => [
        String(r.date_received).split('T')[0], r.species_name, r.stage,
        r.quantity_received.toLocaleString(), r.quantity_planted.toLocaleString(), r.source,
      ]), { columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } } })
  }

  // 6. Remarks & recommendations.
  if (remarks && remarks.trim()) {
    heading('6. Remarks & Recommendations')
    tbl([['Remarks']], [[remarks.trim()]])
  }
}

// Draws Prepared / Reviewed / Noted & Approved signature blocks with name,
// position, signature line, and date line. Returns the new Y position.
// (The "Certification" heading was intentionally removed; the blocks remain.)
function drawSignatureBlocks(
  doc: any, preparedBy: string, preparedRole: string, startY: number, pageW: number,
): number {
  let y = startY
  const pageH = doc.internal.pageSize.getHeight()
  if (y > pageH - 62) { doc.addPage(); y = 20 }

  const colW = (pageW - 28) / 3
  const blocks = [
    { role: 'Prepared by:',          name: preparedBy, title: preparedRole },
    { role: 'Reviewed by:',          name: '', title: 'MENRO Officer' },
    { role: 'Noted & Approved by:',  name: '', title: 'Municipal Mayor / MENRO Head' },
  ]
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80)
  blocks.forEach((b, i) => {
    const x = 14 + i * colW
    doc.text(b.role, x, y)
    // signature line
    doc.setDrawColor(120, 120, 120)
    doc.line(x, y + 16, x + colW - 8, y + 16)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
    if (b.name) doc.text(b.name, x, y + 15)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 110)
    doc.setFontSize(7)
    doc.text(b.title, x, y + 20)
    doc.text('Date: ____________', x, y + 26)
    doc.setFontSize(8)
  })
  return y + 34
}

// Builds the monthly Threat Monitoring PDF: summary table + per-case blocks
// (info, side-by-side before/after images, timeline). Async because images
// are fetched and embedded as data URLs.
async function buildThreatMonitoringPdf(
  doc: any, p: ReportPreview, pageW: number, setY: (v: number) => void, getY: () => number,
) {
  const autoTable = (await import('jspdf-autotable')).default
  const pageH = doc.internal.pageSize.getHeight()
  const ensure = (need: number) => { if (getY() + need > pageH - 20) { doc.addPage(); setY(18) } }

  const heading = (title: string) => {
    ensure(10)
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 71, 49)
    doc.text(title, 14, getY()); setY(getY() + 5)
  }

  // Summary
  heading('1. Monthly Summary')
  const c = p.counts
  autoTable(doc, {
    startY: getY(), theme: 'striped', showHead: 'everyPage',
    head: [['Total', 'Pending', 'Under Review', 'Resolved']],
    body: [[c?.total ?? 0, c?.pending ?? 0, c?.under_review ?? 0, c?.resolved ?? 0]],
    headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, halign: 'center' }, margin: { left: 14, right: 14 },
  })
  setY((doc as any).lastAutoTable.finalY + 8)

  const cases = p.cases ?? []
  for (let i = 0; i < cases.length; i++) {
    const cs = cases[i]
    ensure(14)
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 71, 49)
    doc.text(`Case ${i + 1}: ${cs.title}  (${cs.ref})`, 14, getY()); setY(getY() + 5)

    // Case info table
    autoTable(doc, {
      startY: getY(), theme: 'plain',
      body: [
        ['Threat Type', cs.threat_type ?? cs.category ?? '—', 'Severity', cs.severity ?? '—'],
        ['Status', cs.status, 'Date Reported', cs.date_reported ?? '—'],
        ['Reported By', cs.reported_by ?? '—', 'Coordinates', `${cs.latitude ?? '—'}, ${cs.longitude ?? '—'}`],
        ['Location', cs.location_name ?? '—', '', ''],
      ],
      styles: { fontSize: 7.5, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 2: { fontStyle: 'bold', cellWidth: 28 } },
      margin: { left: 14, right: 14 },
    })
    setY((doc as any).lastAutoTable.finalY + 4)

    // Before / After images side by side
    ensure(42)
    const imgW = (pageW - 28 - 8) / 2
    const imgH = 34
    const beforeY = getY()
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235)
    doc.text('BEFORE', 14, beforeY)
    doc.setTextColor(22, 163, 74)
    doc.text('AFTER (latest)', 14 + imgW + 8, beforeY)
    const [before, after] = await Promise.all([
      cs.before_photo ? imageToDataUrl(cs.before_photo) : Promise.resolve(null),
      cs.after_photo  ? imageToDataUrl(cs.after_photo)  : Promise.resolve(null),
    ])
    const boxY = beforeY + 2
    doc.setDrawColor(220, 220, 220)
    doc.rect(14, boxY, imgW, imgH); doc.rect(14 + imgW + 8, boxY, imgW, imgH)
    try { if (before) doc.addImage(before.data, before.fmt, 14, boxY, imgW, imgH) } catch {}
    try { if (after) doc.addImage(after.data, after.fmt, 14 + imgW + 8, boxY, imgW, imgH) } catch {}
    if (!before) { doc.setFontSize(7); doc.setTextColor(160,160,160); doc.text('No photo', 14 + imgW/2, boxY + imgH/2, { align: 'center' }) }
    if (!after)  { doc.setFontSize(7); doc.setTextColor(160,160,160); doc.text('No follow-up photo', 14 + imgW + 8 + imgW/2, boxY + imgH/2, { align: 'center' }) }
    setY(boxY + imgH + 5)

    // Full follow-up update records and every photo attached to each update.
    if (cs.updates?.length) {
      heading('Updates & Photo History')
      for (let updateIndex = 0; updateIndex < cs.updates.length; updateIndex++) {
        const update = cs.updates[updateIndex]
        const updateNumber = cs.updates.length - updateIndex
        const updateLabel = update.type === 'growth_monitoring' ? 'Growth Monitoring' : 'Threat Report Update'
        heading(`Update #${updateNumber} - ${update.date ?? 'Date not recorded'} - ${updateLabel}`)

        const detailRows: string[][] = []
        const fieldLabels: Record<string, string> = {
          threat_status: 'Current threat status / condition',
          area_trend: 'Estimated affected area trend',
          next_step: 'Recommended next step for MENRO',
          period: 'Monitoring interval / period',
          survival_rate: 'Survival rate estimate (%)',
          average_height: 'Average plant height (cm)',
          health: 'Health and growth condition',
          notes: update.type === 'growth_monitoring' ? 'Maintenance and field remarks' : 'Observed changes / field notes',
          maintenance_remarks: 'Maintenance and field remarks',
        }
        for (const [key, value] of Object.entries(update.fields ?? {})) {
          if (value === null || value === undefined || value === '') continue
          detailRows.push([fieldLabels[key] ?? key.replaceAll('_', ' '), String(value)])
        }
        if (update.observation && !detailRows.some(([label]) => label.includes('field notes') || label.includes('remarks'))) {
          detailRows.push(['Observation / field notes', update.observation])
        }
        if (update.action_taken) detailRows.push(['Official action taken', update.action_taken])
        if (update.updated_by) detailRows.push(['Submitted by', update.updated_by])
        if (update.latitude != null && update.longitude != null) {
          detailRows.push(['Update coordinates', `${update.latitude}, ${update.longitude}`])
        }

        if (detailRows.length) {
          autoTable(doc, {
            startY: getY(), theme: 'plain', body: detailRows,
            styles: { fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak' },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 54 }, 1: { cellWidth: 'auto' } },
            margin: { left: 14, right: 14 },
          })
          setY((doc as any).lastAutoTable.finalY + 3)
        }

        const photos = update.photos ?? []
        if (photos.length) {
          doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
          ensure(6); doc.text(`Update photos (${photos.length})`, 14, getY()); setY(getY() + 3)
          const columns = 3
          const photoW = (pageW - 28 - 8) / columns
          const photoH = 29
          for (let photoIndex = 0; photoIndex < photos.length; photoIndex += columns) {
            ensure(photoH + 8)
            const rowY = getY()
            const row = photos.slice(photoIndex, photoIndex + columns)
            for (let column = 0; column < row.length; column++) {
              const photo = row[column]
              const x = 14 + column * (photoW + 4)
              doc.setDrawColor(220, 220, 220)
              doc.rect(x, rowY, photoW, photoH)
              const image = await imageToDataUrl(photo.url)
              try { if (image) doc.addImage(image.data, image.fmt, x, rowY, photoW, photoH) } catch {}
              if (!image) {
                doc.setFontSize(6.5); doc.setTextColor(150, 150, 150)
                doc.text('Photo unavailable', x + photoW / 2, rowY + photoH / 2, { align: 'center' })
              }
              doc.setFontSize(6.5); doc.setTextColor(80, 80, 80)
              doc.text(`Photo ${photoIndex + column + 1}`, x, rowY + photoH + 3)
            }
            setY(rowY + photoH + 7)
          }
        }
      }
    }

    // Activity summary (status changes and short update summaries)
    if (cs.timeline && cs.timeline.length > 0) {
      heading('Status & Activity History')
      autoTable(doc, {
        startY: getY(), theme: 'striped', showHead: 'everyPage',
        head: [['Date', 'Activity', 'Notes']],
        body: cs.timeline.map(t => [t.date ?? '', t.label ?? '', t.note ?? '']),
        headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5 }, margin: { left: 14, right: 14 },
      })
      setY((doc as any).lastAutoTable.finalY + 8)
    }
  }

  // Signature blocks (no "Certification" heading)
  setY(drawSignatureBlocks(doc, p.prepared_by ?? '—', p.prepared_by_role ?? '', getY(), pageW))
}

// Professional header banner with a leaf logo mark, BAKAWATCH title, and a
// MENRO / LGU sub-header line. Returns the Y position below the banner.
function drawReportHeader(doc: any, p: ReportPreview, pageW: number): number {
  doc.setFillColor(26, 71, 49)
  doc.rect(0, 0, pageW, 34, 'F')

  // Simple leaf logo mark (vector) so no external image asset is required.
  doc.setFillColor(255, 255, 255)
  doc.circle(20, 15, 7, 'F')
  doc.setFillColor(26, 71, 49)
  doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('BW', 20, 17.5, { align: 'center' })

  const titleMap: Record<string, string> = {
    nursery: 'Nursery Management Report',
    threat_monitoring: 'Mangrove Threat Monitoring Report',
  }
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text(`BAKAWATCH — ${titleMap[p.report_type] ?? 'Mangrove Report'}`, 32, 12)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('Municipal Environment & Natural Resources Office (MENRO) · LGU Gloria, Oriental Mindoro', 32, 18)

  const scope = p.scope === 'site' && p.site_name ? `Site: ${p.site_name}` : 'Scope: Municipality-wide (all sites)'
  const periodStr = p.date_from && p.date_to ? `${String(p.date_from).split('T')[0]} – ${String(p.date_to).split('T')[0]}`
    : p.period ? `Period: ${p.period}` : 'Period: All records'
  doc.setFontSize(7.5)
  doc.text(`${scope}  ·  ${periodStr}  ·  Generated: ${new Date().toLocaleString()}`, 32, 24)
  if (p.report_ref) doc.text(`Ref: ${p.report_ref}`, 32, 29)
  return 42
}

// Professional footer on every page: reference number (left), page X of Y
// (center), org line (right).
function drawReportFooter(doc: any, reportRef: string, pageW: number) {
  const pages = doc.internal.getNumberOfPages()
  const pageH = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(220, 220, 220)
    doc.line(14, pageH - 12, pageW - 14, pageH - 12)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150)
    if (reportRef) doc.text(`Ref: ${reportRef}`, 14, pageH - 7)
    doc.text(`Page ${i} of ${pages}`, pageW / 2, pageH - 7, { align: 'center' })
    doc.text('BAKAWATCH · MENRO Gloria, Oriental Mindoro', pageW - 14, pageH - 7, { align: 'right' })
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  damage:      'text-red-600 bg-red-50 border-red-200',
  pollution:   'text-orange-600 bg-orange-50 border-orange-200',
  wildlife:    'text-blue-600 bg-blue-50 border-blue-200',
  restoration: 'text-green-600 bg-green-50 border-green-200',
  other:       'text-gray-600 bg-gray-50 border-gray-200',
}

export default function MangroveReportsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const canReviewThreats = user?.role === 'menro'

  // -- Tab ------------------------------------------------------------------
  const [tab, setTab] = useState<PageTab>('generate')

  // -- Sites & generated reports ---------------------------------------------
  const [sites, setSites]       = useState<RestorationSite[]>([])
  const [history, setHistory]   = useState<(GeneratedReport & { site?: { id: number; name: string } })[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [reportHistory, setReportHistory] = useState<PaginatedResponse<Report> | null>(null)
  const [reportHistoryPage, setReportHistoryPage] = useState(1)
  const [reportHistoryLoading, setReportHistoryLoading] = useState(false)

  // -- Generate form ---------------------------------------------------------
  const [reportType, setReportType] = useState<ReportType>('monthly')
  const [siteId, setSiteId]         = useState('')
  const [period, setPeriod]         = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [speciesName, setSpeciesName] = useState('')
  const [speciesOptions, setSpeciesOptions] = useState<{ scientific_name: string; local_name?: string | null }[]>([])
  const [nurseryRemarks, setNurseryRemarks] = useState('')
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview]       = useState<ReportPreview | null>(null)
  const [generatedId, setGeneratedId] = useState<number | null>(null)
  const [exporting, setExporting]   = useState<'csv' | 'pdf' | null>(null)
  const [genError, setGenError]     = useState('')

  // -- Review queue ----------------------------------------------------------
  const [threats, setThreats]         = useState<PaginatedResponse<Report> | null>(null)
  const [threatPage, setThreatPage]   = useState(1)
  const [threatSearch, setThreatSearch] = useState('')
  const [threatCategory, setThreatCategory] = useState('')
  const [threatDateFrom, setThreatDateFrom] = useState('')
  const [threatDateTo, setThreatDateTo]     = useState('')
  const [threatLoading, setThreatLoading]   = useState(false)
  const [threatStatusFilter, setThreatStatusFilter] = useState('')
  const [reviewingId, setReviewingId]       = useState<number | null>(null)
  const [noteModal, setNoteModal]           = useState<{ report: Report; action: ReportStatus } | null>(null)
  const [noteText, setNoteText]             = useState('')
  const [stats, setStats]                   = useState<ThreatStats | null>(null)
  const [expandedId, setExpandedId]         = useState<number | null>(null)

  // -- History ---------------------------------------------------------------
  const [downloading, setDownloading] = useState<number | null>(null)

  // -- Auth guard ------------------------------------------------------------
  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (user.role === 'admin') { router.replace('/admin/reports'); return }
    if (user.role !== 'menro' && user.role !== 'staff') { setLoadingInit(false); return }

    Promise.all([fetchSites(), fetchGeneratedReports()])
      .then(([s, r]) => { setSites(s); setHistory(r as any) })
      .catch(() => {})
      .finally(() => setLoadingInit(false))

    // Species list for the nursery report's optional species filter.
    api.get('/species')
      .then(({ data }) => {
        const list = (data?.data ?? data ?? []) as any[]
        setSpeciesOptions(list.map(s => ({ scientific_name: s.scientific_name, local_name: s.local_name })))
      })
      .catch(() => {})
  }, [user, authLoading, router])

  // -- Load threat stats -----------------------------------------------------
  useEffect(() => {
    if (!user || (user.role !== 'menro' && user.role !== 'staff')) return
    Promise.all([
      api.get('/reports', { params: { status: 'pending',       per_page: 1 } }),
      api.get('/reports', { params: { status: 'under_review', per_page: 1 } }),
      api.get('/reports', { params: { status: 'resolved',      per_page: 1 } }),
      api.get('/reports', { params: { per_page: 1 } }),
    ]).then(([p, inv, res, t]) => {
      setStats({
        pending:       p.data.total,
        investigating: inv.data.total,
        resolved:      res.data.total,
        approved:      res.data.total,
        rejected:      0,
        total:         t.data.total,
      })
    }).catch(() => {})
  }, [user])

  // -- Load review queue -----------------------------------------------------
  const loadThreats = useCallback(async () => {
    setThreatLoading(true)
    try {
      const { data } = await api.get('/reports', {
        params: {
          page: threatPage,
          per_page: 10,
          search: threatSearch || undefined,
          status: threatStatusFilter || undefined,
          category: threatCategory || undefined,
          date_from: threatDateFrom || undefined,
          date_to: threatDateTo || undefined,
        },
      })
      setThreats(data)
    } catch { toast.error('Failed to load reports.') }
    finally { setThreatLoading(false) }
  }, [threatPage, threatSearch, threatStatusFilter, threatCategory, threatDateFrom, threatDateTo])

  const loadReportHistory = useCallback(async () => {
    setReportHistoryLoading(true)
    try {
      const { data } = await api.get<PaginatedResponse<Report>>('/reports', {
        params: { page: reportHistoryPage, per_page: 10 },
      })
      setReportHistory(data)
    } catch {
      toast.error('Failed to load report history.')
    } finally {
      setReportHistoryLoading(false)
    }
  }, [reportHistoryPage])

  useEffect(() => {
    if (tab === 'review' && user && (user.role === 'menro' || user.role === 'staff')) {
      loadThreats()
    }
  }, [tab, loadThreats, user])

  useEffect(() => {
    if (tab === 'history' && user && (user.role === 'menro' || user.role === 'staff')) {
      loadReportHistory()
    }
  }, [tab, loadReportHistory, user])

  // -- Generate report -------------------------------------------------------
  const handleGenerate = async () => {
    setGenerating(true); setGenError(''); setPreview(null); setGeneratedId(null)
    try {
      const payload: any = { report_type: reportType }
      if (reportType === 'monthly') {
        if (siteId) payload.site_id = Number(siteId)
        if (period) payload.year_month = period
      } else if (reportType === 'lgu') {
        if (dateFrom) payload.date_from = dateFrom
        if (dateTo)   payload.date_to   = dateTo
      } else if (reportType === 'denr') {
        if (siteId) payload.site_id = Number(siteId)
        if (dateFrom) payload.date_from = dateFrom
        if (dateTo)   payload.date_to   = dateTo
      } else if (reportType === 'nursery') {
        if (siteId) payload.site_id = Number(siteId)
        if (period) payload.year_month = period
        if (dateFrom) payload.date_from = dateFrom
        if (dateTo)   payload.date_to   = dateTo
        if (speciesName) payload.species_name = speciesName
      } else if (reportType === 'threat_monitoring') {
        if (period) payload.year_month = period
        if (dateFrom) payload.date_from = dateFrom
        if (dateTo)   payload.date_to   = dateTo
      }
      const data = await generateReport(payload)
      const report = data.report
      // The nursery per-species list arrives under `species_breakdown` with a
      // richer shape; expose it as `nursery_species` for the preview/PDF.
      if (report?.report_type === 'nursery') {
        report.nursery_species = report.species_breakdown ?? []
      }
      setPreview(report)
      setGeneratedId(data.generated?.id ?? null)
      // Refresh history
      fetchGeneratedReports().then(r => setHistory(r as any)).catch(() => {})
      toast.success('Report generated.')
    } catch (err: any) {
      const msg = err?.response?.data?.message
        ?? Object.values(err?.response?.data?.errors ?? {}).flat().join(' ')
        ?? 'Failed to generate report.'
      setGenError(String(msg))
    } finally { setGenerating(false) }
  }

  // -- Export CSV ------------------------------------------------------------
  const handleExportCSV = async () => {
    if (!generatedId) return
    setExporting('csv')
    try {
      await exportReport(generatedId, `report-${reportType}-${generatedId}.csv`)
      toast.success('CSV downloaded.')
    } catch { toast.error('Export failed.') }
    finally { setExporting(null) }
  }

  // -- Export PDF ------------------------------------------------------------
  const handleExportPDF = async () => {
    if (!preview) return
    setExporting('pdf')
    try {
      const { jsPDF }  = await import('jspdf')
      const autoTable  = (await import('jspdf-autotable')).default
      const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW      = doc.internal.pageSize.getWidth()
      let y            = 15

      // -- Header banner --------------------------------------------------
      if (preview.report_type === 'nursery' || preview.report_type === 'threat_monitoring') {
        y = drawReportHeader(doc, preview, pageW)
      } else {
        doc.setFillColor(26, 71, 49)
        doc.rect(0, 0, pageW, 30, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(15); doc.setFont('helvetica', 'bold')
        doc.text('BAKAWATCH — Mangrove Restoration Report', 14, 13)
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
        const typeLabel = REPORT_TYPE_LABELS[preview.report_type] ?? preview.report_type
        const periodStr = preview.period
          ? `Period: ${preview.period}`
          : preview.date_from ? `${preview.date_from} – ${preview.date_to}` : ''
        doc.text(`Type: ${typeLabel}${preview.site_name ? '  ·  Site: ' + preview.site_name : ''}`, 14, 21)
        doc.text(`${periodStr}  |  Generated: ${new Date().toLocaleString()}`, 14, 27)
        y = 38
      }

      const heading = (title: string) => {
        if (y > 260) { doc.addPage(); y = 15 }
        doc.setFontSize(10); doc.setFont('helvetica', 'bold')
        doc.setTextColor(26, 71, 49)
        doc.text(title, 14, y); y += 5
      }

      const tbl = (head: string[][], body: (string | number)[][], opts?: any) => {
        autoTable(doc, {
          startY: y, head, body, theme: 'striped',
          showHead: 'everyPage',   // repeat header on page breaks
          headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          margin: { left: 14, right: 14 },
          ...opts,
        })
        y = (doc as any).lastAutoTable.finalY + 7
      }

      if (preview.report_type === 'threat_monitoring') {
        await buildThreatMonitoringPdf(doc, preview, pageW, (v: number) => { y = v }, () => y)
        drawReportFooter(doc, preview.report_ref ?? '', pageW)
      } else if (preview.report_type === 'nursery') {
        buildNurseryPdfSections(preview, heading, tbl, nurseryRemarks)
        y = drawSignatureBlocks(doc, preview.prepared_by ?? user?.name ?? '—', preview.prepared_by_role ?? '', y, pageW)
        drawReportFooter(doc, preview.report_ref ?? '', pageW)
      } else {
      // 1. Summary
      heading('1. Plantation Summary')
      tbl([['Metric', 'Value']], [
        ['Total Planted',  preview.total_planted],
        ['Total Alive',    preview.total_alive],
        ['Total Dead',     preview.total_dead],
        ['Survival Rate',  `${preview.survival_rate}%`],
      ], { columnStyles: { 0: { cellWidth: 80 } } })

      // 2. Species breakdown
      if (preview.species_breakdown?.length > 0) {
        heading('2. Species Breakdown')
        const total = preview.species_breakdown.reduce((a, r) => a + r.count, 0)
        tbl(
          [['#', 'Species', 'Count', 'Share (%)']],
          preview.species_breakdown.map((row, i) => [
            i + 1,
            row.species_name,
            row.count,
            total > 0 ? `${Math.round(row.count / total * 100)}%` : '0%',
          ])
        )
      }

      // Footer (plantation reports)
      const pages = (doc as any).internal.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFontSize(7); doc.setTextColor(160, 160, 160)
        doc.text(
          `BAKAWATCH · Gloria, Oriental Mindoro · Page ${i} of ${pages}`,
          pageW / 2, doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        )
      }
      }

      const filename = `report-${preview.report_type}${preview.site_name ? '-' + preview.site_name.replace(/\s+/g, '-') : ''}-${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(filename)
      toast.success('PDF downloaded.')
    } catch (err) {
      console.error(err)
      toast.error('PDF export failed.')
    } finally { setExporting(null) }
  }

  // -- History PDF export ----------------------------------------------------
  const [downloadingPdf, setDownloadingPdf] = useState<number | null>(null)

  const handleHistoryDownloadPDF = async (r: GeneratedReport & { site?: { id: number; name: string } }) => {
    setDownloadingPdf(r.id)
    try {
      // Re-generate the report data then build PDF
      const payload: any = { report_type: r.report_type }
      if (r.restoration_site_id) payload.site_id = r.restoration_site_id
      if (r.date_from) payload.date_from = String(r.date_from).split('T')[0]
      if (r.date_to)   payload.date_to   = String(r.date_to).split('T')[0]
      const data = await generateReport(payload)
      const p: ReportPreview = data.report

      const { jsPDF }  = await import('jspdf')
      const autoTable  = (await import('jspdf-autotable')).default
      const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW      = doc.internal.pageSize.getWidth()
      let y            = 15

      const typeLabel = REPORT_TYPE_LABELS[r.report_type] ?? r.report_type
      const siteName  = r.site?.name ?? (r.restoration_site_id ? `Site #${r.restoration_site_id}` : 'All sites')

      if (p.report_type === 'nursery' || p.report_type === 'threat_monitoring') {
        y = drawReportHeader(doc, p, pageW)
      } else {
        doc.setFillColor(26, 71, 49)
        doc.rect(0, 0, pageW, 30, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(15); doc.setFont('helvetica', 'bold')
        doc.text('BAKAWATCH — Mangrove Restoration Report', 14, 13)
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
        const periodStr = r.date_from && r.date_to
          ? `${String(r.date_from).split('T')[0]} – ${String(r.date_to).split('T')[0]}`
          : p.period ? `Period: ${p.period}` : ''
        doc.text(`Type: ${typeLabel}  ·  Site: ${siteName}`, 14, 21)
        doc.text(`${periodStr}  |  Generated: ${new Date().toLocaleString()}`, 14, 27)
        y = 38
      }

      const heading = (title: string) => {
        if (y > 260) { doc.addPage(); y = 15 }
        doc.setFontSize(10); doc.setFont('helvetica', 'bold')
        doc.setTextColor(26, 71, 49)
        doc.text(title, 14, y); y += 5
      }
      const tbl = (head: string[][], body: (string | number)[][], opts?: any) => {
        autoTable(doc, {
          startY: y, head, body, theme: 'striped',
          showHead: 'everyPage',
          headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          margin: { left: 14, right: 14 }, ...opts,
        })
        y = (doc as any).lastAutoTable.finalY + 7
      }

      if (p.report_type === 'threat_monitoring') {
        await buildThreatMonitoringPdf(doc, p, pageW, (v: number) => { y = v }, () => y)
        drawReportFooter(doc, p.report_ref ?? '', pageW)
      } else if (p.report_type === 'nursery') {
        // nursery payload arrives with per-species list under species_breakdown
        if (p.species_breakdown) (p as any).nursery_species = p.species_breakdown
        buildNurseryPdfSections(p, heading, tbl)
        y = drawSignatureBlocks(doc, p.prepared_by ?? user?.name ?? '—', p.prepared_by_role ?? '', y, pageW)
        drawReportFooter(doc, p.report_ref ?? '', pageW)
      } else {
      heading('1. Plantation Summary')
      tbl([['Metric', 'Value']], [
        ['Total Planted', p.total_planted], ['Total Alive', p.total_alive],
        ['Total Dead', p.total_dead], ['Survival Rate', `${p.survival_rate}%`],
      ], { columnStyles: { 0: { cellWidth: 80 } } })

      if (p.species_breakdown?.length > 0) {
        heading('2. Species Breakdown')
        const total = p.species_breakdown.reduce((a, x) => a + x.count, 0)
        tbl([['#', 'Species', 'Count', 'Share (%)']], p.species_breakdown.map((row, i) => [
          i + 1, row.species_name, row.count,
          total > 0 ? `${Math.round(row.count / total * 100)}%` : '0%',
        ]))
      }

      const pages = (doc as any).internal.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFontSize(7); doc.setTextColor(160, 160, 160)
        doc.text(`BAKAWATCH · Gloria, Oriental Mindoro · Page ${i} of ${pages}`,
          pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
      }
      }

      doc.save(`report-${r.report_type}-${r.id}.pdf`)
      toast.success('PDF downloaded.')
    } catch (err) {
      console.error(err)
      toast.error('PDF export failed.')
    } finally { setDownloadingPdf(null) }
  }

  const handleHistoryDownload = async (r: GeneratedReport) => {
    setDownloading(r.id)
    try {
      await exportReport(r.id, `report-${r.report_type}-${r.id}.csv`)
      toast.success('Downloaded.')
    } catch { toast.error('Download failed.') }
    finally { setDownloading(null) }
  }

  // -- Review actions --------------------------------------------------------
  // Immediately apply a status without showing the modal
  const applyReviewImmediate = (report: Report, status: ReportStatus) => {
    setReviewingId(report.id)
    api.patch(`/reports/${report.id}/review`, { status })
      .then(() => {
        const label = status.replace('_', ' ')
        toast.success(`Report marked as ${label}.`)
        loadThreats()
        Promise.all([
          api.get('/reports', { params: { status: 'pending',       per_page: 1 } }),
          api.get('/reports', { params: { status: 'under_review', per_page: 1 } }),
          api.get('/reports', { params: { status: 'resolved',      per_page: 1 } }),
          api.get('/reports', { params: { per_page: 1 } }),
        ]).then(([p, inv, res, t]) => setStats({
          pending: p.data.total, investigating: inv.data.total, resolved: res.data.total,
          approved: res.data.total, rejected: 0, total: t.data.total,
        })).catch(() => {})
      })
      .catch(() => toast.error('Failed to update report.'))
      .finally(() => setReviewingId(null))
  }

  const openReview = (report: Report, action: ReportStatus) => {
    // Resolved can be applied immediately.
    if (action === 'resolved') {
      applyReviewImmediate(report, action)
      return
    }
    // Pending and Under Review include an optional note.
    setNoteModal({ report, action })
    setNoteText('')
  }

  const submitReview = async () => {
    if (!noteModal) return
    setReviewingId(noteModal.report.id)
    try {
      await api.patch(`/reports/${noteModal.report.id}/review`, {
        status: noteModal.action,
        action_taken: noteText || undefined,
      })
      toast.success(`Report marked as ${
        noteModal.action.replace('_', ' ')
      }.`)
      setNoteModal(null)
      setNoteText('')
      loadThreats()
      // Refresh stats
      Promise.all([
        api.get('/reports', { params: { status: 'pending',       per_page: 1 } }),
        api.get('/reports', { params: { status: 'under_review', per_page: 1 } }),
        api.get('/reports', { params: { status: 'resolved',      per_page: 1 } }),
        api.get('/reports', { params: { per_page: 1 } }),
      ]).then(([p, inv, res, t]) => setStats({
        pending: p.data.total, investigating: inv.data.total, resolved: res.data.total,
        approved: res.data.total, rejected: 0, total: t.data.total,
      })).catch(() => {})
    } catch { toast.error('Review failed.') }
    finally { setReviewingId(null) }
  }

  // -- Guards ----------------------------------------------------------------
  if (authLoading || loadingInit) return (
    <SidebarLayout title="Reports">
      <div className="page-container flex items-center justify-center py-24"><LoadingSpinner /></div>
    </SidebarLayout>
  )
  if (!user) return null
  if (user.role !== 'menro' && user.role !== 'staff') return (
    <SidebarLayout>
      <div className="page-container flex items-center justify-center py-24">
        <p className="text-gray-500">Access denied.</p>
      </div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="Reports" subtitle="Mangrove Monitoring Reports">
      <div className="page-container space-y-6">

        {/* -- Header -------------------------------------------------------- */}
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            Mangrove Reports
          </h1>
          <p className="page-subtitle">Generate restoration reports, review community threat submissions, and track report history.</p>
        </div>

        {/* -- Stat cards ---------------------------------------------------- */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
            <StatCard title="Total Reports"   value={stats.total}         icon={FileText}    color="text-blue-600"   bgColor="bg-blue-50"   accentClass="border-l-4 border-blue-400" />
            <StatCard title="Pending"         value={stats.pending}       icon={Clock}       color="text-amber-600"  bgColor="bg-amber-50"  accentClass="border-l-4 border-amber-400" />
            <StatCard title="Under Review"   value={stats.investigating}              icon={Eye}         color="text-blue-600"   bgColor="bg-blue-50"   accentClass="border-l-4 border-blue-500" />
            <StatCard title="Resolved"        value={stats.approved + stats.resolved}  icon={CheckCircle} color="text-green-600"  bgColor="bg-green-50"  accentClass="border-l-4 border-green-400" />
            <StatCard title="Rejected"        value={stats.rejected}      icon={XCircle}     color="text-red-600"    bgColor="bg-red-50"    accentClass="border-l-4 border-red-400" />
          </div>
        )}

        {/* -- Tabs ---------------------------------------------------------- */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all duration-150 border-b-2 -mb-px',
                  tab === key
                    ? 'border-primary-600 text-primary-700 bg-primary-50/40'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/60'
                )}>
                <Icon className="w-4 h-4" />
                {label}
                {key === 'review' && stats?.pending ? (
                  <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {stats.pending}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-6">
            {/* -- GENERATE TAB ---------------------------------------------- */}
            {tab === 'generate' && (
              <div className="space-y-6 animate-fade-in">

                {/* Form */}
                {(() => { const rt: string = reportType; return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Report Type</label>
                    <select className="input" value={reportType}
                      onChange={e => { setReportType(e.target.value as ReportType); setPreview(null); setGeneratedId(null) }}>
                      <option value="monthly">Monthly — Site survival & species</option>
                      <option value="lgu">LGU — Municipality-wide summary</option>
                      <option value="denr">DENR — Site compliance report</option>
                      <option value="nursery">Nursery — Seedling inventory & readiness</option>
                      <option value="threat_monitoring">Threat Monitoring — Cases & before/after</option>
                    </select>
                  </div>

                  {(rt === 'monthly' || rt === 'denr' || rt === 'nursery') && (
                    <div>
                      <label className="label">
                        {rt === 'nursery' ? 'Nursery Site (optional)' : `Site ${rt === 'monthly' ? '(optional)' : '(required)'}`}
                      </label>
                      <select className="input" value={siteId} onChange={e => setSiteId(e.target.value)}>
                        <option value="">All sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}

                  {(rt === 'monthly' || rt === 'nursery' || rt === 'threat_monitoring') && (
                    <div>
                      <label className="label">Month (YYYY-MM){rt === 'monthly' ? '' : ' (optional)'}</label>
                      <input type="month" className="input" value={period} onChange={e => setPeriod(e.target.value)} />
                    </div>
                  )}

                  {rt === 'nursery' && (
                    <div>
                      <label className="label">Species Filter (optional)</label>
                      <select className="input" value={speciesName} onChange={e => setSpeciesName(e.target.value)}>
                        <option value="">All species</option>
                        {speciesOptions.map(s => (
                          <option key={s.scientific_name} value={s.scientific_name}>
                            {s.scientific_name}{s.local_name ? ` (${s.local_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(rt === 'lgu' || rt === 'denr' || rt === 'nursery') && (
                    <>
                      <div>
                        <label className="label">Date From{rt === 'nursery' ? ' (optional)' : ''}</label>
                        <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Date To{rt === 'nursery' ? ' (optional)' : ''}</label>
                        <input type="date" className="input" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
                ) })()}

                {genError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    <XCircle className="w-4 h-4 shrink-0" /> {genError}
                  </div>
                )}

                <div className="flex gap-3">
                  {(() => {
                    // Required-field gating per report type.
                    const canGenerate =
                      reportType === 'denr' ? Boolean(siteId && dateFrom && dateTo)
                      : reportType === 'lgu' ? Boolean(dateFrom && dateTo)
                      : true // monthly & nursery have no hard-required fields
                    return (
                  <button onClick={handleGenerate} disabled={generating || !canGenerate} className="btn-primary gap-2">
                    <RefreshCw className={cn('w-4 h-4', generating && 'animate-spin')} />
                    {generating ? 'Generating…' : 'Generate Report'}
                  </button>
                    )
                  })()}
                  {generatedId && (
                    <button onClick={handleExportCSV} disabled={exporting !== null} className="btn-secondary gap-2">
                      <FileDown className="w-4 h-4" />
                      {exporting === 'csv' ? 'Downloading…' : 'Export CSV'}
                    </button>
                  )}
                  {preview && (
                    <button onClick={handleExportPDF} disabled={exporting !== null} className="btn-secondary gap-2">
                      <Download className="w-4 h-4" />
                      {exporting === 'pdf' ? 'Generating PDF…' : 'Export PDF'}
                    </button>
                  )}
                </div>

                {/* -- Preview panel ---------------------------------------- */}
                {preview && (
                  <div className="space-y-5 animate-fade-in">
                    {/* Report header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-800">
                          {REPORT_TYPE_LABELS[preview.report_type] ?? preview.report_type} Report Preview
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {preview.period
                            ? `Period: ${preview.period}`
                            : preview.date_from
                              ? `${preview.date_from} – ${preview.date_to}`
                              : ''}
                          {preview.site_name ? ` · ${preview.site_name}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Generated
                      </span>
                    </div>

                    {/* ───────── THREAT MONITORING PREVIEW ───────── */}
                    {preview.report_type === 'threat_monitoring' ? (
                      <>
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Monthly Summary — {preview.period}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                              { label: 'Total', value: preview.counts?.total ?? 0, color: 'bg-gray-50 text-gray-700 border-gray-200' },
                              { label: 'Pending', value: preview.counts?.pending ?? 0, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                              { label: 'Under Review', value: preview.counts?.under_review ?? 0, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                              { label: 'Resolved', value: preview.counts?.resolved ?? 0, color: 'bg-teal-50 text-teal-700 border-teal-200' },
                            ].map(c => (
                              <div key={c.label} className={cn('rounded-xl p-3 border', c.color)}>
                                <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">{c.label}</p>
                                <p className="text-xl font-bold tabular-nums">{c.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {preview.cases && preview.cases.length > 0 ? (
                          <div className="space-y-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Monitored Cases ({preview.cases.length})</p>
                            {preview.cases.map(c => (
                              <div key={c.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-900 text-sm">{c.title}</p>
                                    <p className="font-mono text-[11px] text-gray-400">{c.ref}</p>
                                  </div>
                                  <Badge label={c.status} type="status" />
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
                                  <div><span className="text-gray-400">Threat:</span> {c.threat_type ?? c.category ?? '—'}</div>
                                  <div><span className="text-gray-400">Severity:</span> {c.severity ?? '—'}</div>
                                  <div><span className="text-gray-400">Location:</span> {c.location_name ?? '—'}</div>
                                  <div><span className="text-gray-400">Reported:</span> {c.date_reported}</div>
                                </div>
                                {/* Before / After */}
                                <div className="grid grid-cols-2 gap-3">
                                  <figure className="rounded-lg border border-gray-200 overflow-hidden">
                                    <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                                      {c.before_photo ? <img src={c.before_photo} alt="before" className="w-full h-full object-cover" /> : <span className="text-[10px] text-gray-400">No photo</span>}
                                    </div>
                                    <figcaption className="px-2 py-1 text-[10px] font-bold text-blue-600 uppercase">Before · {c.date_reported}</figcaption>
                                  </figure>
                                  <figure className="rounded-lg border border-gray-200 overflow-hidden">
                                    <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                                      {c.after_photo ? <img src={c.after_photo} alt="after" className="w-full h-full object-cover" /> : <span className="text-[10px] text-gray-400">No follow-up photo</span>}
                                    </div>
                                    <figcaption className="px-2 py-1 text-[10px] font-bold text-green-600 uppercase">Latest monitoring</figcaption>
                                  </figure>
                                </div>
                                {c.timeline && c.timeline.length > 0 && (
                                  <ol className="text-xs text-gray-600 space-y-1 border-l-2 border-gray-100 pl-3">
                                    {c.timeline.map((t, i) => (
                                      <li key={i}><span className="text-gray-400">{t.date}</span> — {t.label}{t.note ? ` (${t.note})` : ''}</li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No threat cases in this period.</p>
                        )}
                      </>
                    ) : preview.report_type === 'nursery' ? (
                      <>
                        {/* Scope + reference */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn('inline-flex items-center gap-1 font-semibold px-2.5 py-1 rounded-full border',
                            preview.scope === 'site' ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-blue-50 text-blue-700 border-blue-200')}>
                            {preview.scope === 'site' ? `Site-specific · ${preview.site_name}` : 'Municipality-wide (all sites)'}
                          </span>
                          {preview.report_ref && (
                            <span className="font-mono text-gray-400">Ref: {preview.report_ref}</span>
                          )}
                        </div>

                        {/* Executive summary — four clear, non-overlapping terms */}
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Executive Summary</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { label: 'Received',     value: preview.total_received ?? 0,    color: 'bg-green-50 text-green-700 border-green-200', icon: Leaf,       hint: 'Propagated into nursery' },
                              { label: 'Transferred',  value: preview.total_transferred ?? 0, color: 'bg-blue-50 text-blue-700 border-blue-200',   icon: TreePine,   hint: 'Moved to planting sites' },
                              { label: 'Damaged',      value: preview.total_damaged ?? 0,     color: 'bg-red-50 text-red-700 border-red-200',       icon: XCircle,    hint: 'Lost / non-viable' },
                              { label: 'Remaining Stock', value: preview.remaining_stock ?? 0, color: 'bg-amber-50 text-amber-700 border-amber-200', icon: BarChart2, hint: 'Available now' },
                            ].map(({ label, value, color, icon: Icon, hint }) => (
                              <div key={label} className={cn('rounded-xl p-3.5 border', color)}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Icon className="w-3.5 h-3.5 opacity-70" />
                                  <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">{label}</p>
                                </div>
                                <p className="text-2xl font-bold tabular-nums">{(value as number).toLocaleString()}</p>
                                <p className="text-[10px] opacity-60 mt-0.5">{hint}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-2">
                            Reconciliation: Received = Transferred + Damaged + Remaining
                            {' '}({(preview.total_received ?? 0).toLocaleString()} = {(preview.total_transferred ?? 0).toLocaleString()} + {(preview.total_damaged ?? 0).toLocaleString()} + {(preview.remaining_stock ?? 0).toLocaleString()})
                            {' · '}{preview.batch_count ?? 0} batch{(preview.batch_count ?? 0) === 1 ? '' : 'es'}
                          </p>
                        </div>

                        {/* Stock composition (only when more than one stage exists) */}
                        {preview.has_stock_composition && preview.stock_composition && preview.stock_composition.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Stock Composition (by stage)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {preview.stock_composition.map(st => {
                                const total = preview.stock_composition!.reduce((a, s) => a + s.received, 0)
                                const pct = total > 0 ? Math.round(st.received / total * 100) : 0
                                return (
                                  <div key={st.stage} className="rounded-xl p-3.5 border border-gray-200 bg-gray-50">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide capitalize">{st.stage}</p>
                                    <p className="text-lg font-bold text-gray-800 tabular-nums">{st.received.toLocaleString()} <span className="text-xs font-normal text-gray-400">({pct}%)</span></p>
                                    <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Species inventory — full breakdown with totals */}
                        {preview.nursery_species && preview.nursery_species.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Species Inventory</p>
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="table-header">Species</th>
                                    <th className="table-header text-right">Received</th>
                                    <th className="table-header text-right">Transferred</th>
                                    <th className="table-header text-right">Damaged</th>
                                    <th className="table-header text-right">Remaining</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {preview.nursery_species.map((row, i) => (
                                    <tr key={row.species_name} className="hover:bg-gray-50/70">
                                      <td className="table-cell">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-300 font-mono w-5">{i + 1}</span>
                                          <span>
                                            <span className="italic text-gray-700">{row.species_name}</span>
                                            {row.local_name && <span className="text-gray-400 not-italic"> · {row.local_name}</span>}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="table-cell text-right tabular-nums text-gray-800">{row.received.toLocaleString()}</td>
                                      <td className="table-cell text-right tabular-nums text-blue-600">{row.transferred.toLocaleString()}</td>
                                      <td className="table-cell text-right tabular-nums text-red-500">{row.damaged.toLocaleString()}</td>
                                      <td className="table-cell text-right font-bold tabular-nums text-primary-700">{row.remaining.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                                    <td className="table-cell text-gray-700">TOTAL</td>
                                    <td className="table-cell text-right tabular-nums text-gray-800">{(preview.total_received ?? 0).toLocaleString()}</td>
                                    <td className="table-cell text-right tabular-nums text-blue-700">{(preview.total_transferred ?? 0).toLocaleString()}</td>
                                    <td className="table-cell text-right tabular-nums text-red-600">{(preview.total_damaged ?? 0).toLocaleString()}</td>
                                    <td className="table-cell text-right tabular-nums text-primary-700">{(preview.remaining_stock ?? 0).toLocaleString()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Source nurseries — full breakdown */}
                        {preview.nursery_sources && preview.nursery_sources.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Source Nurseries</p>
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="table-header">Source</th>
                                    <th className="table-header text-right">Received</th>
                                    <th className="table-header text-right">Transferred</th>
                                    <th className="table-header text-right">Damaged</th>
                                    <th className="table-header text-right">Remaining</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {preview.nursery_sources.map(n => (
                                    <tr key={n.source} className="hover:bg-gray-50/70">
                                      <td className="table-cell text-gray-700">{n.source}</td>
                                      <td className="table-cell text-right tabular-nums text-gray-800">{n.received.toLocaleString()}</td>
                                      <td className="table-cell text-right tabular-nums text-blue-600">{n.transferred.toLocaleString()}</td>
                                      <td className="table-cell text-right tabular-nums text-red-500">{n.damaged.toLocaleString()}</td>
                                      <td className="table-cell text-right font-bold tabular-nums text-primary-700">{n.remaining.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Nursery records */}
                        {preview.records && preview.records.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Nursery Records ({preview.records.length})</p>
                            <div className="overflow-x-auto rounded-xl border border-gray-200 max-h-72 overflow-y-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="table-header">Date</th>
                                    <th className="table-header">Species</th>
                                    <th className="table-header">Stage</th>
                                    <th className="table-header text-right">Received</th>
                                    <th className="table-header text-right">Transferred</th>
                                    <th className="table-header">Source</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {preview.records.map((r, i) => (
                                    <tr key={i} className="hover:bg-gray-50/70">
                                      <td className="table-cell text-gray-500 whitespace-nowrap">{String(r.date_received).split('T')[0]}</td>
                                      <td className="table-cell italic text-gray-700">{r.species_name}</td>
                                      <td className="table-cell capitalize text-gray-600">{r.stage}</td>
                                      <td className="table-cell text-right tabular-nums text-gray-800">{r.quantity_received.toLocaleString()}</td>
                                      <td className="table-cell text-right tabular-nums text-blue-600">{r.quantity_planted.toLocaleString()}</td>
                                      <td className="table-cell text-gray-500">{r.source}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Remarks & recommendations (optional, included in PDF) */}
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Remarks & Recommendations (optional)</label>
                          <textarea
                            className="input w-full resize-none text-sm"
                            rows={3}
                            value={nurseryRemarks}
                            onChange={e => setNurseryRemarks(e.target.value)}
                            placeholder="Add observations, recommendations, or notes to appear on the official PDF…"
                          />
                        </div>

                        {/* Signatories note */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-500">
                          <p className="font-semibold text-gray-600 mb-1">Official documentation</p>
                          Prepared by <span className="font-medium text-gray-700">{preview.prepared_by ?? user?.name}</span>
                          {preview.prepared_by_role ? ` (${preview.prepared_by_role})` : ''}.
                          The exported PDF includes Prepared / Reviewed / Noted &amp; Approved signature blocks, reference number, and page numbers.
                        </div>
                      </>
                    ) : (
                    <>
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Planted', value: preview.total_planted, color: 'bg-green-50 text-green-700 border-green-200', icon: TreePine },
                        { label: 'Total Alive',   value: preview.total_alive,   color: 'bg-teal-50 text-teal-700 border-teal-200',   icon: CheckCircle },
                        { label: 'Total Dead',    value: preview.total_dead,    color: 'bg-red-50 text-red-700 border-red-200',       icon: XCircle },
                        { label: 'Survival Rate', value: `${preview.survival_rate}%`, color: 'bg-blue-50 text-blue-700 border-blue-200', icon: BarChart2 },
                      ].map(({ label, value, color, icon: Icon }) => (
                        <div key={label} className={cn('rounded-xl p-3.5 border', color)}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className="w-3.5 h-3.5 opacity-70" />
                            <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">{label}</p>
                          </div>
                          <p className="text-2xl font-bold tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Species breakdown */}
                    {preview.species_breakdown?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Species Breakdown</p>
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="table-header">Species</th>
                                <th className="table-header text-right">Count</th>
                                <th className="table-header">Share</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {preview.species_breakdown.map((row, i) => {
                                const total = preview.species_breakdown.reduce((a, r) => a + r.count, 0)
                                const pct   = total > 0 ? Math.round(row.count / total * 100) : 0
                                return (
                                  <tr key={row.species_name} className="hover:bg-gray-50/70">
                                    <td className="table-cell">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-300 font-mono w-5">{i + 1}</span>
                                        <span className="italic text-gray-700">{row.species_name}</span>
                                      </div>
                                    </td>
                                    <td className="table-cell text-right font-bold text-gray-800 tabular-nums">{row.count}</td>
                                    <td className="table-cell w-36">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{pct}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    </>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* -- REVIEW QUEUE TAB ------------------------------------------ */}
            {tab === 'review' && (
              <div className="space-y-4 animate-fade-in">

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input className="input pl-9 w-56" placeholder="Search title or location…"
                      value={threatSearch} onChange={e => { setThreatSearch(e.target.value); setThreatPage(1) }} />
                  </div>
                  <select className="input w-36" value={threatStatusFilter}
                    onChange={e => { setThreatStatusFilter(e.target.value); setThreatPage(1) }}>
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="under_review">Under Review</option>
                    <option value="resolved">Resolved</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <select className="input w-36" value={threatCategory}
                    onChange={e => { setThreatCategory(e.target.value); setThreatPage(1) }}>
                    <option value="">All categories</option>
                    <option value="event_accomplishment">Event Accomplishment Report</option>
                    <option value="damage">Damage</option>
                    <option value="pollution">Pollution</option>
                    <option value="wildlife">Wildlife</option>
                    <option value="restoration">Restoration</option>
                    <option value="other">Other</option>
                  </select>
                  <div>
                    <label className="label text-[10px]">From</label>
                    <input type="date" className="input w-36" value={threatDateFrom}
                      onChange={e => { setThreatDateFrom(e.target.value); setThreatPage(1) }} />
                  </div>
                  <div>
                    <label className="label text-[10px]">To</label>
                    <input type="date" className="input w-36" value={threatDateTo}
                      onChange={e => { setThreatDateTo(e.target.value); setThreatPage(1) }} />
                  </div>
                  {(threatSearch || threatStatusFilter || threatCategory || threatDateFrom || threatDateTo) && (
                    <button className="btn-ghost text-xs"
                      onClick={() => { setThreatSearch(''); setThreatStatusFilter(''); setThreatCategory(''); setThreatDateFrom(''); setThreatDateTo(''); setThreatPage(1) }}>
                      <X className="w-3.5 h-3.5" /> Clear
                    </button>
                  )}
                  <button onClick={loadThreats} disabled={threatLoading} className="btn-secondary gap-2 ml-auto">
                    <RefreshCw className={cn('w-3.5 h-3.5', threatLoading && 'animate-spin')} />
                    Refresh
                  </button>
                </div>

                {/* Table */}
                {threatLoading ? (
                  <div className="flex justify-center py-12"><LoadingSpinner /></div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          {['#', 'Title', 'Category', 'Status', 'Location', 'Submitted By', 'Date', 'Actions'].map(h => (
                            <th key={h} className="table-header">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {!threats?.data?.length ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                              No reports found.
                            </td>
                          </tr>
                        ) : threats.data.map(r => (
                          <Fragment key={r.id}>
                            <tr className="hover:bg-gray-50/70 transition-colors">
                              <td className="table-cell font-mono text-xs text-gray-400">#{r.id}</td>
                              <td className="table-cell font-medium text-gray-800 max-w-[180px]">
                                <span className="block truncate" title={r.title}>{r.title}</span>
                                {r.ml_analyzed && r.ml_species && r.ml_species !== 'Unknown' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                    <Leaf className="w-3 h-3" /> {r.ml_species}
                                  </span>
                                )}
                              </td>
                              <td className="table-cell">
                                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS.other)}>
                                  {r.report_type === 'event_accomplishment' ? 'Event Accomplishment Report' : r.category}
                                </span>
                              </td>
                              <td className="table-cell">
                                <Badge label={r.status} type="status" />
                              </td>
                              <td className="table-cell text-gray-500 max-w-[130px]">
                                <span className="block truncate">{r.location_name ?? '—'}</span>
                              </td>
                              <td className="table-cell text-gray-500">{r.user?.name ?? '—'}{r.report_type === 'event_accomplishment' && <span className="block text-[10px] text-gray-400">Bantay Bakawan</span>}</td>
                              <td className="table-cell text-gray-400 whitespace-nowrap tabular-nums">
                                {r.created_at.split('T')[0]}
                              </td>
                              <td className="table-cell">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="View details">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  {canReviewThreats && <>
                                    <button
                                      onClick={() => openReview(r, 'under_review')}
                                      disabled={reviewingId === r.id || r.status === 'under_review'}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-30"
                                      title="Under Review">
                                      <Search className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => openReview(r, 'resolved')}
                                      disabled={reviewingId === r.id || r.status === 'resolved'}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-30"
                                      title="Mark Resolved">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </>}
                                </div>
                              </td>
                            </tr>
                            {/* Expanded detail row — shows description, image, and action buttons */}
                            {expandedId === r.id && (
                              <tr key={`${r.id}-detail`} className="bg-gray-50/80">
                                <td colSpan={8} className="px-6 py-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Observation</p>
                                      <p className="text-sm text-gray-700 leading-relaxed">{r.description}</p>
                                    </div>
                                    {r.report_type === 'event_accomplishment' && r.event_accomplishment && (
                                      <div className="md:col-span-2 rounded-xl border border-green-100 bg-green-50/70 p-4 space-y-2">
                                        <h3 className="font-bold text-green-900">Event Accomplishment Report · Day 0</h3>
                                        <p className="text-sm"><strong>Event:</strong> {r.event_accomplishment.event?.name} · {r.event_accomplishment.event?.scheduled_at ? formatDate(r.event_accomplishment.event.scheduled_at) : '—'}</p>
                                        <p className="text-sm"><strong>Reporter:</strong> {r.user?.name ?? '—'} (Bantay Bakawan) · <strong>Assigned site:</strong> {r.event_accomplishment.site?.name ?? '—'}</p>
                                        <p className="text-sm"><strong>Species:</strong> {r.event_accomplishment.species_name} · <strong>Seedlings planted:</strong> {r.event_accomplishment.seedlings_planted} · <strong>Volunteers present:</strong> {r.event_accomplishment.volunteers_present}</p>
                                        <p className="text-sm"><strong>Submitted:</strong> {formatDate(r.event_accomplishment.submitted_at)} · <strong>Location:</strong> {r.event_accomplishment.latitude ?? '—'}, {r.event_accomplishment.longitude ?? '—'}</p>
                                        {r.event_accomplishment.remarks && <p className="text-sm"><strong>Observation / Remarks:</strong> {r.event_accomplishment.remarks}</p>}
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{r.event_accomplishment.photos.map((photo, i) => <img key={i} src={photo.url} alt={`Accomplishment photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />)}</div>
                                      </div>
                                    )}
                                    {r.image_url && (
                                      <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Photo</p>
                                        <img src={r.image_url} alt="Report" className="rounded-xl max-h-40 object-cover border border-gray-200" />
                                      </div>
                                    )}
                                    {canReviewThreats && <div className="flex flex-wrap gap-2 md:col-span-2">
                                      <button onClick={() => openReview(r, 'under_review')}
                                        disabled={r.status === 'under_review'}
                                        className="btn-secondary gap-2 text-sm disabled:opacity-40">
                                        <Eye className="w-4 h-4" /> Under Review
                                      </button>
                                      <button onClick={() => openReview(r, 'resolved')}
                                        disabled={r.status === 'resolved'}
                                        className="btn-primary gap-2 text-sm disabled:opacity-40">
                                        <CheckCircle className="w-4 h-4" /> Resolve
                                      </button>
                                    </div>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {threats && threats.last_page > 1 && (
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-gray-400">
                      Page {threats.current_page} of {threats.last_page} · {threats.total} reports
                    </p>
                    <div className="flex gap-2">
                      <button disabled={threatPage <= 1} onClick={() => setThreatPage(p => p - 1)}
                        className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">? Prev</button>
                      <button disabled={threatPage >= threats.last_page} onClick={() => setThreatPage(p => p + 1)}
                        className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next ?</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* -- HISTORY TAB ----------------------------------------------- */}
            {tab === 'history' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">
                    {reportHistory?.total ?? 0} submitted report{reportHistory?.total !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={() => {
                      loadReportHistory()
                      fetchGeneratedReports()
                        .then(reports => setHistory(reports as any))
                        .catch(() => toast.error('Failed to refresh generated reports.'))
                    }}
                    disabled={reportHistoryLoading}
                    className="btn-ghost text-xs gap-1.5 disabled:opacity-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>

                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700">Submitted Report History</h3>
                  {reportHistoryLoading ? (
                    <div className="flex justify-center py-8"><LoadingSpinner /></div>
                  ) : !reportHistory?.data?.length ? (
                    <div className="rounded-xl border border-gray-200 py-10 text-center text-sm text-gray-400">
                      No submitted reports found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {['#', 'Title', 'Category', 'Status', 'Location', 'Submitted By', 'Date', ''].map((h, index) => (
                              <th key={`${h}-${index}`} className="table-header">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {reportHistory.data.map(report => (
                            <tr key={report.id} className="hover:bg-gray-50/70">
                              <td className="table-cell font-mono text-xs text-gray-400">#{report.id}</td>
                              <td className="table-cell font-medium text-gray-800 max-w-[220px]">
                                <span className="block truncate" title={report.title}>{report.title}</span>
                              </td>
                              <td className="table-cell">
                                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', CATEGORY_COLORS[report.category] ?? CATEGORY_COLORS.other)}>
                                  {report.report_type === 'event_accomplishment' ? 'Event accomplishment' : report.category}
                                </span>
                              </td>
                              <td className="table-cell"><Badge label={report.status} type="status" /></td>
                              <td className="table-cell text-gray-500">{report.location_name ?? '—'}</td>
                              <td className="table-cell text-gray-500">{report.user?.name ?? '—'}</td>
                              <td className="table-cell text-gray-400 whitespace-nowrap tabular-nums">{formatDate(report.created_at)}</td>
                              <td className="table-cell">
                                <button
                                  onClick={() => router.push(`/reports/${report.id}`)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="View report details">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {reportHistory && reportHistory.last_page > 1 && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Page {reportHistory.current_page} of {reportHistory.last_page} · {reportHistory.total} reports</span>
                      <div className="flex gap-2">
                        <button
                          disabled={reportHistoryPage <= 1 || reportHistoryLoading}
                          onClick={() => setReportHistoryPage(page => page - 1)}
                          className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Previous</button>
                        <button
                          disabled={reportHistoryPage >= reportHistory.last_page || reportHistoryLoading}
                          onClick={() => setReportHistoryPage(page => page + 1)}
                          className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700">Generated Summary Reports</h3>
                    <span className="text-xs text-gray-500">{history.length} generated</span>
                  </div>
                  {history.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">
                      No summary reports generated yet. Use the Generate Report tab to create one.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {['Type', 'Site', 'Period / Range', 'Generated', 'Download'].map(h => (
                              <th key={h} className="table-header">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {history.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                              <td className="table-cell">
                                <span className="text-xs font-bold bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full uppercase tracking-wide">
                                  {REPORT_TYPE_LABELS[r.report_type] ?? r.report_type}
                                </span>
                              </td>
                              <td className="table-cell text-gray-600">
                                {(r as any).site?.name ?? (r.restoration_site_id ? `Site #${r.restoration_site_id}` : 'All sites')}
                              </td>
                              <td className="table-cell text-gray-500 tabular-nums">
                                {r.date_from && r.date_to
                                  ? `${String(r.date_from).split('T')[0]} – ${String(r.date_to).split('T')[0]}`
                                  : r.date_from
                                    ? String(r.date_from).split('T')[0]
                                    : '—'}
                              </td>
                              <td className="table-cell text-gray-400 whitespace-nowrap tabular-nums">
                                {r.created_at.split('T')[0]}
                              </td>
                              <td className="table-cell">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleHistoryDownload(r)}
                                    disabled={downloading === r.id}
                                    className="btn-secondary text-xs py-1.5 px-3 gap-1.5">
                                    <FileDown className="w-3.5 h-3.5" />
                                    {downloading === r.id ? '…' : 'CSV'}
                                  </button>
                                  <button
                                    onClick={() => handleHistoryDownloadPDF(r)}
                                    disabled={downloadingPdf === r.id}
                                    className="btn-secondary text-xs py-1.5 px-3 gap-1.5">
                                    <Download className="w-3.5 h-3.5" />
                                    {downloadingPdf === r.id ? '…' : 'PDF'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

          </div>{/* /tab panel */}
        </div>{/* /tab card */}

        {/* -- Review note modal ---------------------------------------------- */}
        {noteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
              {(() => {
                const actionColors: Record<string, { bg: string; border: string; icon: React.ReactNode; text: string; label: string }> = {
                  approved:      { bg: 'bg-green-50',  border: 'border-green-200',  icon: <CheckCircle className="w-5 h-5 text-green-600" />,  text: 'text-green-800',  label: 'Mark as Resolved' },
                  rejected:      { bg: 'bg-red-50',    border: 'border-red-200',    icon: <XCircle className="w-5 h-5 text-red-600" />,        text: 'text-red-800',    label: 'Reject' },
                  investigating: { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: <Eye className="w-5 h-5 text-blue-600" />,           text: 'text-blue-800',   label: 'Under Review' },
                  resolved:      { bg: 'bg-teal-50',   border: 'border-teal-200',   icon: <CheckCircle className="w-5 h-5 text-teal-600" />,   text: 'text-teal-800',   label: 'Mark as Resolved' },
                  pending:       { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: <Clock className="w-5 h-5 text-amber-600" />,        text: 'text-amber-800',  label: 'Mark as Pending' },
                }
                const cfg = actionColors[noteModal.action] ?? actionColors.pending
                return (
                  <>
                    <div className={cn('px-5 py-4 rounded-t-2xl border-b', cfg.bg, cfg.border)}>
                      <div className="flex items-center gap-2">
                        {cfg.icon}
                        <h3 className={cn('font-bold text-sm', cfg.text)}>{cfg.label}</h3>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">"{noteModal.report.title}"</p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="label">Admin Notes <span className="text-gray-400 font-normal normal-case">(optional — visible to submitter)</span></label>
                        <textarea
                          className="input resize-none"
                          rows={3}
                          placeholder="Add notes for the submitter…"
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-3">
                        <button onClick={submitReview} disabled={reviewingId !== null}
                          className="flex-1 btn-primary">
                          {reviewingId !== null ? 'Submitting…' : `Confirm: ${cfg.label}`}
                        </button>
                        <button onClick={() => setNoteModal(null)} className="btn-secondary">Cancel</button>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}

      </div>{/* /page-container */}
    </SidebarLayout>
  )
}
