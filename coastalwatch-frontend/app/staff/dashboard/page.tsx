'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import WeatherForecastCard from '@/components/dashboard/WeatherForecastCard'
import { useAuth } from '@/lib/auth-context'
import { fetchSites, fetchAllEvents, fetchSpecies, fetchEventRequests } from '@/lib/mangrove-api'
import api from '@/lib/api'
import type { RestorationSite, PlantingEvent } from '@/lib/types'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Leaf, ChevronRight,
  MapPin, CalendarDays, ClipboardList,
  CheckCircle, XCircle, Clock, Plus, AlertTriangle,
  Users, Sprout, Inbox, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Severity pill styles for the report list.
const SEVERITY_PILL: Record<string, string> = {
  low:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  medium:   'bg-orange-50 text-orange-700 border-orange-200',
  high:     'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-800 border-red-300',
}

// Status pills — per the staff (Bantay Bakawan) dashboard revision, only three
// statuses are displayed here: Pending, Reviewing, and Resolved. The Rejected
// terminal state is intentionally excluded from this dashboard interface.
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  pending:           { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  submitted:         { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  investigating:     { label: 'Reviewing', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  under_review:      { label: 'Reviewing', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  under_observation: { label: 'Reviewing', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  action_taken:      { label: 'Reviewing', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  recovering:        { label: 'Reviewing', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolved:          { label: 'Resolved',  cls: 'bg-green-50 text-green-700 border-green-200' },
  approved:          { label: 'Resolved',  cls: 'bg-green-50 text-green-700 border-green-200' },
}

export default function StaffDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [sites, setSites]                   = useState<RestorationSite[]>([])
  const [events, setEvents]                 = useState<PlantingEvent[]>([])
  const [eventRequests, setEventRequests]   = useState<any[]>([])
  const [speciesCount, setSpeciesCount]     = useState(0)
  const [reports, setReports]               = useState<any[]>([])
  const [eventTab, setEventTab]             = useState<'completed' | 'upcoming' | 'requests'>('completed')
  const [loading, setLoading]               = useState(true)
  const [reviewing, setReviewing]           = useState<number | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (user !== null && user.role !== 'staff') router.replace('/login')
  }, [authLoading, user]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !user || user.role !== 'staff') return
    Promise.allSettled([
      fetchSites(),
      fetchAllEvents(),
      fetchEventRequests(),
      fetchSpecies(),
      // All threat/growth reports so staff sees the full picture.
      api.get('/reports', { params: { per_page: 100 } }),
    ]).then(([s, ev, er, sp, rp]) => {
      if (s.status  === 'fulfilled') setSites(s.value)
      if (ev.status === 'fulfilled') setEvents(ev.value)
      if (er.status === 'fulfilled') setEventRequests(er.value)
      if (sp.status === 'fulfilled') setSpeciesCount(sp.value.length)
      if (rp.status === 'fulfilled') setReports(rp.value.data?.data ?? [])
    }).finally(() => setLoading(false))
  }, [authLoading, user]) // eslint-disable-line

  async function reviewReport(id: number, status: 'under_review' | 'resolved') {
    setReviewing(id)
    try {
      await api.patch(`/reports/${id}/review`, { status })
      toast.success(`Report marked as ${status.replace('_', ' ')}.`)
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch {
      toast.error('Failed to update report')
    } finally { setReviewing(null) }
  }

  // ── Status buckets ──────────────────────────────────────────────────────────
  // Per the staff dashboard revision, the report list shows Pending, Reviewing,
  // and Resolved reports. Rejected reports are excluded from this interface.
  const statusBucket = (status: unknown): 'pending' | 'reviewing' | 'resolved' => {
    const s = String(status ?? '').toLowerCase().trim()
    if (s === 'resolved') return 'resolved'
    if (s === 'under_review') return 'reviewing'
    if (s === 'pending' || s === '') return 'pending'
    return 'reviewing'
  }

  const visibleReports = reports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  function handleReportRowClick(report: any) {
    const lat = report.latitude ?? report.lat
    const lng = report.longitude ?? report.lng
    if (lat && lng) {
      router.push(`/map?reportId=${report.id}&lat=${lat}&lng=${lng}`)
    } else {
      router.push('/map')
      toast('No GPS location for this report — opening map', { icon: '📍' })
    }
  }

  if (authLoading || loading) return (
    <SidebarLayout title="Staff Dashboard" subtitle="Field Operations Support">
      <div className="page-container flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    </SidebarLayout>
  )

  // ── Stat-card values (6 cards) ───────────────────────────────────────────────
  const activeSites     = sites.filter(s => s.status === 'active').length
  const inProgressSites = sites.filter(s => s.status === 'in_progress').length
  const totalReports    = reports.length
  const totalEvents     = events.length

  // ── Planting-event grouping for the full-width Events section ────────────────
  // Completed = status 'completed'; Upcoming = scheduled events still ahead of
  // now (or without a date). Cancelled events are not surfaced here.
  const now = Date.now()
  const parseWhen = (e: PlantingEvent) =>
    e.scheduled_at ? new Date(e.scheduled_at.replace(' ', 'T')).getTime() : NaN
  const completedEvents = events
    .filter(e => e.status === 'completed')
    .sort((a, b) => parseWhen(b) - parseWhen(a))
  const upcomingEvents = events
    .filter(e => (e.status === 'upcoming' || e.status === 'on-going') && (Number.isNaN(parseWhen(e)) || parseWhen(e) >= now))
    .sort((a, b) => parseWhen(a) - parseWhen(b))
  const pendingRequests = eventRequests.filter(
    r => String(r.status ?? '').toLowerCase() === 'pending'
  )

  return (
    <SidebarLayout
      title={`Welcome, ${user?.name?.split(' ')[0]}`}
      subtitle="Staff — Field Operations Support"
    >
      <div className="page-container space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="animate-slide-up flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
            <h1 className="text-2xl font-bold text-gray-900">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-primary-600">
                {user?.name?.split(' ')[0]}
              </span>
            </h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/plantation/new" className="btn-primary text-sm group">
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              New Plantation
            </Link>
            <Link href="/events" className="btn-secondary text-sm group">
              <CalendarDays className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              Events
            </Link>
          </div>
        </div>

        <WeatherForecastCard />

        {/* ── Role banner ─────────────────────────────────────────────────── */}
        <div className="reveal relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-primary-50 to-teal-50 p-5">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-blue-200/30 rounded-full blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-primary-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25 animate-float">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-blue-900">Staff Access — Field Operations</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Review field reports · Submit plantation records · Manage planting events · Monitor sites
              </p>
            </div>
            {visibleReports.filter(r => statusBucket(r.status) === 'pending').length > 0 && (
              <div className="shrink-0 text-center">
                <p className="text-2xl font-extrabold text-amber-600 tabular-nums">
                  {visibleReports.filter(r => statusBucket(r.status) === 'pending').length}
                </p>
                <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Pending</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Stat cards (6) ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {[
            { title: 'Total Sites',       value: sites.length,     icon: MapPin,       color: 'text-blue-600',   bgColor: 'bg-blue-50',   accentClass: 'border-l-4 border-blue-500 reveal' },
            { title: 'Active Sites',      value: activeSites,      icon: Leaf,         color: 'text-green-600',  bgColor: 'bg-green-50',  accentClass: 'border-l-4 border-green-500 reveal' },
            { title: 'In Progress Sites', value: inProgressSites,  icon: Clock,        color: 'text-amber-600',  bgColor: 'bg-amber-50',  accentClass: 'border-l-4 border-amber-500 reveal' },
            { title: 'Total Species',     value: speciesCount,     icon: Sprout,       color: 'text-teal-600',   bgColor: 'bg-teal-50',   accentClass: 'border-l-4 border-teal-500 reveal' },
            { title: 'Total Reports',     value: totalReports,     icon: AlertTriangle,color: 'text-rose-600',   bgColor: 'bg-rose-50',   accentClass: 'border-l-4 border-rose-500 reveal' },
            { title: 'Total Events',      value: totalEvents,      icon: CalendarDays, color: 'text-purple-600', bgColor: 'bg-purple-50', accentClass: 'border-l-4 border-purple-500 reveal' },
          ].map(card => (
            <StatCard key={card.title} {...card} />
          ))}
        </div>

        {/* ── Reports (Threat & Growth Monitoring) — full width ───────────── */}
        <div className="reveal bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden
                        transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.09)]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/60 to-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Reports</p>
                <p className="text-xs text-gray-400">Threat &amp; Growth Monitoring — Pending, Reviewing, Resolved</p>
              </div>
            </div>
            <Link href="/reports/mangrove"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors group">
              All reports
              <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Body */}
          <div className="p-4">
            {visibleReports.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3 animate-float">
                  <CheckCircle className="w-7 h-7 text-green-500" />
                </div>
                <p className="text-sm font-semibold text-gray-700">All caught up</p>
                <p className="text-xs text-gray-400 mt-1">No reports to show right now.</p>
              </div>
            ) : (
              <div className="space-y-2 stagger max-h-[36rem] overflow-y-auto pr-1">
                {visibleReports.map((report: any) => {
                  const bucket = statusBucket(report.status)
                  const isPending = bucket === 'pending' || bucket === 'reviewing'
                  const sev = report.severity ?? 'medium'
                  const statusPill = STATUS_PILL[report.status] ?? STATUS_PILL.pending
                  return (
                  <div key={report.id}
                    onClick={() => handleReportRowClick(report)}
                    className={cn(
                      'group flex items-start gap-3 p-3.5 rounded-xl border border-transparent',
                      'transition-all duration-200 ease-out cursor-pointer',
                      'hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-sm hover:-translate-y-0.5',
                      reviewing === report.id && 'opacity-50 pointer-events-none',
                    )}>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5
                                    group-hover:bg-amber-100 transition-colors duration-200">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-amber-900 transition-colors">
                        {report.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border', statusPill.cls)}>
                          {statusPill.label}
                        </span>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border', SEVERITY_PILL[sev] ?? SEVERITY_PILL.medium)}>
                          {sev}
                        </span>
                        <Badge label={report.category} type="category" />
                        <span className="text-xs text-gray-400">{timeAgo(report.created_at)}</span>
                        {report.location_name && (
                          <span className="text-xs text-gray-400 truncate hidden sm:block">
                            · {report.location_name}
                          </span>
                        )}
                        {(report.latitude || report.lat) && (
                          <span className="text-xs text-primary-500 flex items-center gap-0.5 font-medium">
                            <MapPin className="w-3 h-3" /> View on map
                          </span>
                        )}
                      </div>
                    </div>
                    {isPending && (
                      <>
                        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                             onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => reviewReport(report.id, 'resolved')}
                            disabled={reviewing === report.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700
                                       hover:bg-green-100 hover:shadow-sm text-xs font-semibold
                                       transition-all duration-150 disabled:opacity-50 active:scale-95"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Resolved
                          </button>
                          <button
                            onClick={() => reviewReport(report.id, 'under_review')}
                            disabled={reviewing === report.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700
                                       hover:bg-red-100 hover:shadow-sm text-xs font-semibold
                                       transition-all duration-150 disabled:opacity-50 active:scale-95"
                          >
                            <Search className="w-3.5 h-3.5" /> Under Review
                          </button>
                        </div>
                        {/* Always-visible buttons on mobile */}
                        <div className="flex gap-1.5 shrink-0 sm:hidden"
                             onClick={e => e.stopPropagation()}>
                          <button onClick={() => reviewReport(report.id, 'resolved')} disabled={reviewing === report.id}
                            title="Resolved"
                            className="p-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => reviewReport(report.id, 'under_review')} disabled={reviewing === report.id}
                            className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50">
                            <Search className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Planting Events (Completed / Upcoming / Requests) — full width ─ */}
        <div className="reveal bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden
                        transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.09)]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50/60 to-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Planting Events</p>
                <p className="text-xs text-gray-400">Completed, upcoming, and community requests</p>
              </div>
            </div>
            <Link href="/events"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors group">
              Manage
              <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-gray-100 flex-wrap">
            {([
              { key: 'completed', label: 'Completed', count: completedEvents.length },
              { key: 'upcoming',  label: 'Upcoming',  count: upcomingEvents.length },
              { key: 'requests',  label: 'Requests',  count: pendingRequests.length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setEventTab(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                  eventTab === tab.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {tab.label}
                <span className={cn('text-[10px] font-bold px-1.5 rounded-full',
                  eventTab === tab.key ? 'bg-white/25' : 'bg-gray-100 text-gray-500')}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-4">
            {eventTab === 'requests' ? (
              pendingRequests.length === 0 ? (
                <EmptyEvents icon={<Inbox className="w-7 h-7 text-gray-400" />} title="No pending requests" body="Community-submitted event requests will show up here." />
              ) : (
                <div className="space-y-2 stagger">
                  {pendingRequests.map((req: any) => (
                    <Link key={req.id} href="/events"
                      className="group flex items-start gap-3 p-3.5 rounded-xl border border-transparent
                                 transition-all duration-200 hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-sm">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Inbox className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-amber-900 transition-colors">
                          {req.title ?? req.name ?? req.requested_name ?? 'Event request'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                            Pending
                          </span>
                          {(req.location_name || req.barangay) && (
                            <span className="text-xs text-gray-400 flex items-center gap-0.5">
                              <MapPin className="w-3 h-3" /> {req.location_name ?? req.barangay}
                            </span>
                          )}
                          {req.created_at && (
                            <span className="text-xs text-gray-400">{timeAgo(req.created_at)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 self-center group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  ))}
                </div>
              )
            ) : (
              (() => {
                const list = eventTab === 'completed' ? completedEvents : upcomingEvents
                if (list.length === 0) {
                  return eventTab === 'completed'
                    ? <EmptyEvents icon={<CheckCircle className="w-7 h-7 text-gray-400" />} title="No completed events" body="Finished planting events will appear here." />
                    : <EmptyEvents icon={<CalendarDays className="w-7 h-7 text-gray-400" />} title="No upcoming events" body="Scheduled planting events will appear here." />
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 stagger">
                    {list.map(event => (
                      <Link key={event.id} href="/events"
                        className="group flex items-center gap-3 p-3 rounded-xl border border-gray-100
                                   transition-all duration-200 hover:bg-green-50/50 hover:shadow-sm hover:-translate-y-0.5">
                        <div className={cn(
                          'w-11 h-12 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm',
                          'transition-transform duration-200 group-hover:scale-105',
                          eventTab === 'completed'
                            ? 'bg-gradient-to-b from-gray-400 to-gray-600'
                            : 'bg-gradient-to-b from-primary-500 to-primary-700',
                        )}>
                          {Number.isNaN(parseWhen(event)) ? (
                            <CalendarDays className="w-4 h-4" />
                          ) : (
                            <>
                              <span className="text-[9px] font-bold uppercase opacity-80 leading-none">
                                {format(new Date(event.scheduled_at.replace(' ', 'T')), 'MMM')}
                              </span>
                              <span className="text-lg font-extrabold leading-tight">
                                {format(new Date(event.scheduled_at.replace(' ', 'T')), 'd')}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-primary-700 transition-colors">
                            {event.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {event.status !== 'completed' && (
                              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                <Users className="w-2.5 h-2.5" />
                                {event.remaining_capacity ?? 0} spots
                              </span>
                            )}
                            <Badge label={event.status} type="status" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              })()
            )}
          </div>
        </div>

      </div>
    </SidebarLayout>
  )
}

// Small shared empty-state for the Events section.
function EmptyEvents({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="text-center py-10">
      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-2">
        {icon}
      </div>
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{body}</p>
      <Link href="/events" className="text-xs text-primary-600 font-semibold mt-2 inline-block hover:underline">
        Go to Events →
      </Link>
    </div>
  )
}
