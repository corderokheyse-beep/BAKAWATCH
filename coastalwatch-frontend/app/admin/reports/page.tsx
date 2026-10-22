'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  FileText, Users, Leaf, AlertTriangle, Activity, Download,
  RefreshCw, Calendar, Filter, ChevronDown, CheckCircle,
  XCircle, BarChart2, Shield, TrendingUp, TreePine, Search,
  Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

const ReportsOverTimeChart = nextDynamic(() => import('@/components/charts/ReportsOverTimeChart'), { ssr: false })
const CategoryDonutChart   = nextDynamic(() => import('@/components/charts/CategoryDonutChart'),   { ssr: false })

// --- Types --------------------------------------------------------------------
interface PeriodInfo { from: string; to: string }

interface UserSummary {
  total: number; active: number; inactive: number
  by_role: { role: string; count: number }[]
  new_in_period: {
    id: number; name: string; email: string; role: string
    is_active: boolean; created_at: string
  }[]
}

interface PlatformActivity {
  total_actions: number
  by_action: { action: string; count: number }[]
  by_user: { user_id: number; action_count: number; user?: { id: number; name: string; role: string } }[]
  over_time: { date: string; count: number }[]
}

interface ProgramOverview {
  sites_by_status: { status: string; count: number }[]
  total_sites: number
  plantation_summary: { status: string; count: number }[]
  monitoring_count: number; ecosystem_count: number
  events_summary: { status: string; count: number }[]
}

interface DataIntegrity {
  geo_mismatches: number; flagged_plantations: number; dead_plantations: number
  sites_with_no_activity: { id: number; name: string; barangay?: string; status: string; created_at: string }[]
}

interface ThreatReports {
  total: number
  by_category: { category: string; count: number }[]
  by_status: { status: string; count: number }[]
  recent: {
    id: number; title: string; category: string; status: string
    location_name?: string; created_at: string; user_id: number
    user?: { id: number; name: string }
  }[]
}

interface SystemReportData {
  period: PeriodInfo
  user_summary: UserSummary
  platform_activity: PlatformActivity
  program_overview: ProgramOverview
  data_integrity: DataIntegrity
  threat_reports: ThreatReports
}

type ActiveTab = 'overview' | 'threats' | 'users' | 'program' | 'integrity' | 'activity'

const TABS: { key: ActiveTab; label: string; icon: any }[] = [
  { key: 'overview',  label: 'Overview',       icon: BarChart2 },
  { key: 'threats',   label: 'Threat Reports', icon: AlertTriangle },
  { key: 'users',     label: 'Users',          icon: Users },
  { key: 'program',   label: 'Program',        icon: Leaf },
  { key: 'integrity', label: 'Data Integrity', icon: Shield },
  { key: 'activity',  label: 'Activity',       icon: Activity },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Super Admin', staff: 'MENRO Admin', menro: 'MENRO Admin',
  field_worker: 'Bantay Bakawan', volunteer: 'Participant',
  user: 'Community Member', public: 'Community Member',
}

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function subDays(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d }
function startOfMonth()     { const d = new Date(); d.setDate(1); return d }
function startOfYear()      { const d = new Date(); d.setMonth(0, 1); return d }

const PRESETS = [
  { label: 'Last 7 days',  from: () => toDateStr(subDays(7)),     to: () => toDateStr(new Date()) },
  { label: 'Last 30 days', from: () => toDateStr(subDays(30)),    to: () => toDateStr(new Date()) },
  { label: 'This month',   from: () => toDateStr(startOfMonth()), to: () => toDateStr(new Date()) },
  { label: 'This year',    from: () => toDateStr(startOfYear()),  to: () => toDateStr(new Date()) },
]

// --- Mini bar for visual proportion ------------------------------------------
function MiniBar({ value, max, color = 'bg-primary-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{pct}%</span>
    </div>
  )
}

// --- Empty state --------------------------------------------------------------
function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-gray-400 text-sm">{message}</td>
    </tr>
  )
}

// --- Section header -----------------------------------------------------------
function SectionHeader({ title, count, subtitle }: { title: string; count?: number; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      {count !== undefined && (
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">
          {count.toLocaleString()}
        </span>
      )}
      {subtitle && <span className="text-xs text-gray-400 ml-auto">{subtitle}</span>}
    </div>
  )
}

