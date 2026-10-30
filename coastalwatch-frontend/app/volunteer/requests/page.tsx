'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/lib/auth-context'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { fetchSpecies } from '@/lib/mangrove-api'
import type { MangroveSpecies } from '@/lib/types'
import { CalendarDays, FileText, MapPin, Pencil, Plus, TreePine, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'

type EventRequest = {
  id: number; event_name: string; organization_name: string; contact_person: string; contact_email: string
  contact_phone?: string; contact_address?: string; preferred_date: string; preferred_location?: string
  preferred_restoration_site_id?: number; preferred_site?: { name: string }; target_species?: number[]
  seedling_quantities?: Record<string, number>
  expected_participants: number; seedlings_requested: number; description?: string; purpose?: string; status: 'pending' | 'approved' | 'rejected'
  admin_notes?: string; created_at: string; planting_event?: { id: number; name: string; scheduled_at: string; status: string }
}

export default function VolunteerRequestsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [requests, setRequests] = useState<EventRequest[]>([])
  const [speciesList, setSpeciesList] = useState<MangroveSpecies[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EventRequest | null>(null)
  const [confirmCancelReq, setConfirmCancelReq] = useState<EventRequest | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const load = useCallback(async () => {
    try {
      const [res, sp] = await Promise.all([
        api.get('/event-requests/mine'),
        fetchSpecies().catch(() => []),
      ])
      setRequests(Array.isArray(res.data) ? res.data : res.data?.data ?? [])
      setSpeciesList(sp)
    }
    catch { toast.error('Could not load your event requests.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user || !['volunteer', 'user', 'public'].includes(user.role)) { router.replace('/login'); return }
    load()
  }, [authLoading, user, router, load])

  const isCancelled = (request: EventRequest) => (request.admin_notes ?? '').includes('Cancelled by the requesting participant on')
  const canCancel = (request: EventRequest) => ['pending', 'approved'].includes(request.status) && !isCancelled(request) && new Date(`${request.preferred_date.slice(0, 10)}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0) > 2 * 86400000
  const cancel = (request: EventRequest) => {
    if (!canCancel(request)) { toast.error('A request can only be cancelled at least 2 days before its scheduled date.'); return }
    setConfirmCancelReq(request)
  }
  const confirmCancelRequest = async () => {
    if (!confirmCancelReq) return
    const request = confirmCancelReq
    setBusy(request.id)
    try { await api.post(`/event-requests/${request.id}/cancel`); toast.success('Request cancelled.'); setConfirmCancelReq(null); setSelected(null); await load() }
    catch (e: any) { toast.error(e?.response?.data?.message ?? 'Could not cancel this request.') }
    finally { setBusy(null) }
  }

  if (authLoading || loading) return <SidebarLayout title="My Requests"><div className="page-container flex justify-center py-24"><LoadingSpinner /></div></SidebarLayout>

  return <SidebarLayout title="My Requests" subtitle="Track, update, and manage planting event requests">
    <div className="page-container space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-950 to-green-800 p-6 text-white shadow-sm"><div><p className="text-sm text-green-100">Planting activity proposals</p><h1 className="mt-1 text-2xl font-bold">My Event Requests</h1><p className="mt-1 text-sm text-green-100">MENRO will review your request and notify you of its status.</p></div><button onClick={() => router.push('/events/request')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-amber-950 shadow transition hover:-translate-y-0.5 hover:bg-amber-200"><Plus className="h-4 w-4"/>New request</button></div>
      {requests.length === 0 ? <div className="card py-14 text-center"><FileText className="mx-auto h-10 w-10 text-gray-300"/><h2 className="mt-3 font-semibold text-gray-800">No event requests yet</h2><p className="mt-1 text-sm text-gray-500">Submit a request if your organization would like to arrange a planting event.</p><button onClick={() => router.push('/events/request')} className="btn-primary mx-auto mt-4">Request an event</button></div> : <div className="grid gap-4 md:grid-cols-2">{requests.map(request => <article key={request.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${isCancelled(request) || request.status === 'rejected' ? 'bg-red-50 text-red-700' : request.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{isCancelled(request) ? 'Cancelled' : request.status === 'pending' ? 'Pending Review' : request.status}</span><h2 className="mt-3 text-lg font-bold text-gray-900">{request.event_name}</h2><p className="text-sm text-gray-500">{request.organization_name}</p></div><FileText className="h-5 w-5 text-emerald-600"/></div><div className="mt-4 space-y-2 text-sm text-gray-600"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gray-400"/>Preferred: {formatDate(request.preferred_date)}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400"/>{request.preferred_site?.name ?? request.preferred_location ?? 'Site not selected'}</p><p className="flex items-center gap-2"><Users className="h-4 w-4 text-gray-400"/>{request.expected_participants} volunteers</p><p className="flex items-center gap-2"><TreePine className="h-4 w-4 text-gray-400"/>{request.seedlings_requested.toLocaleString()} seedlings requested in total</p>{request.seedling_quantities && <div className="ml-6 border-l border-emerald-100 pl-3 text-xs text-gray-600">{Object.entries(request.seedling_quantities).map(([speciesId, quantity]) => { const sp = speciesList.find(s => s.id === Number(speciesId)); return <p key={speciesId}>{sp?.local_name || sp?.scientific_name || `Species #${speciesId}`}: <strong>{Number(quantity).toLocaleString()}</strong></p> })}</div>}</div>{request.admin_notes && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-800"><strong>MENRO note:</strong> {request.admin_notes}</p>}<div className="mt-4 flex gap-2 border-t border-gray-100 pt-4"><button onClick={() => setSelected(request)} className="min-h-10 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">View details</button>{request.status === 'pending' && <button onClick={() => router.push(`/events/request?edit=${request.id}`)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"><Pencil className="h-4 w-4"/>Edit</button>}{['pending', 'approved'].includes(request.status) && !isCancelled(request) && <button onClick={() => cancel(request)} disabled={!canCancel(request) || busy === request.id} title={!canCancel(request) ? 'Cancellation closes 2 days before the requested date' : 'Cancel request'} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-4 w-4"/>Cancel</button>}</div></article>)}</div>}
    </div>
    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase text-emerald-700">Request details · {selected.status}</p><h2 className="mt-1 text-xl font-bold">{selected.event_name}</h2></div><button aria-label="Close details" onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-gray-100"><X className="h-5 w-5"/></button></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><p><strong>Organization:</strong> {selected.organization_name}</p><p><strong>Contact:</strong> {selected.contact_person}</p><p><strong>Email:</strong> {selected.contact_email}</p><p><strong>Mobile:</strong> {selected.contact_phone ?? '—'}</p><p><strong>Request date:</strong> {formatDate(selected.created_at)}</p><p><strong>Preferred schedule:</strong> {formatDate(selected.preferred_date)}</p><p><strong>Restoration site:</strong> {selected.preferred_site?.name ?? selected.preferred_location ?? '—'}</p><p><strong>Group size:</strong> {selected.expected_participants} volunteers</p><p><strong>Seedlings requested:</strong> {selected.seedlings_requested.toLocaleString()}</p></div>{selected.seedling_quantities && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><h3 className="font-semibold text-emerald-900">Requested seedlings by species</h3>{Object.entries(selected.seedling_quantities).map(([speciesId, quantity]) => { const sp = speciesList.find(s => s.id === Number(speciesId)); return <p key={speciesId} className="mt-1 text-sm text-emerald-800"><strong>{sp?.local_name || sp?.scientific_name || `Species #${speciesId}`}</strong>: {Number(quantity).toLocaleString()} seedlings</p> })}</div>}{selected.description && <div className="mt-4"><h3 className="font-semibold">Event details</h3><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{selected.description}</p></div>}{selected.purpose && <div className="mt-4"><h3 className="font-semibold">Objectives / Notes</h3><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{selected.purpose}</p></div>}{selected.planting_event && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">Approved and scheduled as “{selected.planting_event.name}” on {formatDate(selected.planting_event.scheduled_at)}.</p>}<button onClick={() => setSelected(null)} className="btn-primary mt-6 w-full justify-center">Close</button></section></div>}
    {confirmCancelReq && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setConfirmCancelReq(null) }}>
      <section role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-6 py-4">
          <h2 className="text-sm font-bold text-red-900">Cancel Event Request</h2>
          <button onClick={() => !busy && setConfirmCancelReq(null)} disabled={busy !== null} className="rounded-lg p-1.5 text-gray-500 hover:bg-black/5"><X className="h-4 w-4"/></button>
        </div>
        <div className="p-6">
          <p className="text-sm leading-relaxed text-gray-600">Are you sure you want to cancel the request <strong>“{confirmCancelReq.event_name}”</strong>?</p>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setConfirmCancelReq(null)} disabled={busy !== null} className="btn-secondary flex-1">Keep Request</button>
            <button onClick={confirmCancelRequest} disabled={busy !== null} className="btn-danger flex-1">{busy === confirmCancelReq.id ? 'Cancelling…' : 'Yes, Cancel Request'}</button>
          </div>
        </div>
      </section>
    </div>}
  </SidebarLayout>
}
