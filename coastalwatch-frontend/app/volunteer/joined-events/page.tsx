'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/lib/auth-context'
import { fetchMyRegistrations } from '@/lib/mangrove-api'
import type { PlantingEvent } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { CalendarDays, MapPin, Sprout, Users, X } from 'lucide-react'

type JoinedRecord = {
  id: number
  planting_event_id: number
  registration_status: string
  event?: PlantingEvent & { site?: { name: string }; accomplishment_reports?: Accomplishment[] }
}
type Accomplishment = {
  id: number
  species_name: string
  seedlings_planted: number
  volunteers_present: number
  remarks?: string
  submitted_at?: string
  photos?: Array<{ url?: string; path?: string } | string>
}

export default function JoinedEventsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [records, setRecords] = useState<JoinedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<JoinedRecord | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user || user.role !== 'volunteer') { router.replace('/login'); return }
    fetchMyRegistrations().then(data => setRecords((data as JoinedRecord[]).filter(record => record.registration_status === 'confirmed' && record.event?.status !== 'cancelled'))).catch(() => setRecords([])).finally(() => setLoading(false))
  }, [authLoading, user, router])

  if (authLoading || loading) return <SidebarLayout title="Joined Events"><div className="page-container flex justify-center py-24"><LoadingSpinner /></div></SidebarLayout>

  return <SidebarLayout title="Joined Events" subtitle="Your planting event registrations and accomplishment reports">
    <div className="page-container space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-900 to-green-700 p-6 text-white shadow-sm"><p className="text-sm text-green-100">Your participation</p><h1 className="mt-1 text-2xl font-bold">{records.length} {records.length === 1 ? 'event' : 'events'} joined</h1><p className="mt-2 text-sm text-green-100">Open an event to see its details and any submitted accomplishment report.</p></div>
      {records.length === 0 ? <div className="card py-14 text-center"><CalendarDays className="mx-auto h-10 w-10 text-gray-300"/><h2 className="mt-3 font-semibold text-gray-800">No joined events yet</h2><p className="mt-1 text-sm text-gray-500">Browse Planting Events to find an activity to join.</p><button onClick={() => router.push('/events')} className="btn-primary mx-auto mt-4">Browse Planting Events</button></div> :
        <div className="grid gap-4 md:grid-cols-2">{records.map(record => <article key={record.id} className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{record.registration_status === 'pending_approval' ? 'Awaiting approval' : 'Joined event'}</p><h2 className="mt-1 text-lg font-bold text-gray-900">{record.event?.name ?? `Planting event #${record.planting_event_id}`}</h2></div><CalendarDays className="h-5 w-5 shrink-0 text-emerald-600"/></div>
          <div className="mt-4 space-y-2 text-sm text-gray-600"><p className="flex gap-2"><CalendarDays className="h-4 w-4 text-gray-400"/>{record.event?.scheduled_at ? formatDate(record.event.scheduled_at) : 'Schedule unavailable'}</p>{(record.event?.site?.name || record.event?.location_name) && <p className="flex gap-2"><MapPin className="h-4 w-4 text-gray-400"/>{record.event?.site?.name}{record.event?.location_name ? ` · ${record.event.location_name}` : ''}</p>}</div>
          <button onClick={() => setSelected(record)} className="mt-5 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800">View event & accomplishment</button>
        </article>)}</div>}
    </div>
    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Joined event details</p><h2 className="mt-1 text-xl font-bold text-gray-900">{selected.event?.name ?? `Planting event #${selected.planting_event_id}`}</h2></div><button onClick={() => setSelected(null)} aria-label="Close event details" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5"/></button></div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{selected.event?.description || 'No additional event details.'}</p><div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-2"><p className="flex gap-2"><CalendarDays className="h-4 w-4 text-emerald-700"/>{selected.event?.scheduled_at ? formatDate(selected.event.scheduled_at) : 'Schedule unavailable'}</p><p className="flex gap-2"><MapPin className="h-4 w-4 text-emerald-700"/>{selected.event?.site?.name ?? selected.event?.location_name ?? 'Location unavailable'}</p><p className="flex gap-2"><Users className="h-4 w-4 text-emerald-700"/>Registration: {selected.registration_status.replace('_', ' ')}</p></div>
      <div className="mt-6"><h3 className="flex items-center gap-2 font-bold text-gray-900"><Sprout className="h-4 w-4 text-emerald-700"/>Event accomplishment report</h3>{!selected.event?.accomplishment_reports?.length ? <p className="mt-2 rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">No accomplishment report has been submitted for this event yet.</p> : <div className="mt-3 space-y-4">{selected.event.accomplishment_reports.map(report => <article key={report.id} className="rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500">Submitted {report.submitted_at ? formatDate(report.submitted_at) : ''}</p><p className="mt-2 text-sm"><strong>Species:</strong> {report.species_name}</p><p className="text-sm"><strong>Seedlings planted:</strong> {report.seedlings_planted.toLocaleString()}</p><p className="text-sm"><strong>Volunteers present:</strong> {report.volunteers_present.toLocaleString()}</p>{report.remarks && <p className="mt-2 text-sm text-gray-600"><strong>Remarks:</strong> {report.remarks}</p>}{(report.photos ?? []).length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{report.photos?.map((photo, index) => { const src = typeof photo === 'string' ? photo : photo.url ?? photo.path; return src ? <img key={`${report.id}-${index}`} src={src} alt={`Accomplishment photo ${index + 1}`} className="aspect-square w-full rounded-lg object-cover"/> : null })}</div>}</article>)}</div>}</div>
      <button onClick={() => setSelected(null)} className="btn-primary mt-6 w-full justify-center">Close</button>
    </section></div>}
  </SidebarLayout>
}