// --- Main Component -----------------------------------------------------------
export default function AdminReportsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()

  const [data, setData]           = useState<SystemReportData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [tab, setTab]             = useState<ActiveTab>('overview')
  const [dateFrom, setDateFrom]   = useState(toDateStr(subDays(30)))
  const [dateTo, setDateTo]       = useState(toDateStr(new Date()))
  const [showPresets, setShowPresets] = useState(false)
  const [threatSearch, setThreatSearch] = useState('')
  const [threatStatusFilter, setThreatStatusFilter] = useState('')
  const [threatCategoryFilter, setThreatCategoryFilter] = useState('')

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) router.replace('/login')
  }, [authLoading, user, isAdmin, router])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/admin/system-reports', {
        params: { date_from: dateFrom, date_to: dateTo },
      })
      setData(res)
    } catch {
      toast.error('Failed to load report data.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (!authLoading && isAdmin) fetchReport()
  }, [authLoading, isAdmin, fetchReport])

  // -- CSV Export --------------------------------------------------------------
  const handleExportCSV = async () => {
    setExporting('csv')
    try {
      const token = Cookies.get('token')
      const base  = process.env.NEXT_PUBLIC_API_URL ?? ''
      const url   = `${base}/admin/system-reports/export?format=csv&date_from=${dateFrom}&date_to=${dateTo}`
      const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Export failed')
      const blob    = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link    = document.createElement('a')
      link.href     = blobUrl
      link.download = `system-report-${dateFrom}-to-${dateTo}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
      toast.success('CSV exported.')
    } catch {
      toast.error('CSV export failed.')
    } finally {
      setExporting(null)
    }
  }

  // -- PDF Export --------------------------------------------------------------
  const handleExportPDF = async () => {
    if (!data) return
    setExporting('pdf')
    try {
      const { jsPDF }  = await import('jspdf')
      const autoTable  = (await import('jspdf-autotable')).default
      const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW      = doc.internal.pageSize.getWidth()
      let y            = 15

      // Header banner
      doc.setFillColor(26, 71, 49)
      doc.rect(0, 0, pageW, 30, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(15); doc.setFont('helvetica', 'bold')
      doc.text('BAKAWATCH â€” System Report', 14, 13)
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
      doc.text(`Period: ${data.period.from}  ?  ${data.period.to}`, 14, 21)
      doc.text(`Generated: ${new Date().toLocaleString()}  |  Super Admin`, 14, 27)
      y = 38

      const heading = (title: string) => {
        if (y > 260) { doc.addPage(); y = 15 }
        doc.setFontSize(10); doc.setFont('helvetica', 'bold')
        doc.setTextColor(26, 71, 49)
        doc.text(title, 14, y); y += 5
      }

      const tbl = (head: string[][], body: (string | number)[][], opts?: any) => {
        autoTable(doc, {
          startY: y, head, body, theme: 'striped',
          headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          margin: { left: 14, right: 14 },
          ...opts,
        })
        y = (doc as any).lastAutoTable.finalY + 7
      }

      // 1. Summary
      heading('1. Summary Statistics')
      tbl([['Metric', 'Value']], [
        ['Total Users',          data.user_summary.total],
        ['Active Users',         data.user_summary.active],
        ['Inactive Users',       data.user_summary.inactive],
        ['New Users (period)',   data.user_summary.new_in_period.length],
        ['Total Threat Reports', data.threat_reports.total],
        ['Pending Reports',      data.threat_reports.by_status.find(s => s.status === 'pending')?.count ?? 0],
        ['Under Review Reports', data.threat_reports.by_status.find(s => s.status === 'under_review')?.count ?? 0],
        ['Resolved Reports',     data.threat_reports.by_status.find(s => s.status === 'resolved')?.count ?? 0],
        ['Total Sites',          data.program_overview.total_sites],
        ['Monitoring Records',   data.program_overview.monitoring_count],
        ['Platform Actions',     data.platform_activity.total_actions],
        ['Geo Mismatches',       data.data_integrity.geo_mismatches],
        ['Flagged Plantations',  data.data_integrity.flagged_plantations],
        ['Dead Plantations',     data.data_integrity.dead_plantations],
      ], { columnStyles: { 0: { cellWidth: 80 } } })

      // 2. Users by role
      heading('2. Users by Role')
      tbl([['Role', 'Count']], data.user_summary.by_role.map(r => [ROLE_LABELS[r.role] ?? r.role, r.count]))

      // 3. Threat reports by category
      heading('3. Threat Reports by Category')
      tbl([['Category', 'Count']], data.threat_reports.by_category.map(c => [
        c.category.charAt(0).toUpperCase() + c.category.slice(1), c.count,
      ]))

      // 4. Recent threat reports
      heading('4. Threat Reports (up to 50)')
      tbl(
        [['ID', 'Title', 'Category', 'Status', 'Location', 'Date']],
        data.threat_reports.recent.slice(0, 50).map(r => [
          `#${r.id}`,
          r.title.length > 38 ? r.title.slice(0, 38) + 'â€¦' : r.title,
          r.category, r.status,
          r.location_name ?? 'â€”',
          r.created_at.split('T')[0],
        ])
      )

      // 5. New users
      if (data.user_summary.new_in_period.length > 0) {
        heading('5. New Users in Period')
        tbl(
          [['Name', 'Email', 'Role', 'Status', 'Joined']],
          data.user_summary.new_in_period.slice(0, 50).map(u => [
            u.name, u.email, ROLE_LABELS[u.role] ?? u.role,
            u.is_active ? 'Active' : 'Inactive',
            u.created_at.split('T')[0],
          ])
        )
      }

      // 6. Program overview
      heading('6. Program Overview')
      tbl([['Metric', 'Value']], [
        ['Total Sites', data.program_overview.total_sites],
        ...data.program_overview.sites_by_status.map(s => [`  Sites â€” ${s.status}`, s.count]),
        ...data.program_overview.plantation_summary.map(p => [`  Plantations â€” ${p.status}`, p.count]),
        ['Monitoring Records', data.program_overview.monitoring_count],
      ], { columnStyles: { 0: { cellWidth: 80 } } })

      // 7. Data integrity
      heading('7. Data Integrity')
      tbl([['Issue', 'Count']], [
        ['Geo Mismatches',       data.data_integrity.geo_mismatches],
        ['Flagged Plantations',  data.data_integrity.flagged_plantations],
        ['Dead Plantations',     data.data_integrity.dead_plantations],
        ['Sites with No Activity', data.data_integrity.sites_with_no_activity.length],
      ])

      // 8. Top platform actions
      heading('8. Top Platform Actions')
      tbl([['Action', 'Count']], data.platform_activity.by_action.slice(0, 20).map(a => [a.action, a.count]))

      doc.save(`system-report-${dateFrom}-to-${dateTo}.pdf`)
      toast.success('PDF exported.')
    } catch (err) {
      console.error(err)
      toast.error('PDF export failed.')
    } finally {
      setExporting(null)
    }
  }

  // -- Guards ------------------------------------------------------------------
  if (authLoading) return (
    <div className="flex items-center justify-center h-screen bg-[#f5f7f5]">
      <LoadingSpinner />
    </div>
  )
  if (!isAdmin) return (
    <SidebarLayout title="Reports">
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Access denied.</p>
      </div>
    </SidebarLayout>
  )

  const d = data

  // Filtered threat reports
  const filteredThreats = d?.threat_reports.recent.filter(r => {
    const matchSearch   = !threatSearch || r.title.toLowerCase().includes(threatSearch.toLowerCase()) || (r.location_name ?? '').toLowerCase().includes(threatSearch.toLowerCase())
    const matchStatus   = !threatStatusFilter   || r.status   === threatStatusFilter
    const matchCategory = !threatCategoryFilter || r.category === threatCategoryFilter
    return matchSearch && matchStatus && matchCategory
  }) ?? []

  return (
    <SidebarLayout title="Reports" subtitle="Super Admin â€” System Reports">
      <div className="page-container space-y-6">

        {/* -- Page Header ---------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              System Reports
            </h1>
            <p className="page-subtitle">
              Platform-wide data for Super Admin review, analysis, and export.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={handleExportCSV}
              disabled={!d || exporting !== null}
              className="btn-secondary gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting === 'csv' ? 'Exportingâ€¦' : 'Export CSV'}
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!d || exporting !== null}
              className="btn-primary gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting === 'pdf' ? 'Generating PDFâ€¦' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* -- Date Filter ----------------------------------------------------- */}
        <div className="card !p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 self-center mr-1">
              <Calendar className="w-4 h-4 text-primary-600" />
              Date Range
            </div>
            <div>
              <label className="label">From</label>
              <input type="date" className="input w-40" value={dateFrom} max={dateTo}
                onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input w-40" value={dateTo}
                min={dateFrom} max={toDateStr(new Date())}
                onChange={e => setDateTo(e.target.value)} />
            </div>

            {/* Presets */}
            <div className="relative">
              <button onClick={() => setShowPresets(p => !p)}
                className="btn-secondary gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Presets
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showPresets && 'rotate-180')} />
              </button>
              {showPresets && (
                <div className="absolute top-full mt-1.5 left-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[148px] animate-slide-down">
                  {PRESETS.map(p => (
                    <button key={p.label}
                      onClick={() => { setDateFrom(p.from()); setDateTo(p.to()); setShowPresets(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={fetchReport} disabled={loading} className="btn-primary gap-2">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              {loading ? 'Loadingâ€¦' : 'Apply'}
            </button>

            {d && (
              <p className="text-xs text-gray-400 ml-auto self-center">
                <span className="font-semibold text-gray-600">{d.period.from}</span>
                {' ? '}
                <span className="font-semibold text-gray-600">{d.period.to}</span>
              </p>
            )}
          </div>
        </div>

        {/* -- Loading --------------------------------------------------------- */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <LoadingSpinner />
            <p className="text-sm">Loading report dataâ€¦</p>
          </div>
        )}

        {/* -- Empty state ----------------------------------------------------- */}
        {!loading && !d && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <FileText className="w-10 h-10 opacity-25" />
            <p className="text-sm">Select a date range and click Apply.</p>
          </div>
        )}

        {/* -- Content --------------------------------------------------------- */}
        {!loading && d && (
          <div className="space-y-6 animate-fade-in">

            {/* -- KPI Cards --------------------------------------------------- */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
              <StatCard title="Total Users"      value={d.user_summary.total}                   icon={Users}        color="text-blue-600"   bgColor="bg-blue-50"   accentClass="border-l-4 border-blue-400" />
              <StatCard title="New Users"        value={d.user_summary.new_in_period.length}    icon={TrendingUp}   color="text-violet-600" bgColor="bg-violet-50" accentClass="border-l-4 border-violet-400" subtitle="in period" />
              <StatCard title="Threat Reports"   value={d.threat_reports.total}                 icon={AlertTriangle}color="text-orange-600" bgColor="bg-orange-50" accentClass="border-l-4 border-orange-400" />
              <StatCard title="Platform Actions" value={d.platform_activity.total_actions}      icon={Activity}     color="text-teal-600"   bgColor="bg-teal-50"   accentClass="border-l-4 border-teal-400" />
              <StatCard title="Total Sites"      value={d.program_overview.total_sites}         icon={Leaf}         color="text-green-600"  bgColor="bg-green-50"  accentClass="border-l-4 border-green-400" />
              <StatCard title="Geo Mismatches"   value={d.data_integrity.geo_mismatches}        icon={Shield}       color="text-red-600"    bgColor="bg-red-50"    accentClass="border-l-4 border-red-400" />
            </div>

            {/* -- Tabs -------------------------------------------------------- */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex overflow-x-auto border-b border-gray-100">
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
                  </button>
                ))}
              </div>

              <div className="p-5 sm:p-6">
                {/* -- OVERVIEW ---------------------------------------------- */}
                {tab === 'overview' && (
                  <div className="space-y-6 animate-fade-in">

                    {/* Charts row */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className="lg:col-span-3">
                        <SectionHeader title="Threat Reports Over Time" />
                        <div className="bg-gray-50 rounded-xl p-4 h-52">
                          <ReportsOverTimeChart
                            data={d.platform_activity.over_time.map(o => ({ month: o.date, count: o.count }))}
                          />
                        </div>
                      </div>
                      <div className="lg:col-span-2">
                        <SectionHeader title="Reports by Category" />
                        <div className="bg-gray-50 rounded-xl p-4 h-52 flex items-center justify-center">
                          <CategoryDonutChart data={d.threat_reports.by_category} />
                        </div>
                      </div>
                    </div>

                    {/* Three breakdown cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Reports by status */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Reports by Status" count={d.threat_reports.total} />
                        <div className="space-y-3">
                          {d.threat_reports.by_status.map(s => (
                            <div key={s.status} className="flex items-center gap-3">
                              <Badge label={s.status} />
                              <MiniBar value={s.count} max={d.threat_reports.total}
                                color={s.status === 'resolved' ? 'bg-green-500' : s.status === 'under_review' ? 'bg-blue-400' : 'bg-amber-400'} />
                              <span className="text-sm font-bold text-gray-800 w-8 text-right tabular-nums">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Reports by category */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Reports by Category" />
                        <div className="space-y-3">
                          {d.threat_reports.by_category.map(c => (
                            <div key={c.category} className="flex items-center gap-3">
                              <Badge label={c.category} />
                              <MiniBar value={c.count} max={d.threat_reports.total} color="bg-primary-500" />
                              <span className="text-sm font-bold text-gray-800 w-8 text-right tabular-nums">{c.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Users by role */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Users by Role" count={d.user_summary.total} />
                        <div className="space-y-3">
                          {d.user_summary.by_role.map(r => (
                            <div key={r.role} className="flex items-center gap-3">
                              <span className="text-xs text-gray-600 w-28 truncate shrink-0">{ROLE_LABELS[r.role] ?? r.role}</span>
                              <MiniBar value={r.count} max={d.user_summary.total} color="bg-blue-400" />
                              <span className="text-sm font-bold text-gray-800 w-8 text-right tabular-nums">{r.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Program + field activity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Sites by Status" count={d.program_overview.total_sites} />
                        <div className="space-y-3">
                          {d.program_overview.sites_by_status.map(s => (
                            <div key={s.status} className="flex items-center gap-3">
                              <Badge label={s.status} />
                              <MiniBar value={s.count} max={d.program_overview.total_sites}
                                color={s.status === 'active' ? 'bg-blue-500' : s.status === 'completed' ? 'bg-teal-500' : 'bg-gray-400'} />
                              <span className="text-sm font-bold text-gray-800 w-8 text-right tabular-nums">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Field Activity" subtitle="in period" />
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Monitoring Records', value: d.program_overview.monitoring_count, color: 'bg-teal-50 text-teal-700' },
                            { label: 'Flagged Plantations',value: d.data_integrity.flagged_plantations, color: 'bg-orange-50 text-orange-700' },
                            { label: 'Dead Plantations',   value: d.data_integrity.dead_plantations,    color: 'bg-red-50 text-red-700' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className={cn('rounded-xl p-3', color)}>
                              <p className="text-xs font-semibold opacity-70 leading-tight">{label}</p>
                              <p className="text-2xl font-bold tabular-nums mt-0.5">{value.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* -- THREAT REPORTS ---------------------------------------- */}
                {tab === 'threats' && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input className="input pl-9 w-56" placeholder="Search title or locationâ€¦"
                          value={threatSearch} onChange={e => setThreatSearch(e.target.value)} />
                      </div>
                      <select className="input w-36"
                        value={threatStatusFilter} onChange={e => setThreatStatusFilter(e.target.value)}>
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="under_review">Under Review</option>
                        <option value="resolved">Resolved</option>
                      </select>
                      <select className="input w-36"
                        value={threatCategoryFilter} onChange={e => setThreatCategoryFilter(e.target.value)}>
                        <option value="">All categories</option>
                        <option value="damage">Damage</option>
                        <option value="restoration">Restoration</option>
                        <option value="wildlife">Wildlife</option>
                        <option value="pollution">Pollution</option>
                        <option value="other">Other</option>
                      </select>
                      {(threatSearch || threatStatusFilter || threatCategoryFilter) && (
                        <button className="btn-ghost text-xs"
                          onClick={() => { setThreatSearch(''); setThreatStatusFilter(''); setThreatCategoryFilter('') }}>
                          <XCircle className="w-3.5 h-3.5" /> Clear
                        </button>
                      )}
                      <span className="text-xs text-gray-400 ml-auto self-center">
                        {filteredThreats.length} of {d.threat_reports.total} reports
                      </span>
                    </div>

                    {/* Summary mini-cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {d.threat_reports.by_status.map(s => (
                        <button key={s.status}
                          onClick={() => setThreatStatusFilter(threatStatusFilter === s.status ? '' : s.status)}
                          className={cn(
                            'rounded-xl p-3 text-left transition-all border-2',
                            threatStatusFilter === s.status ? 'border-primary-400 bg-primary-50' : 'border-transparent bg-gray-50 hover:bg-gray-100'
                          )}>
                          <div className="flex items-center justify-between mb-1">
                            <Badge label={s.status} dot={false} />
                            {threatStatusFilter === s.status && <CheckCircle className="w-3.5 h-3.5 text-primary-500" />}
                          </div>
                          <p className="text-2xl font-bold text-gray-800 tabular-nums">{s.count}</p>
                        </button>
                      ))}
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            {['#', 'Title', 'Category', 'Status', 'Location', 'Submitted By', 'Date'].map(h => (
                              <th key={h} className="table-header">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredThreats.length === 0
                            ? <EmptyRow cols={7} message="No reports match the current filters." />
                            : filteredThreats.map(r => (
                              <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                                <td className="table-cell font-mono text-xs text-gray-400">#{r.id}</td>
                                <td className="table-cell font-medium text-gray-800 max-w-[180px]">
                                  <span className="block truncate" title={r.title}>{r.title}</span>
                                </td>
                                <td className="table-cell"><Badge label={r.category} /></td>
                                <td className="table-cell"><Badge label={r.status} /></td>
                                <td className="table-cell text-gray-500 max-w-[140px]">
                                  <span className="block truncate">{r.location_name ?? 'â€”'}</span>
                                </td>
                                <td className="table-cell text-gray-500">{r.user?.name ?? 'â€”'}</td>
                                <td className="table-cell text-gray-400 whitespace-nowrap tabular-nums">
                                  {r.created_at.split('T')[0]}
                                </td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* -- USERS -------------------------------------------------- */}
                {tab === 'users' && (
                  <div className="space-y-5 animate-fade-in">
                    {/* KPI row */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total Users',  value: d.user_summary.total,    color: 'bg-blue-50 text-blue-700',   border: 'border-blue-200' },
                        { label: 'Active',       value: d.user_summary.active,   color: 'bg-green-50 text-green-700', border: 'border-green-200' },
                        { label: 'Inactive',     value: d.user_summary.inactive, color: 'bg-red-50 text-red-700',     border: 'border-red-200' },
                      ].map(({ label, value, color, border }) => (
                        <div key={label} className={cn('rounded-xl p-4 border', color, border)}>
                          <p className="text-xs font-semibold opacity-60 uppercase tracking-wide">{label}</p>
                          <p className="text-3xl font-bold tabular-nums mt-1">{value.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>

                    {/* Role breakdown */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <SectionHeader title="Distribution by Role" />
                      <div className="space-y-2.5">
                        {d.user_summary.by_role.map(r => (
                          <div key={r.role} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-36 shrink-0">{ROLE_LABELS[r.role] ?? r.role}</span>
                            <MiniBar value={r.count} max={d.user_summary.total} color="bg-blue-400" />
                            <span className="text-sm font-bold text-gray-800 w-8 text-right tabular-nums">{r.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* New users table */}
                    <div>
                      <SectionHeader title="New Users in Period" count={d.user_summary.new_in_period.length} />
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              {['Name', 'Email', 'Role', 'Status', 'Joined'].map(h => (
                                <th key={h} className="table-header">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {d.user_summary.new_in_period.length === 0
                              ? <EmptyRow cols={5} message="No new users in this period." />
                              : d.user_summary.new_in_period.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                                  <td className="table-cell">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-forest-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                        {u.name[0]?.toUpperCase()}
                                      </div>
                                      <span className="font-medium text-gray-800">{u.name}</span>
                                    </div>
                                  </td>
                                  <td className="table-cell text-gray-500">{u.email}</td>
                                  <td className="table-cell">
                                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                      {ROLE_LABELS[u.role] ?? u.role}
                                    </span>
                                  </td>
                                  <td className="table-cell">
                                    {u.is_active
                                      ? <span className="flex items-center gap-1 text-green-600 text-xs font-semibold"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                                      : <span className="flex items-center gap-1 text-red-500 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" />Inactive</span>
                                    }
                                  </td>
                                  <td className="table-cell text-gray-400 tabular-nums">{u.created_at.split('T')[0]}</td>
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
                {/* -- PROGRAM ------------------------------------------------ */}
                {tab === 'program' && (
                  <div className="space-y-5 animate-fade-in">
                    {/* KPI row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Sites',        value: d.program_overview.total_sites,          color: 'bg-green-50 text-green-700 border-green-200' },
                        { label: 'Monitoring Records', value: d.program_overview.monitoring_count,     color: 'bg-teal-50 text-teal-700 border-teal-200' },
                        { label: 'Total Events',       value: d.program_overview.events_summary.reduce((a, e) => a + e.count, 0), color: 'bg-violet-50 text-violet-700 border-violet-200' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={cn('rounded-xl p-4 border', color)}>
                          <p className="text-xs font-semibold opacity-60 uppercase tracking-wide">{label}</p>
                          <p className="text-3xl font-bold tabular-nums mt-1">{value.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Sites by status */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Sites by Status" count={d.program_overview.total_sites} />
                        <div className="space-y-3">
                          {d.program_overview.sites_by_status.map(s => (
                            <div key={s.status} className="flex items-center gap-3">
                              <Badge label={s.status} />
                              <MiniBar value={s.count} max={d.program_overview.total_sites}
                                color={s.status === 'active' ? 'bg-blue-500' : s.status === 'completed' ? 'bg-teal-500' : 'bg-gray-400'} />
                              <span className="text-sm font-bold text-gray-800 w-6 text-right tabular-nums">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Plantations by status */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Plantations by Status" />
                        <div className="space-y-3">
                          {d.program_overview.plantation_summary.map(p => {
                            const total = d.program_overview.plantation_summary.reduce((a, x) => a + x.count, 0)
                            return (
                              <div key={p.status} className="flex items-center gap-3">
                                <Badge label={p.status} />
                                <MiniBar value={p.count} max={total}
                                  color={p.status === 'active' ? 'bg-green-500' : p.status === 'flagged' ? 'bg-orange-400' : 'bg-red-400'} />
                                <span className="text-sm font-bold text-gray-800 w-8 text-right tabular-nums">{p.count}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Events by status */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <SectionHeader title="Events by Status" />
                        <div className="space-y-3">
                          {d.program_overview.events_summary.map(e => {
                            const total = d.program_overview.events_summary.reduce((a, x) => a + x.count, 0)
                            return (
                              <div key={e.status} className="flex items-center gap-3">
                                <Badge label={e.status} />
                                <MiniBar value={e.count} max={total} color="bg-violet-400" />
                                <span className="text-sm font-bold text-gray-800 w-6 text-right tabular-nums">{e.count}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Sites with no activity */}
                    {d.data_integrity.sites_with_no_activity.length > 0 && (
                      <div>
                        <SectionHeader
                          title="Sites with No Plantation Activity"
                          count={d.data_integrity.sites_with_no_activity.length}
                          subtitle="These sites have zero plantation records submitted"
                        />
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                {['Site Name', 'Barangay', 'Status', 'Created'].map(h => (
                                  <th key={h} className="table-header">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {d.data_integrity.sites_with_no_activity.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                                  <td className="table-cell font-medium text-gray-800">{s.name}</td>
                                  <td className="table-cell text-gray-500">{s.barangay ?? 'â€”'}</td>
                                  <td className="table-cell"><Badge label={s.status} /></td>
                                  <td className="table-cell text-gray-400 tabular-nums">{s.created_at.split('T')[0]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* -- DATA INTEGRITY ----------------------------------------- */}
                {tab === 'integrity' && (
                  <div className="space-y-5 animate-fade-in">
                    {/* KPI row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Geo Mismatches',       value: d.data_integrity.geo_mismatches,                        color: 'bg-red-50 text-red-700 border-red-200' },
                        { label: 'Flagged Plantations',  value: d.data_integrity.flagged_plantations,                   color: 'bg-orange-50 text-orange-700 border-orange-200' },
                        { label: 'Dead Plantations',     value: d.data_integrity.dead_plantations,                      color: 'bg-gray-100 text-gray-700 border-gray-200' },
                        { label: 'Inactive Sites',       value: d.data_integrity.sites_with_no_activity.length,         color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={cn('rounded-xl p-4 border', color)}>
                          <p className="text-xs font-semibold opacity-60 uppercase tracking-wide">{label}</p>
                          <p className="text-3xl font-bold tabular-nums mt-1">{value.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>

                    {/* Info box */}
                    <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800 space-y-1">
                        <p className="font-semibold">Data Quality Notes</p>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-700 text-xs">
                          <li><strong>Geo Mismatches</strong> â€” plantation records submitted outside the expected site boundary.</li>
                          <li><strong>Flagged Plantations</strong> â€” records marked for review by field workers or the system.</li>
                          <li><strong>Dead Plantations</strong> â€” trees confirmed dead via monitoring records.</li>
                          <li><strong>Inactive Sites</strong> â€” restoration sites with zero plantation records submitted.</li>
                        </ul>
                      </div>
                    </div>

                    {/* Inactive sites table */}
                    {d.data_integrity.sites_with_no_activity.length > 0 && (
                      <div>
                        <SectionHeader title="Sites with No Activity" count={d.data_integrity.sites_with_no_activity.length} />
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                {['Site Name', 'Barangay', 'Status', 'Created'].map(h => (
                                  <th key={h} className="table-header">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {d.data_integrity.sites_with_no_activity.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                                  <td className="table-cell font-medium text-gray-800">{s.name}</td>
                                  <td className="table-cell text-gray-500">{s.barangay ?? 'â€”'}</td>
                                  <td className="table-cell"><Badge label={s.status} /></td>
                                  <td className="table-cell text-gray-400 tabular-nums">{s.created_at.split('T')[0]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* -- ACTIVITY ----------------------------------------------- */}
                {tab === 'activity' && (
                  <div className="space-y-5 animate-fade-in">
                    {/* Total actions KPI */}
                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-4">
                      <div className="p-3 bg-teal-100 rounded-xl">
                        <Activity className="w-5 h-5 text-teal-700" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Total Platform Actions</p>
                        <p className="text-3xl font-bold text-teal-800 tabular-nums">{d.platform_activity.total_actions.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Top actions */}
                      <div>
                        <SectionHeader title="Top Actions" count={d.platform_activity.by_action.length} />
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="table-header">Action</th>
                                <th className="table-header w-24 text-right">Count</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {d.platform_activity.by_action.length === 0
                                ? <EmptyRow cols={2} message="No activity in this period." />
                                : d.platform_activity.by_action.map((a, i) => (
                                  <tr key={a.action} className="hover:bg-gray-50/70 transition-colors">
                                    <td className="table-cell">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-300 font-mono w-5 shrink-0">{i + 1}</span>
                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{a.action}</span>
                                      </div>
                                    </td>
                                    <td className="table-cell text-right font-bold text-gray-800 tabular-nums">{a.count}</td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Most active users */}
                      <div>
                        <SectionHeader title="Most Active Users" />
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="table-header">User</th>
                                <th className="table-header">Role</th>
                                <th className="table-header w-20 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {d.platform_activity.by_user.length === 0
                                ? <EmptyRow cols={3} message="No user activity in this period." />
                                : d.platform_activity.by_user.map(u => (
                                  <tr key={u.user_id} className="hover:bg-gray-50/70 transition-colors">
                                    <td className="table-cell font-medium text-gray-800">
                                      {u.user?.name ?? `User #${u.user_id}`}
                                    </td>
                                    <td className="table-cell text-gray-500 text-xs">
                                      {ROLE_LABELS[u.user?.role ?? ''] ?? u.user?.role ?? 'â€”'}
                                    </td>
                                    <td className="table-cell text-right font-bold text-gray-800 tabular-nums">
                                      {u.action_count}
                                    </td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Activity over time */}
                    {d.platform_activity.over_time.length > 0 && (
                      <div>
                        <SectionHeader title="Daily Activity" count={d.platform_activity.over_time.length} subtitle="days" />
                        <div className="bg-gray-50 rounded-xl p-4 h-48">
                          <ReportsOverTimeChart
                            data={d.platform_activity.over_time.map(o => ({ month: o.date, count: o.count }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>{/* /tab panel */}
            </div>{/* /tab card */}
          </div>
        )}{/* /!loading && d */}

      </div>{/* /page-container */}
    </SidebarLayout>
  )
}
