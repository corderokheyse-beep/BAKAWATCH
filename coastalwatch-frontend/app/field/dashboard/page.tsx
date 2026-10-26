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
import { fetchSites, fetchOpenEvents } from '@/lib/mangrove-api'
import api from '@/lib/api'
import type { RestorationSite, PlantingEvent } from '@/lib/types'
import { CATEGORY_ICONS } from '@/lib/utils'
import { TreePine, AlertTriangle, ArrowRight, Plus, FileText, CalendarDays, TrendingUp } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  damage: 'Damage', restoration: 'Restoration', wildlife: 'Wildlife', pollution: 'Pollution', other: 'Other',
}

export default function FieldDashboardPage() {
  const { user, isFieldWorker, loading: authLoading } = useAuth()
  const router = useRouter()
  const [sites, setSites]       = useState<RestorationSite[]>([])
  const [events, setEvents]     = useState<PlantingEvent[]>([])
  const [reports, setReports]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
    else if (!isFieldWorker) router.replace('/login')
  }, [authLoading, user, isFieldWorker]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isFieldWorker) return
    Promise.allSettled([
      fetchSites(),
      fetchOpenEvents(),
      // Reports submitted by this Bantay Bakawan.
      api.get('/my-reports', { params: { per_page: 100 } }),
    ]).then(([s, ev, rp]) => {
      if (s.status  === 'fulfilled') setSites(s.value)
      if (ev.status === 'fulfilled') setEvents(ev.value)
      if (rp.status === 'fulfilled') setReports(rp.value.data?.data ?? [])
    }).finally(() => setLoading(false))
  }, [authLoading, isFieldWorker]) // eslint-disable-line

  if (authLoading || loading) return (
    <SidebarLayout title={`Welcome, ${user?.name?.split(' ')[0] ?? 'Bantay Bakawan'}`} subtitle="Volunteer / Bantay Bakawan — Your submissions and tasks">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  // A Bantay Bakawan's scope is limited to the site(s) they are assigned to.
  const assignedSites = sites.filter(
    s => s.assigned_to === user?.id || s.assigned_worker?.id === user?.id,
  )

  // Upcoming events at their assigned site(s) only.
  const parseWhen = (e: PlantingEvent) =>
    e.scheduled_at ? new Date(e.scheduled_at.replace(' ', 'T')).getTime() : NaN
  const assignedSiteIds = new Set(assignedSites.map(s => s.id))
  const upcomingEvents = events
    .filter(e => assignedSiteIds.has(e.restoration_site_id))
    .filter(e => Number.isNaN(parseWhen(e)) || parseWhen(e) >= Date.now())
    .sort((a, b) => parseWhen(a) - parseWhen(b))

  // Trees planted across their assigned site(s).
  const treesPlanted = assignedSites.reduce((sum, s) => sum + (s.plantation_count ?? 0), 0)

  // Average survival rate across assigned site(s) that have monitoring data.
  const ratedSites = assignedSites.filter(s => s.survival_rate != null)
  const survivalRate = ratedSites.length
    ? Math.round(ratedSites.reduce((sum, s) => sum + (s.survival_rate ?? 0), 0) / ratedSites.length)
    : null

  return (
    <SidebarLayout title={`Welcome, ${user?.name?.split(' ')[0]}`} subtitle="Volunteer / Bantay Bakawan — Your submissions and tasks">
      <div className="page-container space-y-8">

        {/* Header */}
        <div className="animate-slide-up">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        <WeatherForecastCard />

        {/* Stats — scoped to the site(s) this Bantay Bakawan is assigned to */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <StatCard title="My Reports"      value={reports.length} icon={FileText}    color="text-blue-600"   bgColor="bg-blue-50"   accentClass="border-l-4 border-blue-500 reveal" />
          <StatCard title="Upcoming Events" value={upcomingEvents.length} icon={CalendarDays} color="text-green-600" bgColor="bg-green-50"  accentClass="border-l-4 border-green-500 reveal" />
          <StatCard title="Trees Planted"   value={treesPlanted}   icon={TreePine}    color="text-teal-600"   bgColor="bg-teal-50"   accentClass="border-l-4 border-teal-500 reveal" />
          <StatCard title="Survival Rate"   value={survivalRate != null ? `${survivalRate}%` : '—'} icon={TrendingUp} color="text-purple-600" bgColor="bg-purple-50" accentClass="border-l-4 border-purple-500 reveal" />
        </div>

        {/* My Reports — report type and status only */}
        <div className="card reveal transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.09)] hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-5">
            <p className="section-title">My Reports</p>
            <Link href="/reports" className="group inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
              View all {reports.length > 8 ? reports.length : ''} <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          {reports.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7 text-gray-400 animate-float" />
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No reports yet</p>
              <p className="text-xs text-gray-400 mb-5">Report mangrove damage, pollution, or threats you observe</p>
              <Link href="/reports/new" className="btn-primary text-xs px-5 py-2.5 group">
                <Plus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" /> Report a threat
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {reports.slice(0, 8).map(r => (
                <Link key={r.id} href="/reports"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer group">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 text-sm">
                    {CATEGORY_ICONS[r.category] ?? '📍'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-700 transition-colors">
                      {CATEGORY_LABELS[r.category] ?? 'Report'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge label={r.status} type="status" />
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
              {reports.length > 8 && (
                <Link href="/reports"
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-xl transition-colors group">
                  View all {reports.length} reports
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
