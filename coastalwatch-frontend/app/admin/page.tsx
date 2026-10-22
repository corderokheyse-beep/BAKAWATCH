'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn, timeAgo } from '@/lib/utils'
import {
  Users, CalendarDays, AlertTriangle, Activity as ActivityIcon,
  Database, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock,
  RefreshCw, ArrowUpRight,
} from 'lucide-react'

// Chart components register chart.js themselves — load them client-side only.
const DashboardBarChart    = nextDynamic(() => import('@/components/charts/DashboardBarChart'), { ssr: false })
const SystemActivityChart  = nextDynamic(() => import('@/components/charts/SystemActivityChart'), { ssr: false })

// ── Types for the Phase 1 dashboard payload ──────────────────────────────────
interface SuperAdminMetrics {
  week: { from: string; to: string }
  total_users: number
  users_this_week: number
  total_planting_events: number
  planting_events_this_week: number
  threat_reports_total: number
  threat_reports_this_week: number
  growth_monitoring_total: number
  growth_monitoring_this_week: number
}

interface LatestBackup {
  status: 'completed' | 'failed'
  created_at: string
  size_bytes?: number | null
  size_label?: string | null
  error?: string | null
}

interface RecentAlert {
  id: number
  title: string
  category: string
  severity?: string | null
  status: string
  location_name?: string | null
  created_at: string
  user?: { id: number; name: string }
}

interface SummarySeriesPoint { date: string; count: number }
interface SummaryReportBlock {
  subtitle: string
  label: string
  series: SummarySeriesPoint[]
  total: number
}
interface SummaryReports {
  threat_reports: SummaryReportBlock
  growth_monitoring: SummaryReportBlock
  planting_events: SummaryReportBlock
  user_activity: SummaryReportBlock
}

interface SystemActivityPoint { date: string; count: number; alerts: number }
interface SystemActivityTotals { successful: number; alerts: number }

interface HealthComponent { name: string; ok: boolean; critical: boolean }
interface SystemHealth {
  status: 'operational' | 'degraded' | 'down'
  components: HealthComponent[]
  checked_at: string
  last_backup: LatestBackup | null
}

export default function AdminDashboardPage() {
  const { user, isStaff, loading: authLoading } = useAuth()
  const router = useRouter()

  const [metrics, setMetrics] = useState<SuperAdminMetrics | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [systemActivity, setSystemActivity] = useState<SystemActivityPoint[]>([])
  const [activityTotals, setActivityTotals] = useState<SystemActivityTotals>({ successful: 0, alerts: 0 })
  const [latestBackup, setLatestBackup] = useState<LatestBackup | null>(null)
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([])
  const [summary, setSummary] = useState<SummaryReports | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function loadDashboard() {
    try {
      const { data } = await api.get('/admin/dashboard')
      setMetrics(data.super_admin ?? null)
      setHealth(data.system_health ?? null)
      setSystemActivity(data.system_activity ?? [])
      setActivityTotals(data.system_activity_totals ?? { successful: 0, alerts: 0 })
      setLatestBackup(data.latest_backup ?? null)
      setRecentAlerts(data.recent_alerts ?? [])
      setSummary(data.summary_reports ?? null)
    } catch { /* non-blocking */ }
  }

  useEffect(() => {
    if (authLoading) return
    if (user !== null && !isStaff) { router.replace('/login'); return }
    if (!isStaff) { setLoading(false); return }
    loadDashboard().finally(() => setLoading(false))
  }, [authLoading, isStaff, user]) // eslint-disable-line

  async function handleRefresh() {
    setRefreshing(true)
    await loadDashboard()
    setRefreshing(false)
  }

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const todayLabel = useMemo(() => new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }), [])

  if (authLoading || loading) return (
    <SidebarLayout title="Dashboard">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const activityLabels = systemActivity.map(d => fmtDay(d.date))

  return (
    <SidebarLayout
      title="Dashboard"
      subtitle="Super Admin overview"
    >
      <div className="page-container space-y-6">

        {/* Greeting + Refresh */}
        <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-in">
          <div>
            <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest">{todayLabel}</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">
              {greeting}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}<span className="text-primary-500">.</span>
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Here&apos;s the latest overview of your platform.</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors">
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh data
          </button>
        </div>

        {/* System health banner */}
        {health && <SystemHealthBanner health={health} />}

        {/* 4 metric cards with weekly deltas */}
        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
            <MetricCard
              icon={Users} title="Total Users" value={metrics.total_users}
              delta={metrics.users_this_week} deltaLabel="added this week"
              color="text-blue-600" bgColor="bg-blue-50" accent="border-blue-500"
              href="/admin/users"
            />
            <MetricCard
              icon={CalendarDays} title="Total Planting Events" value={metrics.total_planting_events}
              delta={metrics.planting_events_this_week} deltaLabel="this week"
              color="text-green-600" bgColor="bg-green-50" accent="border-green-500"
            />
            <MetricCard
              icon={AlertTriangle} title="Threat Reports" value={metrics.threat_reports_total}
              delta={metrics.threat_reports_this_week} deltaLabel="this week"
              color="text-amber-600" bgColor="bg-amber-50" accent="border-amber-500"
            />
            <MetricCard
              icon={ActivityIcon} title="Growth Monitoring" value={metrics.growth_monitoring_total}
              delta={metrics.growth_monitoring_this_week} deltaLabel="this week"
              color="text-teal-600" bgColor="bg-teal-50" accent="border-teal-500"
            />
          </div>
        )}

        {/* Summary Reports carousel (bar-chart style) */}
        {summary && <SummaryReportsCarousel summary={summary} />}

        {/* System Activity (left) + Latest Backup (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card lg:col-span-2">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <p className="section-title">System activity</p>
                <p className="text-xs text-gray-400 mt-0.5">Account and security events in the last 7 days</p>
              </div>
              <Link href="/admin/logs"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 shrink-0">
                View all logs <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {systemActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <ActivityIcon className="w-8 h-8 opacity-30" />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              <>
                <div className="h-56 mt-3">
                  <SystemActivityChart
                    labels={activityLabels}
                    successful={systemActivity.map(d => d.count)}
                    alerts={systemActivity.map(d => d.alerts)}
                  />
                </div>
                <div className="flex items-center gap-5 mt-4 pt-3 border-t border-gray-50">
                  <LegendDot color="bg-teal-600" label="Successful events" value={activityTotals.successful} />
                  <LegendDot color="bg-orange-500" label="Security alerts" value={activityTotals.alerts} />
                </div>
              </>
            )}
          </div>

          {/* Latest Backup */}
          <LatestBackupCard backup={latestBackup} />
        </div>

        {/* Recent Alerts (full width) */}
        <RecentAlertsCard alerts={recentAlerts} />
      </div>
    </SidebarLayout>
  )
}

