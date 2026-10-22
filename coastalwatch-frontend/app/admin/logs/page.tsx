'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  Search, Download, SlidersHorizontal, CalendarDays,
  ShieldCheck, LogIn, AlertTriangle, Database, FileText, Settings as Cog,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Category = 'access' | 'authentication' | 'security' | 'system'

interface LogRow {
  id: number
  action: string
  category: Category
  title: string
  description: string
  created_at: string
  ip_address?: string | null
  user?: { id: number; name: string; email: string } | null
}

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: '',               label: 'All event types' },
  { value: 'access',         label: 'Access' },
  { value: 'authentication', label: 'Authentication' },
  { value: 'security',       label: 'Security' },
  { value: 'system',         label: 'System' },
]

const DATE_RANGES: { value: string; label: string }[] = [
  { value: '',    label: 'All time' },
  { value: '1',   label: 'Today' },
  { value: '7',   label: 'Last 7 days' },
  { value: '30',  label: 'Last 30 days' },
  { value: '90',  label: 'Last 90 days' },
]

// Per-category visual treatment: icon + badge + icon-chip colours.
const CATEGORY_META: Record<Category, { label: string; icon: typeof ShieldCheck; chip: string; badge: string }> = {
  access:         { label: 'Access',         icon: ShieldCheck,    chip: 'bg-teal-50 text-teal-600',    badge: 'bg-teal-50 text-teal-700' },
  authentication: { label: 'Authentication', icon: LogIn,          chip: 'bg-blue-50 text-blue-600',    badge: 'bg-blue-50 text-blue-700' },
  security:       { label: 'Security',       icon: AlertTriangle,  chip: 'bg-red-50 text-red-600',      badge: 'bg-red-50 text-red-700' },
  system:         { label: 'System',         icon: Database,       chip: 'bg-purple-50 text-purple-600',badge: 'bg-purple-50 text-purple-700' },
}

function iconFor(row: LogRow) {
  if (row.action.startsWith('report.')) return FileText
  if (row.action.startsWith('backup.')) return Database
  if (row.action.startsWith('user.login') || row.action.startsWith('user.logout')) return LogIn
  if (row.action.includes('settings')) return Cog
  return CATEGORY_META[row.category]?.icon ?? ShieldCheck
}

export default function AdminLogsPage() {
  const { isStaff, loading: authLoading, user } = useAuth()
  const router = useRouter()

  const [logs, setLogs] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [rangeFilter, setRangeFilter] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (user !== null && !isStaff) router.replace('/login')
  }, [authLoading, user, isStaff]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isStaff) { if (!isStaff) setLoading(false); return }
    loadLogs()
  }, [authLoading, isStaff, page, search, typeFilter, rangeFilter]) // eslint-disable-line

  function rangeParams() {
    if (!rangeFilter) return {}
    const d = new Date()
    d.setDate(d.getDate() - (Number(rangeFilter) - 1))
    return { date_from: d.toISOString().slice(0, 10) }
  }

  async function loadLogs() {
    try {
      const { data } = await api.get('/admin/activity-logs', {
        params: { page, search: search || undefined, type: typeFilter || undefined, ...rangeParams() },
      })
      setLogs(data)
    } catch { toast.error('Failed to load logs') }
    finally { setLoading(false) }
  }

  async function exportLogs() {
    setExporting(true)
    try {
      const { data } = await api.get('/admin/activity-logs/export', {
        params: { search: search || undefined, type: typeFilter || undefined, ...rangeParams() },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch { toast.error('Failed to export logs') }
    finally { setExporting(false) }
  }

  const rows: LogRow[] = logs?.data ?? []
  const activeTypeLabel = EVENT_TYPES.find(t => t.value === typeFilter)?.label ?? 'Event type'
  const activeRangeLabel = DATE_RANGES.find(r => r.value === rangeFilter)?.label ?? 'Date range'

  if (authLoading || loading) return (
    <SidebarLayout title="System Logs">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="System Logs" subtitle="Audit trail">
      <div className="page-container space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-in">
          <div>
            <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest">Audit Trail</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">System logs</h2>
            <p className="text-sm text-gray-500 mt-0.5">Review activity, authentication, and security events.</p>
          </div>
          <button onClick={exportLogs} disabled={exporting}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors">
            <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export logs'}
          </button>
        </div>

        {/* Toolbar: search + Event type + Date range */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[16rem] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-10 w-full" placeholder="Search logs…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>

          {/* Event type dropdown */}
          <FilterDropdown
            open={typeOpen} setOpen={setTypeOpen}
            icon={<SlidersHorizontal className="w-4 h-4" />}
            label={typeFilter ? activeTypeLabel : 'Event type'}
            active={!!typeFilter}
            options={EVENT_TYPES}
            value={typeFilter}
            onChange={v => { setTypeFilter(v); setPage(1); setTypeOpen(false) }}
          />

          {/* Date range dropdown */}
          <FilterDropdown
            open={rangeOpen} setOpen={setRangeOpen}
            icon={<CalendarDays className="w-4 h-4" />}
            label={rangeFilter ? activeRangeLabel : 'Date range'}
            active={!!rangeFilter}
            options={DATE_RANGES}
            value={rangeFilter}
            onChange={v => { setRangeFilter(v); setPage(1); setRangeOpen(false) }}
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">Event</th>
                  <th className="table-header">Date &amp; Time</th>
                  <th className="table-header">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => {
                  const meta = CATEGORY_META[row.category] ?? CATEGORY_META.system
                  const Icon = iconFor(row)
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-start gap-3">
                          <span className={cn('p-2 rounded-lg shrink-0', meta.chip)}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{row.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{row.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-gray-500 whitespace-nowrap">{fmtWhen(row.created_at)}</td>
                      <td className="table-cell">
                        <span className={cn('inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full', meta.badge)}>
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!rows.length && <p className="text-center text-gray-400 text-sm py-10">No log entries found</p>}
          </div>

          {logs && logs.last_page > 1 && (
            <div className="p-4 border-t border-gray-100">
              <Pagination currentPage={logs.current_page} lastPage={logs.last_page} onPageChange={setPage} />
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}

// ── Filter dropdown ───────────────────────────────────────────────────────────
interface FilterDropdownProps {
  open: boolean
  setOpen: (v: boolean) => void
  icon: React.ReactNode
  label: string
  active: boolean
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}

function FilterDropdown({ open, setOpen, icon, label, active, options, value, onChange }: FilterDropdownProps) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors',
          open || active ? 'border-primary-300 text-primary-700 bg-primary-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        )}>
        {icon}{label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-20 animate-scale-in origin-top-right">
            {options.map(opt => (
              <button key={opt.value} onClick={() => onChange(opt.value)}
                className={cn(
                  'w-full text-left px-3.5 py-2 text-sm transition-colors',
                  value === opt.value ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Format "Today, 09:42 AM" / "Yesterday, 02:00 AM" / "Oct 14, 02:00 AM".
function fmtWhen(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return iso
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return `Today, ${time}`
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}
