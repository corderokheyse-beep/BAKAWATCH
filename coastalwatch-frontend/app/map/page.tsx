'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MonitoringTimeline from '@/components/reports/MonitoringTimeline'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Report, RestorationSite, ReportCategory } from '@/lib/types'
import { formatDate, CATEGORY_ICONS, cn, resolveImageUrl, getReportPhotoUrls } from '@/lib/utils'
import { downloadReportPdf, downloadSitePdf, downloadMapDataPdf } from '@/lib/map-report-pdf'
import toast from 'react-hot-toast'
import {
  Filter, X, RefreshCw, MapPin, Clock, CheckCircle,
  XCircle, Leaf, TreePine, Activity,
  ChevronRight, Radio, Sprout, Ban,
  User as UserIcon, Loader2, ShieldAlert, Download,
  ChevronDown, ListTree, Maximize2, ImageIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const CoastalMapView = nextDynamic(
  () => import('@/components/map/CoastalMapView'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full bg-gray-50"><LoadingSpinner /></div> }
)

// Zonation palette for the legend (mirrors CoastalMapView's ZONE_COLORS, in the
// seaward → landward order the panelist expects).
const ZONE_LEGEND: { zone: string; fill: string }[] = [
  { zone: 'Seaward',                 fill: '#06b6d4' },
  { zone: 'Seaward to Middle Zone',  fill: '#14b8a6' },
  { zone: 'Middle Intertidal Zone',  fill: '#22c55e' },
  { zone: 'Middle to Landward Zone', fill: '#84cc16' },
  { zone: 'Riverine',                fill: '#3b82f6' },
  { zone: 'Brackish Estuary',        fill: '#a78bfa' },
  { zone: 'Landward',                fill: '#b45309' },
]

const CATEGORIES: ReportCategory[] = ['damage', 'restoration', 'wildlife', 'pollution', 'other']
const POLL_INTERVAL = 30_000 // 30 seconds

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  damage:      'Damage',
  restoration: 'Restoration',
  wildlife:    'Wildlife',
  pollution:   'Pollution',
  other:       'Other',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  approved: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  pending:  <Clock       className="w-3.5 h-3.5 text-amber-500" />,
  rejected: <XCircle     className="w-3.5 h-3.5 text-red-500"   />,
}

const SITE_STATUS_CONFIG: Record<string, { color: string; fill: string; label: string; Icon: LucideIcon }> = {
  active:      { color: '#15803d', fill: '#22c55e', label: 'Active',      Icon: Sprout },
  in_progress: { color: '#b45309', fill: '#f59e0b', label: 'In Progress', Icon: Clock },
  inactive:    { color: '#4b5563', fill: '#9ca3af', label: 'Inactive',    Icon: Ban },
}

// Severity visual tokens + default affected-area radius (metres), mirrored from
// CoastalMapView so the panel and the map circle stay consistent.
const SEVERITY_UI: Record<string, { bg: string; border: string; text: string; radius: number }> = {
  low:      { bg: '#fefce8', border: '#fde68a', text: '#a16207', radius: 25 },
  medium:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', radius: 60 },
  high:     { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', radius: 120 },
  critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', radius: 200 },
}

function affectedRadiusMeters(r: Report): number {
  if (r.affected_radius_m != null && r.affected_radius_m > 0) return r.affected_radius_m
  return SEVERITY_UI[r.severity ?? 'medium']?.radius ?? SEVERITY_UI.medium.radius
}

type PanelMode = 'report' | 'site' | null

export default function MapPage() {
  // useSearchParams() (used inside MapPageInner) must sit under a Suspense
  // boundary for the production build to prerender this route.
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[calc(100vh-3.5rem)] bg-gray-50"><LoadingSpinner /></div>}>
      <MapPageInner />
    </Suspense>
  )
}

function MapPageInner() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // MENRO/admin/staff may download the panel info for the Provincial report.
  const canDownload = user?.role === 'menro' || user?.role === 'admin' || user?.role === 'staff'

  // Tracks which PDF export is in flight so buttons can show progress and lock.
  const [downloading, setDownloading] = useState<'report' | 'site' | 'map' | null>(null)

  async function handleDownloadReport(r: Report) {
    setDownloading('report')
    const t = toast.loading('Building report PDF…')
    try {
      await downloadReportPdf(r)
      toast.success('Report PDF downloaded', { id: t })
    } catch {
      toast.error('Could not build the PDF', { id: t })
    } finally { setDownloading(null) }
  }

  async function handleDownloadSite(s: RestorationSite) {
    setDownloading('site')
    const t = toast.loading('Building site PDF…')
    try {
      await downloadSitePdf(s)
      toast.success('Site PDF downloaded', { id: t })
    } catch {
      toast.error('Could not build the PDF', { id: t })
    } finally { setDownloading(null) }
  }

  async function handleDownloadMap(allSites: RestorationSite[], visibleReports: Report[]) {
    setDownloading('map')
    const t = toast.loading('Building map data PDF…')
    try {
      await downloadMapDataPdf(allSites, visibleReports)
      toast.success('Map data PDF downloaded', { id: t })
    } catch {
      toast.error('Could not build the PDF', { id: t })
    } finally { setDownloading(null) }
  }

  // ── Deep-link params (from dashboard pending report click) ────────────────
  const focusReportId = searchParams ? Number(searchParams.get('reportId')) || null : null
  const focusLat      = searchParams ? Number(searchParams.get('lat'))      || null : null
  const focusLng      = searchParams ? Number(searchParams.get('lng'))      || null : null
  const focusLatLng: [number, number] | null =
    focusLat && focusLng ? [focusLat, focusLng] : null

  const [reports, setReports]   = useState<Report[]>([])
  const [sites, setSites]       = useState<RestorationSite[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [selectedSite, setSelectedSite]     = useState<RestorationSite | null>(null)
  const [siteDetailLoading, setSiteDetailLoading] = useState(false)
  const [panelMode, setPanelMode]           = useState<PanelMode>(null)

  const [showTimeline, setShowTimeline]     = useState(false)
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [lightboxUrl, setLightboxUrl]       = useState<string | null>(null)

  // Legend starts expanded on desktop, collapsed to a compact pill on phones
  // where the full card would cover most of the map. `null` = not determined
  // yet (pre-hydration), which renders nothing to avoid a wrong flash.
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setLegendOpen(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const [filters, setFilters] = useState({
    category:     '' as ReportCategory | '',
    status:       '' as string,
    showSites:    true,
    showBarangays: true,
    showMangroveZones: false,
  })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Auth guard ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
  }, [authLoading, user]) // eslint-disable-line

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Data fetching ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [rRes, sRes] = await Promise.all([
        api.get('/reports/map'),
        api.get('/sites'),
      ])
      setReports(rRes.data)
      setSites(sRes.data)
      setLastUpdated(new Date())
    } catch {
      // silent fail on poll
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading || !user) return
    if (user.role === 'field_worker') { router.replace('/analytics'); return }
    fetchData()
    pollRef.current = setInterval(() => fetchData(true), POLL_INTERVAL)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [authLoading, user, fetchData])

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Derived data ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  // ── Auto-select report from deep-link once data is loaded ─────────────────
  useEffect(() => {
    if (!focusReportId || reports.length === 0) return
    const target = reports.find(r => r.id === focusReportId)
    if (target) {
      setSelectedReport(target)
      setSelectedSite(null)
      setPanelMode('report')
    }
  }, [focusReportId, reports]) // eslint-disable-line

  const filteredReports = reports.filter(r => {
    if (filters.category && r.category !== filters.category) return false
    if (filters.status   && r.status   !== filters.status)   return false
    return true
  })

  const reportCounts = {
    resolved: reports.filter(r => r.status === 'resolved').length,
    pending:  reports.filter(r => r.status === 'pending').length,
    under_review: reports.filter(r => r.status === 'under_review').length,
  }

  const siteCounts = Object.fromEntries(
    Object.keys(SITE_STATUS_CONFIG).map(k => [k, sites.filter(s => s.status === k).length])
  )

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Handlers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  async function handleReportClick(r: Report) {
    setSelectedReport(r)
    setSelectedSite(null)
    setPanelMode('report')
    setShowTimeline(false)
    setActivePhotoIdx(0)

    try {
      const { data } = await api.get(`/reports/${r.id}`)
      setSelectedReport(prev => {
        if (!prev || prev.id !== r.id) return prev
        return {
          ...prev,
          ...(data ?? {}),
          photos: data?.photos ?? prev.photos,
          image_url: data?.image_url ?? prev.image_url,
        }
      })
    } catch {
      // keep the list payload already shown
    }
  }

  async function handleSiteClick(s: RestorationSite) {
    // Show the list payload immediately, then hydrate with detail
    // (species, survival, plantation count) from GET /sites/{id}.
    setSelectedSite(s)
    setSelectedReport(null)
    setPanelMode('site')
    setSiteDetailLoading(true)
    try {
      const { data } = await api.get(`/sites/${s.id}`)
      setSelectedSite(prev => {
        // Ignore the response if the user already closed/switched the panel.
        if (!prev || prev.id !== s.id) return prev
        return {
          ...prev,
          ...(data.site ?? {}),
          plantation_count: data.plantation_count ?? prev.plantation_count,
          survival_rate: data.survival?.survival_rate ?? prev.survival_rate,
          species: data.species ?? [],
          site_species: data.site_species ?? prev.site_species ?? [],
          species_list_count: data.site_species_count ?? prev.species_list_count,
        }
      })
    } catch {
      // keep the list payload already shown
    } finally {
      setSiteDetailLoading(false)
    }
  }

  function closePanel() {
    setSelectedReport(null)
    setSelectedSite(null)
    setPanelMode(null)
    setShowTimeline(false)
  }

  const selectedReportPhotoUrls = getReportPhotoUrls(selectedReport)

  return (
    <SidebarLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Top bar ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4 flex-wrap shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight flex items-center gap-2">
                <Radio className="w-4 h-4 text-green-500 animate-pulse" />
                Live Map
              </h1>
              <p className="text-xs text-gray-400 leading-tight mt-0.5">
                Gloria, Oriental Mindoro · {filteredReports.length} reports · {sites.length} sites
                {lastUpdated && (
                  <span className="ml-2 text-gray-300">
                    · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={filters.category}
                onChange={e => setFilters(f => ({ ...f, category: e.target.value as ReportCategory | '' }))}
                className="text-xs text-gray-700 bg-transparent outline-none"
              >
                <option value="">All categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <select
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                className="text-xs text-gray-700 bg-transparent outline-none"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* Toggles */}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <input type="checkbox" checked={filters.showSites}
                onChange={e => setFilters(f => ({ ...f, showSites: e.target.checked }))}
                className="rounded text-primary-600 w-3 h-3" />
              Sites
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <input type="checkbox" checked={filters.showBarangays}
                onChange={e => setFilters(f => ({ ...f, showBarangays: e.target.checked }))}
                className="rounded text-primary-600 w-3 h-3" />
              Barangays
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <input type="checkbox" checked={filters.showMangroveZones}
                onChange={e => setFilters(f => ({ ...f, showMangroveZones: e.target.checked }))}
                className="rounded text-primary-600 w-3 h-3" />
              Mangrove Zones
            </label>

            {/* Refresh */}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              Refresh
            </button>

            {/* Download map data (MENRO/admin/staff) — all sites + visible reports */}
            {canDownload && (
              <button
                onClick={() => handleDownloadMap(sites, filteredReports)}
                disabled={downloading !== null}
                title="Download all map data (sites + reports) as a PDF report"
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl px-3 py-1.5 transition-colors disabled:opacity-60"
              >
                {downloading === 'map'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                Download map data
              </button>
            )}
          </div>
        </div>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Main content ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">

          {/* Map */}
          <div className="flex-1 relative min-h-[320px]">
            {loading ? (
              <div className="flex items-center justify-center h-full bg-gray-50">
                <LoadingSpinner />
              </div>
            ) : (
              <CoastalMapView
                reports={filteredReports}
                sites={sites}
                height="100%"
                showBarangays={filters.showBarangays}
                showSites={filters.showSites}
                showMangroveZones={filters.showMangroveZones || downloading === 'map'}
                onReportClick={handleReportClick}
                onSiteClick={handleSiteClick}
                selectedReportId={selectedReport?.id}
                selectedSiteId={selectedSite?.id}
                lastUpdated={lastUpdated}
                focusLatLng={focusLatLng}
              />
            )}

            {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Floating Legend ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
            {/* Collapsed pill (default on phones) — tap to expand the full legend */}
            {legendOpen === false && (
              <button
                onClick={() => setLegendOpen(true)}
                className="absolute bottom-12 left-3 z-[400] bg-white/96 backdrop-blur-sm rounded-full shadow-lg border border-gray-100 px-3.5 py-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:bg-white transition-colors"
                aria-label="Show map legend"
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Live
                <ListTree className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}

            {/* Expanded legend card */}
            {legendOpen === true && (
            <div className="absolute bottom-12 left-3 z-[400] bg-white/96 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 px-4 py-3 text-xs space-y-3 min-w-[170px] max-h-[min(24rem,60vh)] overflow-y-auto">
              {/* Real-time indicator + collapse toggle */}
              <div className="flex items-center gap-1.5 pb-2 border-b border-gray-100">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block shrink-0" />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex-1">Live · Auto-refresh</span>
                <button
                  onClick={() => setLegendOpen(false)}
                  className="p-0.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Collapse legend"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Reports legend */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Reports</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-green-500 inline-block shrink-0" />
                      <span className="text-gray-700 font-medium">Resolved</span>
                    </div>
                    <span className="font-bold text-green-700 tabular-nums">{reportCounts.resolved}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-amber-400 inline-block shrink-0" />
                      <span className="text-gray-700 font-medium">Pending</span>
                    </div>
                    <span className="font-bold text-amber-600 tabular-nums">{reportCounts.pending}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-500 inline-block shrink-0" />
                      <span className="text-gray-700 font-medium">Under Review</span>
                    </div>
                    <span className="font-bold text-blue-600 tabular-nums">{reportCounts.under_review}</span>
                  </div>
                </div>
              </div>

              {/* Sites legend */}
              <div className="border-t border-gray-100 pt-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Sites</p>
                <div className="space-y-1.5">
                  {Object.entries(SITE_STATUS_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: cfg.fill }}><cfg.Icon className="w-3 h-3 text-white" /></span>
                        <span className="text-gray-700 font-medium">{cfg.label}</span>
                      </div>
                      <span className="font-bold tabular-nums" style={{ color: cfg.color }}>
                        {siteCounts[key] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drawn-area colour key (green mangrove + red planted) */}
              <div className="border-t border-gray-100 pt-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Area</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm border border-black/10 inline-block shrink-0 bg-[#16a34a]" />
                    <span className="text-gray-700">Mangrove area</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-sm border border-black/10 inline-block shrink-0 bg-[#ef4444]" />
                    <span className="text-gray-700">Currently planted</span>
                  </div>
                </div>
              </div>

              {/* Mangrove zonation legend — shown only when the overlay is on */}
              {filters.showMangroveZones && (
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Mangrove Zonation</p>
                  <div className="space-y-1">
                    {ZONE_LEGEND.map(z => (
                      <div key={z.zone} className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded-sm border border-black/10 inline-block shrink-0" style={{ background: z.fill }} />
                        <span className="text-gray-700">{z.zone}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="w-3.5 h-3.5 rounded-sm border border-black/10 inline-block shrink-0 bg-[#16a34a]" />
                      <span className="text-gray-500 italic">Mangrove (zone unknown)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Barangay indicator */}
              <div className="border-t border-gray-100 pt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full border-2 border-teal-600 bg-white flex items-center justify-center"><MapPin className="w-2.5 h-2.5 text-teal-600" /></div>
                  <span className="text-gray-600 font-medium">Coastal Barangay</span>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Right panel ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
          <div className="w-full lg:w-80 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col overflow-hidden max-h-[55vh] lg:max-h-none">

            {/* Single scroll region: detail card + recent reports scroll together
                so a tall selected-report panel is fully readable. */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">

            {/* Detail card */}
            {panelMode === 'report' && selectedReport ? (
              <div className="border-b border-gray-100 animate-fade-in">
                <div className="flex items-start justify-between px-4 pt-4 pb-3 gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0 mt-0.5">{CATEGORY_ICONS[selectedReport.category]}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{selectedReport.title}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge label={selectedReport.status} type="status" />
                        <Badge label={selectedReport.category} type="category" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canDownload && (
                      <button
                        onClick={() => handleDownloadReport(selectedReport)}
                        disabled={downloading !== null}
                        title="Download report as PDF (with photos & monitoring history)"
                        className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-60">
                        {downloading === 'report'
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={closePanel} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
                {selectedReportPhotoUrls.length > 0 && (
                  <div className={`grid gap-1 ${selectedReportPhotoUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {selectedReportPhotoUrls.map((url, index) => (
                      <img
                        key={url}
                        src={url}
                        alt={`${selectedReport.title} photo ${index + 1}`}
                        className="aspect-[4/3] w-full bg-gray-100 object-cover"
                      />
                    ))}
                  </div>
                )}
                <div className="px-4 py-3 space-y-2.5">
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedReport.description}</p>

                  {/* Severity + affected area */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-2.5 border" style={{
                      background: SEVERITY_UI[selectedReport.severity ?? 'medium'].bg,
                      borderColor: SEVERITY_UI[selectedReport.severity ?? 'medium'].border,
                    }}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <ShieldAlert className="w-3 h-3" style={{ color: SEVERITY_UI[selectedReport.severity ?? 'medium'].text }} />
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SEVERITY_UI[selectedReport.severity ?? 'medium'].text }}>Severity</p>
                      </div>
                      <p className="text-sm font-extrabold capitalize" style={{ color: SEVERITY_UI[selectedReport.severity ?? 'medium'].text }}>
                        {selectedReport.severity ?? 'medium'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Radio className="w-3 h-3 text-gray-500" />
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Affected Area</p>
                      </div>
                      <p className="text-sm font-extrabold text-gray-800">~{affectedRadiusMeters(selectedReport)} m radius</p>
                    </div>
                  </div>

                  {selectedReport.location_name && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                      {selectedReport.location_name}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {formatDate(selectedReport.created_at)}
                  </div>
                  {selectedReport.admin_notes && (
                    <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100 text-xs text-blue-700">
                      <span className="font-semibold">Admin note: </span>{selectedReport.admin_notes}
                    </div>
                  )}

                  {/* Monitoring history — MENRO views the before/after + timeline read-only;
                      the "Add" button is hidden for MENRO (field_worker/volunteer only). */}
                  <button
                    onClick={() => setShowTimeline(v => !v)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-100"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    {showTimeline ? 'Hide monitoring history' : 'Open monitoring history'}
                  </button>
                  {showTimeline && (
                    <div className="pt-2 border-t border-gray-100">
                      <MonitoringTimeline
                        reportId={selectedReport.id}
                        reportStatus={(selectedReport as any).status}
                        onStatusChange={(s) => {
                          setSelectedReport(prev => prev ? { ...prev, status: s as any } : prev)
                          setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, status: s as any } : r))
                        }}
                      />
                    </div>
                  )}

                </div>
              </div>
            ) : panelMode === 'site' && selectedSite ? (
              <div className="border-b border-gray-100 animate-fade-in">
                {(() => {
                  const cfg = SITE_STATUS_CONFIG[selectedSite.status] ?? SITE_STATUS_CONFIG.active
                  return (
                    <>
                      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2"
                        style={{ background: cfg.fill + '18', borderBottom: `3px solid ${cfg.color}` }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.color }}><cfg.Icon className="w-5 h-5 text-white" /></span>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{selectedSite.name}</p>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white mt-1"
                              style={{ background: cfg.color }}>
                              <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                              {cfg.label}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canDownload && (
                            <button
                              onClick={() => handleDownloadSite(selectedSite)}
                              disabled={downloading !== null}
                              title="Download site report as PDF (with photos)"
                              className="p-1.5 rounded-lg text-primary-700 hover:bg-black/10 transition-colors disabled:opacity-60">
                              {downloading === 'site'
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Download className="w-4 h-4" />}
                            </button>
                          )}
                          <button onClick={closePanel} className="p-1 rounded-lg hover:bg-black/10 transition-colors">
                            <X className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-3">
                        {selectedSite.barangay && (
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <MapPin className="w-4 h-4 text-primary-500 shrink-0" />
                            <span className="font-semibold">Brgy. {selectedSite.barangay}, Gloria</span>
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
                              {selectedSite.assigned_worker?.name ?? 'Unassigned'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {selectedSite.area_hectares != null && (
                            <div className="bg-green-50 rounded-xl p-2.5 border border-green-100">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Leaf className="w-3 h-3 text-green-600" />
                                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Area</p>
                              </div>
                              <p className="text-sm font-extrabold text-green-800">{selectedSite.area_hectares} ha</p>
                            </div>
                          )}
                          <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Leaf className="w-3 h-3 text-blue-600" />
                              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Species</p>
                            </div>
                            <p className="text-sm font-extrabold text-blue-800">
                              {selectedSite.site_species?.length ?? selectedSite.species_list_count ?? selectedSite.species_list?.length ?? 0}
                            </p>
                          </div>
                          {selectedSite.plantation_count != null && (
                            <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Activity className="w-3 h-3 text-emerald-600" />
                                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Planted</p>
                              </div>
                              <p className="text-sm font-extrabold text-emerald-800">{selectedSite.plantation_count}</p>
                            </div>
                          )}
                          {selectedSite.survival_rate != null && (
                            <div className="bg-teal-50 rounded-xl p-2.5 border border-teal-100">
                              <div className="flex items-center gap-1 mb-0.5">
                                <CheckCircle className="w-3 h-3 text-teal-600" />
                                <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Survival</p>
                              </div>
                              <p className="text-sm font-extrabold text-teal-800">{selectedSite.survival_rate}%</p>
                            </div>
                          )}
                        </div>

                        {/* Planted vs unplanted area */}
                        {selectedSite.planted_hectares != null && selectedSite.area_hectares != null ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Sprout className="w-3 h-3 text-emerald-600" />
                                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Planted</p>
                              </div>
                              <p className="text-sm font-extrabold text-emerald-800">{selectedSite.planted_hectares} ha</p>
                            </div>
                            <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Leaf className="w-3 h-3 text-amber-600" />
                                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Unplanted</p>
                              </div>
                              <p className="text-sm font-extrabold text-amber-800">
                                {Math.max(0, +(selectedSite.area_hectares - selectedSite.planted_hectares).toFixed(4))} ha
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">Planted/unplanted area breakdown unavailable.</p>
                        )}

                        {/* Mangrove species documented at this site */}
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <Leaf className="w-3 h-3 text-primary-500" />
                            Mangrove Species{selectedSite.site_species && selectedSite.site_species.length > 0 ? ` (${selectedSite.site_species.length})` : ''}
                            {siteDetailLoading && <Loader2 className="w-3 h-3 text-gray-300 animate-spin" />}
                          </p>
                          {selectedSite.site_species && selectedSite.site_species.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                              {selectedSite.site_species.map(sp => (
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
                              {siteDetailLoading ? 'Loading species...' : 'No species recorded yet.'}
                            </p>
                          )}
                        </div>

                        {selectedSite.description && (
                          <p className="text-xs text-gray-500 leading-relaxed">{selectedSite.description}</p>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : (
              <div className="px-4 py-5 border-b border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <MapPin className="w-4 h-4" />
                  <span>Click a marker to see details</span>
                </div>
              </div>
            )}

            {/* Recent reports list */}
            <div>
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recent Reports</p>
                {reportCounts.pending > 0 && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {reportCounts.pending} pending
                  </span>
                )}
              </div>
              <div className="px-3 pb-4 space-y-1.5">
                {filteredReports.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs py-8">No reports match the current filters</p>
                ) : (
                  filteredReports.slice(0, 15).map(r => (
                    <button
                      key={r.id}
                      onClick={() => handleReportClick(r)}
                      className={cn(
                        'w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150 border',
                        selectedReport?.id === r.id
                          ? 'bg-primary-50 border-primary-200 shadow-sm'
                          : 'bg-gray-50/60 border-transparent hover:bg-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg shrink-0 mt-0.5">{CATEGORY_ICONS[r.category]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate leading-snug">{r.title}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {STATUS_ICON[r.status]}
                            <span className={cn(
                              'text-[10px] font-semibold capitalize',
                              r.status === 'resolved' ? 'text-green-600' :
                              r.status === 'pending' ? 'text-amber-600' : 'text-blue-600'
                            )}>{r.status.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] text-gray-400">· {r.category}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-1" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            </div>{/* ── end single scroll region ── */}
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