// ── Latest Backup card ────────────────────────────────────────────────────────
function LatestBackupCard({ backup }: { backup: LatestBackup | null }) {
  const completed = backup?.status === 'completed'
  return (
    <div className="card flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="section-title">Latest backup</p>
          <p className="text-xs text-gray-400 mt-0.5">Database protection</p>
        </div>
        <Database className="w-4 h-4 text-gray-400 shrink-0" />
      </div>

      {!backup ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
          <Database className="w-8 h-8 opacity-30" />
          <p className="text-sm">No backups recorded yet</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mt-4">
            {completed
              ? <span className="p-2 rounded-full bg-green-100 text-green-700 shrink-0"><CheckCircle className="w-5 h-5" /></span>
              : <span className="p-2 rounded-full bg-red-100 text-red-700 shrink-0"><XCircle className="w-5 h-5" /></span>}
            <div className="min-w-0">
              <p className={cn('text-sm font-bold', completed ? 'text-gray-900' : 'text-red-700')}>
                {completed ? 'Backup completed' : 'Last backup failed'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {completed ? 'Completed' : 'Attempted'} {timeAgo(backup.created_at)}
              </p>
            </div>
          </div>

          {completed ? (
            <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-50 text-sm">
              <BackupStat label="Backup size" value={backup.size_label ?? '—'} />
              <BackupStat label="Status" value="Completed" />
            </div>
          ) : (
            backup.error && (
              <p className="mt-4 pt-4 border-t border-gray-50 text-xs text-red-600 break-words">{backup.error}</p>
            )
          )}
        </>
      )}

      <Link href="/admin/backup"
        className="mt-5 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 rounded-xl py-2.5 transition-colors">
        View backup history <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

function BackupStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="font-semibold text-gray-800 mt-0.5">{value}</p>
    </div>
  )
}

// ── Recent Alerts card ────────────────────────────────────────────────────────
function RecentAlertsCard({ alerts }: { alerts: RecentAlert[] }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="section-title">Recent alerts</p>
          <p className="text-xs text-gray-400 mt-0.5">Items that may need your attention</p>
        </div>
        <Link href="/admin/threat-reports"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 shrink-0">
          View all <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
          <AlertTriangle className="w-8 h-8 opacity-30" />
          <p className="text-sm">No alerts</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 mt-2">
          {alerts.map(a => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="p-2 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {[a.category, a.location_name].filter(Boolean).join(' · ') || 'Threat report'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1 whitespace-nowrap">
                <Clock className="w-3 h-3" />{timeAgo(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-2 h-2 rounded-full', color)} />
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-bold text-gray-800 tabular-nums">{value.toLocaleString()}</span>
    </div>
  )
}

// Format an ISO date (YYYY-MM-DD) as a short "Mon D" label.
function fmtDay(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Summary Reports carousel (bar-chart style) ────────────────────────────────
// Four reports; left/right arrows move between them. Each shows a 7-day daily
// bar chart, a footer legend/total, and a "View all reports" link.
function SummaryReportsCarousel({ summary }: { summary: SummaryReports }) {
  const slides = useMemo(() => ([
    { key: 'threat_reports' as const,    title: 'Threat Reports' },
    { key: 'growth_monitoring' as const, title: 'Growth Monitoring Reports' },
    { key: 'planting_events' as const,   title: 'Planting Events' },
    { key: 'user_activity' as const,     title: 'User Activity Reports' },
  ]), [])

  const [index, setIndex] = useState(0)
  const total = slides.length
  const go = (delta: number) => setIndex(i => (i + delta + total) % total)
  const current = slides[index]
  const block = summary[current.key]
  const hasData = (block?.series?.some(p => p.count > 0)) ?? false

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Summary Reports</p>
          <h3 className="text-lg font-bold text-gray-900 mt-0.5">{current.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{block?.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => go(-1)} aria-label="Previous report"
            className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400 tabular-nums">{index + 1} of {total}</span>
          <button onClick={() => go(1)} aria-label="Next report"
            className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72 mt-5">
        {hasData ? (
          <DashboardBarChart
            labels={block.series.map(p => fmtDay(p.date))}
            data={block.series.map(p => p.count)}
            label={block.label}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <ActivityIcon className="w-8 h-8 opacity-30" />
            <p className="text-sm">No activity in the last 7 days</p>
          </div>
        )}
      </div>

      {/* Footer: legend/total + last 7 days + View all reports */}
      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-50 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-600" />
          <span className="text-xs text-gray-500">{block?.label}</span>
          <span className="text-sm font-bold text-gray-800 tabular-nums">{(block?.total ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">Last 7 days</span>
          <Link href="/admin/reports"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
            View all reports <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── System health banner ──────────────────────────────────────────────────────
function SystemHealthBanner({ health }: { health: SystemHealth }) {
  const map = {
    operational: {
      wrap: 'bg-green-50 border-green-200',
      iconWrap: 'bg-green-100 text-green-700',
      title: 'System health is operational',
      titleColor: 'text-green-800',
      desc: 'All core services are responding normally. No action is required.',
    },
    degraded: {
      wrap: 'bg-amber-50 border-amber-200',
      iconWrap: 'bg-amber-100 text-amber-700',
      title: 'System health is degraded',
      titleColor: 'text-amber-800',
      desc: 'A non-critical service is unavailable. Core features remain operational.',
    },
    down: {
      wrap: 'bg-red-50 border-red-200',
      iconWrap: 'bg-red-100 text-red-700',
      title: 'System health needs attention',
      titleColor: 'text-red-800',
      desc: 'A critical service is not responding. Immediate attention is required.',
    },
  }[health.status]

  return (
    <div className={cn('rounded-2xl border p-4 flex items-center justify-between gap-4 flex-wrap animate-fade-in', map.wrap)}>
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn('p-2.5 rounded-xl shrink-0', map.iconWrap)}>
          <ActivityIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className={cn('text-sm font-bold', map.titleColor)}>{map.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{map.desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        {/* Real component statuses — no fabricated uptime figure. */}
        <div className="flex items-center gap-3">
          {health.components.map(c => (
            <div key={c.name} className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', c.ok ? 'bg-green-500' : 'bg-red-500')} />
              <span className="text-xs font-semibold text-gray-600">{c.name}</span>
            </div>
          ))}
        </div>
        <div className="hidden sm:block w-px h-8 bg-gray-200" />
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Last checked</p>
          <p className="text-xs font-semibold text-gray-600">{timeAgo(health.checked_at)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Metric card (matches the "Registered users" reference style) ──────────────
interface MetricCardProps {
  icon: typeof Users
  title: string
  value: number
  delta: number
  deltaLabel: string
  color: string
  bgColor: string
  accent: string
  href?: string
}

function MetricCard({ icon: Icon, title, value, delta, deltaLabel, color, bgColor, accent, href }: MetricCardProps) {
  const inner = (
    <div className={cn(
      'bg-white rounded-2xl border border-gray-100 border-l-4 shadow-sm p-5 h-full',
      'transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]',
      accent,
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn('p-2.5 rounded-xl', bgColor)}>
          <Icon className={cn('w-5 h-5', color)} />
        </div>
        {href && <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />}
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 truncate">{title}</p>
      <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">{value.toLocaleString()}</p>
      <p className="text-xs font-semibold text-green-600 mt-1.5">
        {delta >= 0 ? '+' : ''}{delta.toLocaleString()} {deltaLabel}
      </p>
    </div>
  )

  return href
    ? <Link href={href} className="group block reveal">{inner}</Link>
    : <div className="reveal">{inner}</div>
}
