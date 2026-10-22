'use client'

export const dynamic = 'force-dynamic'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { fetchOpenEvents, fetchAllEvents, fetchSites, fetchPastEvents, fetchMyRegistrations, fetchMyAttendance, confirmEventAttendance, undoEventAttendance, fetchSpecies } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import api from '@/lib/api'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { getZonation } from '@/lib/mangrove-zonation'
import type { PlantingEvent, RestorationSite, MangroveSpecies } from '@/lib/types'
import { Calendar, MapPin, Users, CheckCircle2, TreePine, Loader2, Clock, Plus, X, Pencil, Trash2, Building2, Eye, CheckCircle, XCircle, RefreshCw, Search, UserCheck, Send, User, Mail, Phone, Leaf } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

function CalendarChip({ dateStr }: { dateStr: string }) {
  try {
    const d = parseISO(dateStr.replace(' ', 'T'))
    return (
      <div className="flex flex-col items-center justify-center w-12 h-14 bg-gradient-to-b from-primary-500 to-primary-700 rounded-xl shadow-sm text-white shrink-0 transition-transform duration-200 group-hover:scale-105">
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80 leading-none">{format(d, 'MMM')}</span>
        <span className="text-xl font-extrabold leading-tight">{format(d, 'd')}</span>
        <span className="text-[9px] opacity-70 leading-none">{format(d, 'EEE')}</span>
      </div>
    )
  } catch { return null }
}

function CapacityBar({ remaining, max }: { remaining: number; max: number }) {
  const used = max - remaining
  const pct  = max > 0 ? Math.round((used / max) * 100) : 0
  const isFull = remaining <= 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Users className="w-3 h-3" />
          {isFull ? 'Full' : `${remaining} spots left`}
        </span>
        <span className="text-xs font-semibold text-gray-600">{used}/{max}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-1.5 rounded-full transition-all duration-500',
            isFull ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-primary-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

type EventForm = {
  name: string
  description: string          // composed on submit (species + zonation + notes)
  restoration_site_id: string
  scheduled_at: string
  location_name: string
  max_volunteers: string
  status: string
  target_species: string[]     // selected scientific names
  notes: string                // Additional Notes (editable)
}

const emptyForm = (): EventForm => ({
  name: '', description: '', restoration_site_id: '',
  scheduled_at: '', location_name: '', max_volunteers: '30', status: 'upcoming',
  target_species: [], notes: '',
})

const EVENT_STATUSES = ['upcoming', 'on-going', 'completed', 'cancelled'] as const

// Quick capacity presets for the Max Volunteers field.
const CAPACITY_PRESETS = [20, 30, 50, 100] as const

// Quick-add reminder chips for Additional Notes.
const QUICK_NOTES = [
  'Wear Aqua Shoes',
  'Wear Long Sleeves/Jacket',
  'Bring Hat',
  'Bring Work Gloves',
  'Bring Bamboo Stakes',
] as const

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsPageInner />
    </Suspense>
  )
}

function EventsPageInner() {
  const { user, loading: authLoading } = useAuth()
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [events, setEvents]           = useState<PlantingEvent[]>([])
  const [pastEvents, setPastEvents]   = useState<PlantingEvent[]>([])
  const [sites, setSites]             = useState<RestorationSite[]>([])
  const [loading, setLoading]         = useState(true)
  const [eventsLoadError, setEventsLoadError] = useState('')
  const [registering, setRegistering] = useState<number | null>(null)
  const [registered, setRegistered]   = useState<Set<number>>(new Set())
  const [pendingReg, setPendingReg]   = useState<Set<number>>(new Set())
  const [attendance, setAttendance] = useState<Set<number>>(new Set())
  const [attendanceBusy, setAttendanceBusy] = useState<number | null>(null)
  const [detailEvent, setDetailEvent] = useState<PlantingEvent | null>(null)

  // Create/Edit modal
  const [modal, setModal]             = useState(false)
  const [editingEvent, setEditingEvent] = useState<PlantingEvent | null>(null)
  const [form, setForm]               = useState<EventForm>(emptyForm())
  const [submitting, setSubmitting]   = useState(false)
  // Create-event modal extras
  const [speciesOptions, setSpeciesOptions] = useState<MangroveSpecies[]>([])
  const [siteSearch, setSiteSearch]   = useState('')
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)

  const canManage = user && (user.role === 'menro' || user.role === 'staff')
  const canConfirm = user?.role === 'field_worker'
  const canRegister = user?.role === 'volunteer'

  // â”€â”€ Plantation event requests (menro/staff only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  type RequestStatus = 'pending' | 'approved' | 'rejected'
  interface EventRequest {
    id: number; organization_name: string; contact_person: string
    contact_email: string; contact_phone?: string; event_name: string
    description?: string; preferred_date: string; preferred_location?: string
    expected_participants: number; purpose?: string
    status: RequestStatus; admin_notes?: string
    reviewed_by?: number; reviewed_at?: string
    reviewer?: { id: number; name: string }
    created_at: string
  }

  // Read tab + request_id from URL (set by notification click)
  const urlTab       = searchParams.get('tab')
  const urlRequestId = searchParams.get('request_id')

  const [activeTab, setActiveTab]         = useState<'events' | 'requests'>(
    urlTab === 'requests' ? 'requests' : 'events'
  )
  const [requests, setRequests]           = useState<{ data: EventRequest[]; total: number; last_page: number; current_page: number } | null>(null)
  const [reqLoading, setReqLoading]       = useState(false)
  const [reqPage, setReqPage]             = useState(1)
  const [reqStatusFilter, setReqStatusFilter] = useState('')
  const [reqSearch, setReqSearch]         = useState('')
  const [reviewModal, setReviewModal]     = useState<{ req: EventRequest; action: RequestStatus } | null>(null)
  const [reviewNote, setReviewNote]       = useState('')
  const [reviewing, setReviewing]         = useState<number | null>(null)
  // Pre-expand the request from the URL if provided
  const [expandedReqId, setExpandedReqId] = useState<number | null>(
    urlRequestId ? Number(urlRequestId) : null
  )
  const [pendingCount, setPendingCount]   = useState(0)

  // â”€â”€ Personal info registration modal (for request-sourced events) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  interface PersonalInfoForm {
    full_name: string; email: string; phone: string; address: string
    organization: string; age: string; gender: string; motivation: string
    is_representative: boolean; group_size: string
  }
  const emptyPersonalForm = (): PersonalInfoForm => ({
    full_name: user?.name ?? '', email: user?.email ?? '',
    phone: user?.phone ?? '', address: '', organization: user?.organization ?? '', age: '', gender: '',
    motivation: '', is_representative: false, group_size: '1',
  })
  const [personalModal, setPersonalModal]   = useState<PlantingEvent | null>(null)
  const [personalForm, setPersonalForm]     = useState<PersonalInfoForm>(emptyPersonalForm())
  const [personalSubmitting, setPersonalSubmitting] = useState(false)
  const [personalSuccess, setPersonalSuccess]       = useState(false)
  const [personalRegistrationStatus, setPersonalRegistrationStatus] = useState<'confirmed' | 'pending_approval'>('confirmed')
  // Cancel registration state
  const [cancelling, setCancelling] = useState<number | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
  }, [authLoading, user]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !user) return
    // MENRO/staff/admin fetch ALL events (every status) so they can see and manage
    // everything they've created. Volunteers/public only see open future events.
    const eventsFetch = canManage ? fetchAllEvents() : fetchOpenEvents()
    eventsFetch
      .then((evts) => {
        if (canManage) {
          // For managers, separate into active (not completed/cancelled) and past
          const active = (evts as PlantingEvent[]).filter(e =>
            !['completed', 'cancelled'].includes(e.status)
          )
          const historical = (evts as PlantingEvent[]).filter(e =>
            ['completed', 'cancelled'].includes(e.status)
          )
          setEvents(active)
          setPastEvents(historical)
        } else {
          setEvents(evts)
        }
      })
      .catch((err: any) => {
        setEventsLoadError(err?.response?.data?.message ?? 'Could not load events. Check your API connection and try again.')
      })
      .finally(() => setLoading(false))

    // History is optional: a history endpoint/database error must not hide the
    // active event list, which is the primary content on this page.
    fetchPastEvents()
      .then((past) => setPastEvents(current => {
        const byId = new Map([...current, ...past].map(event => [event.id, event]))
        return [...byId.values()].sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))
      }))
      .catch(() => {})

    if (canManage) {
      fetchSites().then(setSites).catch(() => {})
      // Species list for the Target Mangrove Species multi-select.
      fetchSpecies().then(setSpeciesOptions).catch(() => {})
    }

    // Load the user's existing registrations to pre-populate button states
    if (canRegister) {
      fetchMyRegistrations()
        .then(regs => {
          const confirmedIds = new Set(regs.filter(r => r.registration_status === 'confirmed').map(r => r.planting_event_id))
          const pendingIds   = new Set(regs.filter(r => r.registration_status === 'pending_approval').map(r => r.planting_event_id))
          setRegistered(confirmedIds)
          setPendingReg(pendingIds)
        })
        .catch(() => {})
    }
    if (user?.role === 'field_worker') {
      fetchMyAttendance().then(rows => setAttendance(new Set(rows.map(r => r.planting_event_id)))).catch(() => {})
    }
  }, [authLoading, user]) // eslint-disable-line

  async function toggleAttendance(eventId: number) {
    const confirmed = attendance.has(eventId)
    if (!confirm(confirmed ? 'Undo your attendance confirmation?' : 'Confirm that you will attend this planting event?')) return
    setAttendanceBusy(eventId)
    try {
      if (confirmed) {
        await undoEventAttendance(eventId)
        setAttendance(prev => { const next = new Set(prev); next.delete(eventId); return next })
        toast.success('Attendance confirmation removed.')
      } else {
        await confirmEventAttendance(eventId)
        setAttendance(prev => new Set(prev).add(eventId))
        toast.success('Attendance confirmed. MENRO has been notified.')
      }
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Could not update attendance.') }
    finally { setAttendanceBusy(null) }
  }

  // â”€â”€ Load pending count badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!canManage) return
    api.get('/event-requests/pending-count').then(r => setPendingCount(r.data.count)).catch(() => {})
  }, [canManage]) // eslint-disable-line

  // â”€â”€ Load requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadRequests = useCallback(async () => {
    setReqLoading(true)
    try {
      const { data } = await api.get('/event-requests', {
        params: { page: reqPage, status: reqStatusFilter || undefined, search: reqSearch || undefined, per_page: 15 },
      })
      setRequests(data)
    } catch { toast.error('Failed to load requests.') }
    finally { setReqLoading(false) }
  }, [reqPage, reqStatusFilter, reqSearch])

  useEffect(() => {
    if (activeTab === 'requests' && canManage) loadRequests()
  }, [activeTab, loadRequests, canManage]) // eslint-disable-line

  // After requests load, scroll the highlighted request into view
  useEffect(() => {
    if (!urlRequestId || !requests?.data?.length) return
    const id = Number(urlRequestId)
    const exists = requests.data.some(r => r.id === id)
    if (!exists) return
    // Small delay to let the DOM render the expanded row
    setTimeout(() => {
      const el = document.getElementById(`request-row-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }, [urlRequestId, requests]) // eslint-disable-line

  // â”€â”€ Review a request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const submitReview = async () => {
    if (!reviewModal) return
    setReviewing(reviewModal.req.id)
    try {
      await api.patch(`/event-requests/${reviewModal.req.id}/review`, {
        status: reviewModal.action,
        admin_notes: reviewNote || undefined,
      })
      toast.success(`Request ${reviewModal.action}.`)
      setReviewModal(null); setReviewNote('')
      loadRequests()
      api.get('/event-requests/pending-count').then(r => setPendingCount(r.data.count)).catch(() => {})
    } catch { toast.error('Review failed.') }
    finally { setReviewing(null) }
  }

  // â”€â”€ Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleRegister = async (event: PlantingEvent) => {
    setPersonalForm(emptyPersonalForm())
    setPersonalSuccess(false)
    setPersonalModal(event)
  }

  // â”€â”€ Submit personal info registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const submitPersonalRegistration = async () => {
    if (!personalModal) return
    if (!personalForm.full_name.trim() || !personalForm.email.trim() ||
        !personalForm.phone.trim() || !personalForm.address.trim() || !personalForm.age.trim()) {
      toast.error('Please fill in all required fields.')
      return
    }
    if (!confirm(`Confirm that you want to join “${personalModal.name}”?`)) return
    setPersonalSubmitting(true)
    try {
      const endpoint = user
        ? `/events/${personalModal.id}/register`
        : `/events/${personalModal.id}/register-public`
      const response = await api.post(endpoint, {
        full_name:    personalForm.full_name,
        email:        personalForm.email,
        phone:        personalForm.phone,
        address:      personalForm.address,
        organization: personalForm.organization || undefined,
        age:          personalForm.age ? Number(personalForm.age) : undefined,
        gender:       personalForm.gender || undefined,
        group_size:   personalForm.is_representative ? Number(personalForm.group_size) : 1,
        motivation:   personalForm.motivation || undefined,
      })
      const status = response.data?.status === 'pending_approval' ? 'pending_approval' : 'confirmed'
      setPersonalRegistrationStatus(status)
      setPersonalSuccess(true)
      if (status === 'pending_approval') setPendingReg(prev => new Set(prev).add(personalModal.id))
      else setRegistered(prev => new Set(prev).add(personalModal.id))
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Registration failed.')
    } finally { setPersonalSubmitting(false) }
  }

  // â”€â”€ Cancel registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleCancelRegistration = async (eventId: number) => {
    const event = [...events, ...pastEvents].find(item => item.id === eventId)
    const scheduled = event ? new Date(event.scheduled_at.replace(' ', 'T')) : null
    if (!scheduled || scheduled.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
      toast.error('Registration can only be cancelled at least one day before the event.')
      return
    }
    if (!confirm('Cancel your registration for this event?')) return
    setCancelling(eventId)
    try {
      await api.delete(`/events/${eventId}/unregister`)
      setRegistered(prev => { const s = new Set(prev); s.delete(eventId); return s })
      setPendingReg(prev => { const s = new Set(prev); s.delete(eventId); return s })
      toast.success('Registration cancelled.')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not cancel registration.')
    } finally { setCancelling(null) }
  }

  const cancellationAllowed = (event: PlantingEvent) =>
    event.status !== 'on-going' && new Date(event.scheduled_at.replace(' ', 'T')).getTime() - Date.now() > 24 * 60 * 60 * 1000

  // â”€â”€ Re-join (open modal again) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleRejoin = (event: PlantingEvent) => {
    setPersonalForm(emptyPersonalForm())
    setPersonalSuccess(false)
    setPersonalModal(event)
  }

  // â”€â”€ Create / Edit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function openCreate() {
    setEditingEvent(null)
    setForm(emptyForm())
    setSiteSearch('')
    setSiteDropdownOpen(false)
    setConfirmCreate(false)
    setModal(true)
  }

  function openEdit(event: PlantingEvent) {
    setEditingEvent(event)
    setForm({
      name: event.name,
      description: event.description ?? '',
      restoration_site_id: event.restoration_site_id?.toString() ?? '',
      scheduled_at: event.scheduled_at.replace(' ', 'T').slice(0, 16),
      location_name: event.location_name ?? '',
      max_volunteers: event.max_volunteers.toString(),
      status: event.status,
      target_species: [],
      notes: event.description ?? '',
    })
    setSiteSearch(sites.find(s => s.id === event.restoration_site_id)?.name ?? '')
    setConfirmCreate(false)
    setModal(true)
  }

  // Toggle a species in the multi-select; its zonation shows/hides automatically.
  function toggleTargetSpecies(scientificName: string) {
    setForm(f => ({
      ...f,
      target_species: f.target_species.includes(scientificName)
        ? f.target_species.filter(s => s !== scientificName)
        : [...f.target_species, scientificName],
    }))
  }

  // Append a quick-add reminder to the Additional Notes (comma-joined, no dupes).
  function toggleQuickNote(note: string) {
    setForm(f => {
      const parts = f.notes.split(',').map(s => s.trim()).filter(Boolean)
      const has = parts.includes(note)
      const next = has ? parts.filter(p => p !== note) : [...parts, note]
      return { ...f, notes: next.join(', ') }
    })
  }

  // Compose the stored description from species + zonation + notes (the backend
  // keeps a single description column; the modal splits it into clean fields).
  function composeDescription(f: EventForm): string {
    const lines: string[] = []
    if (f.target_species.length) {
      lines.push('Target species: ' + f.target_species.join(', '))
      const zonations = Array.from(new Set(
        f.target_species.map(s => getZonation(s)?.zone).filter(Boolean) as string[]
      ))
      if (zonations.length) lines.push('Zonation: ' + zonations.join(', '))
    }
    if (f.notes.trim()) lines.push(f.notes.trim())
    return lines.join('\n')
  }

  // Validate the shared required fields (used before confirm & before save).
  function validateEventForm(): boolean {
    if (!form.name.trim()) { toast.error('Event title is required'); return false }
    if (!form.restoration_site_id) { toast.error('Please select a restoration site'); return false }
    if (!editingEvent && form.target_species.length === 0) {
      toast.error('Select at least one target mangrove species'); return false
    }
    if (!form.scheduled_at) { toast.error('Please set a date and time'); return false }
    if (!form.max_volunteers || Number(form.max_volunteers) < 1) { toast.error('Max volunteers must be at least 1'); return false }
    return true
  }

  // Step 1: clicking "Create Event" validates then opens the confirmation.
  function submitForm() {
    if (!validateEventForm()) return
    if (editingEvent) { void saveEvent() } // edits save directly (no confirm step)
    else setConfirmCreate(true)
  }

  // Step 2: actually persist the event (after confirmation for new events).
  async function saveEvent() {
    setSubmitting(true)
    const payload = {
      name: form.name,
      description: composeDescription(form) || undefined,
      restoration_site_id: Number(form.restoration_site_id),
      scheduled_at: form.scheduled_at,
      location_name: form.location_name || undefined,
      max_volunteers: Number(form.max_volunteers),
      status: form.status,
    }

    try {
      if (editingEvent) {
        const { data } = await api.put(`/events/${editingEvent.id}`, payload)
        setEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...data } : e))
        toast.success('Event updated')
      } else {
        await api.post('/events', payload)
        // Re-fetch to get remaining_capacity computed
        const fresh = canManage ? await fetchAllEvents() : await fetchOpenEvents()
        setEvents(
          canManage
            ? (fresh as PlantingEvent[]).filter(e => !['completed', 'cancelled'].includes(e.status))
            : fresh
        )
        toast.success('Event created')
      }
      setConfirmCreate(false)
      setModal(false)
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? Object.values(e?.response?.data?.errors ?? {}).flat().join(' ') ?? 'Failed to save event'
      toast.error(msg)
    } finally { setSubmitting(false) }
  }

  async function deleteEvent(id: number) {
    if (!confirm('Delete this event?')) return
    try {
      await api.put(`/events/${id}`, { status: 'cancelled' })
      setEvents(prev => prev.filter(e => e.id !== id))
      toast.success('Event cancelled')
    } catch { toast.error('Failed to cancel event') }
  }

  if (loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>

  return (
    <SidebarLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-7 animate-slide-up">
          <div>
            <h1 className="page-title">Planting Events</h1>
            <p className="page-subtitle">
              {events.length > 0
                ? `${events.length} upcoming event${events.length !== 1 ? 's' : ''}`
                : 'Upcoming mangrove planting activities in Gloria'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Public / community users can request an event */}
            {user && !canManage && user.role !== 'field_worker' && (
              <Link
                href="/events/request"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-100 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <Building2 className="w-4 h-4" />
                Request Event
              </Link>
            )}
            {canManage && (
              <button onClick={openCreate} className="btn-primary group">
                <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                New Event
              </button>
            )}
          </div>
        </div>

        {/* Tab bar — only for menro/staff */}
        {canManage && (
          <div className="flex gap-1 bg-gray-100/80 p-1 rounded-2xl mb-6 w-fit border border-gray-200/60">
            <button onClick={() => setActiveTab('events')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
                activeTab === 'events' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50')}>
              <Calendar className="w-4 h-4" /> Events
            </button>
            <button onClick={() => setActiveTab('requests')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
                activeTab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50')}>
              <Building2 className="w-4 h-4" />
              Event Requests
              {pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* â”€â”€ Events tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'events' ? (
          <div className="space-y-8">
            {/* â”€â”€ Upcoming Events â”€â”€ */}
            {events.length === 0 ? (
              <div className="text-center py-12 reveal">
                <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-gray-400 animate-float" />
                </div>
                <p className="text-base font-semibold text-gray-600 mb-1">{eventsLoadError ? 'Events could not be loaded' : 'No open events'}</p>
                <p className="text-sm text-gray-400 mb-4">{eventsLoadError || 'Check back soon for upcoming planting activities'}</p>
                {canManage && (
                  <button onClick={openCreate} className="btn-primary">
                    <Plus className="w-4 h-4" /> Create First Event
                  </button>
                )}
              </div>
            ) : (
              <div className="reveal">
                {/* Section header — mirrors the "Past Events" divider below */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary-600 uppercase tracking-widest">
                    <Calendar className="w-3.5 h-3.5" />
                    Upcoming Events
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 stagger">
                {events.map(event => {
                  const isFull       = (event.remaining_capacity ?? 0) <= 0
                  const isRegistered = registered.has(event.id)
                  return (
                    <div key={event.id}
                      className="group bg-white rounded-2xl shadow-card border border-gray-100 p-5
                                 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:border-gray-200">
                      <div className="flex items-start gap-4 mb-4">
                        <CalendarChip dateStr={event.scheduled_at} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h2 className="font-semibold text-gray-900 text-sm leading-snug group-hover:text-primary-700 transition-colors">{event.name}</h2>
                              {event.is_from_request && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-1">
                                  <Building2 className="w-2.5 h-2.5" /> Community Request
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge label={event.status} type="status" />
                              {canManage && (
                                <>
                                  <button onClick={() => openEdit(event)}
                                    className="p-1 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => deleteEvent(event.id)}
                                    className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {event.site?.name && (
                            <div className="flex items-center gap-1 mt-1">
                              <TreePine className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="text-xs text-gray-500 truncate">{event.site.name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {event.description && (
                        <p className="text-xs text-gray-500 leading-relaxed mb-4 line-clamp-2">{event.description}</p>
                      )}

                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          {formatDate(event.scheduled_at)}
                        </div>
                        {event.location_name && (
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {event.location_name}
                          </div>
                        )}
                      </div>

                      <div className="mb-4">
                        <CapacityBar remaining={event.remaining_capacity ?? 0} max={event.max_volunteers} />
                      </div>
                      {canManage && <button onClick={() => setDetailEvent(event)} className="mb-4 w-full min-h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">View Event Details & Participants</button>}
                      {canManage && <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800"><strong>{event.attendance_confirmations_count ?? 0} Bantay Bakawan confirmed</strong>{(event.attendance_confirmations?.length ?? 0) > 0 && <p className="mt-1 text-emerald-700">{event.attendance_confirmations?.map(row => row.user.name).join(', ')}</p>}</div>}

                      {canRegister && (
                        <div className="space-y-2">
                        <button onClick={() => setDetailEvent(event)} className="w-full min-h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">View Details</button>
                        {isRegistered ? (
                          <div className="space-y-2">
                            <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-green-50 text-green-700 text-sm font-semibold border border-green-200">
                              <CheckCircle2 className="w-4 h-4" /> Approved — You're In!
                            </div>
                            <button
                              onClick={() => handleCancelRegistration(event.id)}
                              disabled={cancelling === event.id || !cancellationAllowed(event)}
                              title={!cancellationAllowed(event) ? 'Cancellation closes one day before the event' : 'Cancel registration'}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40">
                              {cancelling === event.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Cancel Registration
                            </button>
                          </div>
                        ) : pendingReg.has(event.id) ? (
                          <div className="space-y-2">
                            <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200">
                              <Clock className="w-4 h-4" /> Pending MENRO Approval
                            </div>
                            <button
                              onClick={() => handleCancelRegistration(event.id)}
                              disabled={cancelling === event.id || !cancellationAllowed(event)}
                              title={!cancellationAllowed(event) ? 'Cancellation closes one day before the event' : 'Withdraw registration'}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40">
                              {cancelling === event.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Withdraw Request
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRegister(event)}
                            disabled={registering === event.id || isFull}
                            className={cn(
                              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150',
                              isFull ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'btn-primary',
                            )}
                          >
                            {registering === event.id && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isFull ? 'Event Full' : registering === event.id ? 'Registering…' : 'Register to Join'}
                          </button>
                        )}
                        </div>
                      )}

                      {canConfirm && (
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setDetailEvent(event)} className="min-h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">View Details</button>
                          <button onClick={() => toggleAttendance(event.id)} disabled={attendanceBusy === event.id} className={cn('min-h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5', attendance.has(event.id) ? 'bg-green-50 text-green-700 border border-green-200' : 'btn-primary')}>
                            {attendanceBusy === event.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {attendance.has(event.id) ? 'Confirmed · Undo' : 'Confirm Attendance'}
                          </button>
                        </div>
                      )}

                      {/* Public / non-registered users can join community-requested events */}
                      {!canRegister && !canConfirm && !canManage && event.is_from_request && !isFull && (
                        isRegistered ? (
                          <div className="space-y-2">
                            <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-green-50 text-green-700 text-sm font-semibold border border-green-200">
                              <CheckCircle2 className="w-4 h-4" /> Approved — You're In!
                            </div>
                            <button
                              onClick={() => handleCancelRegistration(event.id)}
                              disabled={cancelling === event.id}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                              {cancelling === event.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Cancel Registration
                            </button>
                          </div>
                        ) : pendingReg.has(event.id) ? (
                          <div className="space-y-2">
                            <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200">
                              <Clock className="w-4 h-4" /> Pending MENRO Approval
                            </div>
                            <button
                              onClick={() => handleCancelRegistration(event.id)}
                              disabled={cancelling === event.id}
                              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
                              {cancelling === event.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Withdraw Request
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRegister(event)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold btn-primary"
                          >
                            <UserCheck className="w-4 h-4" /> Register to Join
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
                </div>
              </div>
            )}

            {/* â”€â”€ Past Events / History â”€â”€ */}
            {pastEvents.length > 0 && (
              <div className="reveal">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5" />
                    Past Events
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pastEvents.map(event => (
                    <div key={event.id}
                      className="bg-gray-50 rounded-2xl border border-gray-200 p-5 opacity-80">
                      <div className="flex items-start gap-4 mb-3">
                        {/* Greyed-out calendar chip for past events */}
                        <div className="flex flex-col items-center justify-center w-12 h-14 bg-gray-300 rounded-xl shrink-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 leading-none">
                            {(() => { try { return format(parseISO(event.scheduled_at.replace(' ', 'T')), 'MMM') } catch { return '' } })()}
                          </span>
                          <span className="text-xl font-extrabold text-gray-600 leading-tight">
                            {(() => { try { return format(parseISO(event.scheduled_at.replace(' ', 'T')), 'd') } catch { return '' } })()}
                          </span>
                          <span className="text-[9px] text-gray-400 leading-none">
                            {(() => { try { return format(parseISO(event.scheduled_at.replace(' ', 'T')), 'EEE') } catch { return '' } })()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h2 className="font-semibold text-gray-600 text-sm leading-snug">{event.name}</h2>
                              {event.is_from_request && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full mt-1">
                                  <Building2 className="w-2.5 h-2.5" /> Community Request
                                </span>
                              )}
                            </div>
                            <Badge label={event.status === 'open' ? 'completed' : event.status} type="status" />
                          </div>
                          {event.site?.name && (
                            <div className="flex items-center gap-1 mt-1">
                              <TreePine className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="text-xs text-gray-400 truncate">{event.site.name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 mb-3">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          {formatDate(event.scheduled_at)}
                        </div>
                        {event.location_name && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {event.location_name}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          {event.max_volunteers - (event.remaining_capacity ?? 0)} / {event.max_volunteers} participants
                        </div>
                      </div>

                      {canConfirm && event.can_report_accomplishment ? (
                        event.report_submitted
                          ? <Link href={`/events/${event.id}/accomplishment`} className="w-full min-h-11 flex items-center justify-center rounded-xl bg-green-50 text-green-700 border border-green-200 text-sm font-semibold">Report Submitted · View Report</Link>
                          : <Link href={`/events/${event.id}/accomplishment`} className="btn-primary w-full min-h-11 justify-center">Report Accomplishment</Link>
                      ) : <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-200 text-gray-400 text-xs font-semibold cursor-not-allowed select-none"><Clock className="w-3.5 h-3.5" /> Event Ended</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* â”€â”€ Requests tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'requests' && canManage && (
          <div className="space-y-4 animate-fade-in">

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className="input pl-9 w-56" placeholder="Search org, event, or contact…"
                  value={reqSearch}
                  onChange={e => { setReqSearch(e.target.value); setReqPage(1) }} />
              </div>

              {/* Status filter pills */}
              <div className="flex gap-1.5">
                {(['', 'pending', 'approved', 'rejected'] as const).map(s => (
                  <button key={s}
                    onClick={() => { setReqStatusFilter(s); setReqPage(1) }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                      reqStatusFilter === s
                        ? s === 'pending'  ? 'bg-amber-500 text-white border-amber-500'
                          : s === 'approved' ? 'bg-green-600 text-white border-green-600'
                          : s === 'rejected' ? 'bg-red-500 text-white border-red-500'
                          : 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    )}>
                    {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              <button onClick={loadRequests} disabled={reqLoading}
                className="btn-secondary gap-2 ml-auto text-sm">
                <RefreshCw className={cn('w-3.5 h-3.5', reqLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            {/* Table */}
            {reqLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Organization', 'Event Name', 'Preferred Date', 'Participants', 'Status', 'Submitted', 'Actions'].map(h => (
                        <th key={h} className="table-header">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!requests?.data?.length ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                          No requests found.
                        </td>
                      </tr>
                    ) : requests.data.map(req => (
                      <React.Fragment key={req.id}>
                        <tr
                          id={`request-row-${req.id}`}
                          className={cn(
                            'transition-colors',
                            urlRequestId && Number(urlRequestId) === req.id
                              ? 'bg-amber-50/80 hover:bg-amber-50'
                              : 'hover:bg-gray-50/70'
                          )}
                        >
                          <td className="table-cell">
                            <div>
                              <p className="font-semibold text-gray-800 truncate max-w-[160px]">{req.organization_name}</p>
                              <p className="text-xs text-gray-400 truncate">{req.contact_person}</p>
                            </div>
                          </td>
                          <td className="table-cell font-medium text-gray-700 max-w-[160px]">
                            <span className="block truncate" title={req.event_name}>{req.event_name}</span>
                          </td>
                          <td className="table-cell text-gray-500 whitespace-nowrap tabular-nums">
                            {req.preferred_date ? new Date(req.preferred_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                          </td>
                          <td className="table-cell text-gray-500 tabular-nums text-center">
                            {req.expected_participants.toLocaleString()}
                          </td>
                          <td className="table-cell">
                            <span className={cn(
                              'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full',
                              req.status === 'pending'  ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              req.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                                                          'bg-red-50 text-red-700 border border-red-200'
                            )}>
                              <span className={cn('w-1.5 h-1.5 rounded-full',
                                req.status === 'pending' ? 'bg-amber-400' :
                                req.status === 'approved' ? 'bg-green-500' : 'bg-red-500'
                              )} />
                              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                            </span>
                          </td>
                          <td className="table-cell text-gray-400 whitespace-nowrap tabular-nums text-xs">
                            {req.created_at.split('T')[0]}
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setExpandedReqId(expandedReqId === req.id ? null : req.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="View details">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {req.status !== 'approved' && (
                                <button
                                  onClick={() => { setReviewModal({ req, action: 'approved' }); setReviewNote('') }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                  title="Approve">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {req.status !== 'rejected' && (
                                <button
                                  onClick={() => { setReviewModal({ req, action: 'rejected' }); setReviewNote('') }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Reject">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {req.status !== 'pending' && (
                                <button
                                  onClick={() => { setReviewModal({ req, action: 'pending' }); setReviewNote('') }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                  title="Set to Pending">
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {expandedReqId === req.id && (
                          <tr key={`${req.id}-detail`} className="bg-gray-50/80">
                            <td colSpan={7} className="px-6 py-5">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                                {/* Contact info */}
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Contact Information</p>
                                  <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5 text-sm">
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      <span className="font-semibold">{req.organization_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      {req.contact_person}
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      <a href={`mailto:${req.contact_email}`} className="text-primary-600 hover:underline">{req.contact_email}</a>
                                    </div>
                                    {req.contact_phone && (
                                      <div className="flex items-center gap-2 text-gray-600">
                                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        {req.contact_phone}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Event details */}
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Event Details</p>
                                  <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5 text-sm">
                                    <div className="flex items-center gap-2 text-gray-700">
                                      <TreePine className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      <span className="font-semibold">{req.event_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      {req.preferred_date ? new Date(req.preferred_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                                    </div>
                                    {req.preferred_location && (
                                      <div className="flex items-center gap-2 text-gray-600">
                                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        {req.preferred_location}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                      {req.expected_participants.toLocaleString()} expected participants
                                    </div>
                                  </div>
                                </div>

                                {/* Description & purpose */}
                                {(req.description || req.purpose) && (
                                  <div className="md:col-span-2 space-y-2">
                                    {req.description && (
                                      <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                                        <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-100 p-3 leading-relaxed">{req.description}</p>
                                      </div>
                                    )}
                                    {req.purpose && (
                                      <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Purpose / Objectives</p>
                                        <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-100 p-3 leading-relaxed">{req.purpose}</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Admin notes if reviewed */}
                                {req.admin_notes && (
                                  <div className="md:col-span-2">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Admin Notes</p>
                                    <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-xl p-3">{req.admin_notes}</p>
                                  </div>
                                )}

                                {/* Quick action buttons */}
                                <div className="md:col-span-2 flex gap-3 pt-1">
                                  {req.status !== 'approved' && (
                                    <button onClick={() => { setReviewModal({ req, action: 'approved' }); setReviewNote('') }}
                                      className="btn-primary gap-2 text-sm">
                                      <CheckCircle className="w-4 h-4" /> Approve
                                    </button>
                                  )}
                                  {req.status !== 'rejected' && (
                                    <button onClick={() => { setReviewModal({ req, action: 'rejected' }); setReviewNote('') }}
                                      className="btn-danger gap-2 text-sm">
                                      <XCircle className="w-4 h-4" /> Reject
                                    </button>
                                  )}
                                  {req.status !== 'pending' && (
                                    <button onClick={() => { setReviewModal({ req, action: 'pending' }); setReviewNote('') }}
                                      className="btn-secondary gap-2 text-sm">
                                      <Clock className="w-4 h-4" /> Set Pending
                                    </button>
                                  )}
                                  <a href={`mailto:${req.contact_email}`}
                                    className="btn-secondary gap-2 text-sm ml-auto">
                                    <Mail className="w-4 h-4" /> Email {req.contact_person.split(' ')[0]}
                                  </a>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Pagination */}
            {requests && requests.last_page > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-gray-400">
                  Page {requests.current_page} of {requests.last_page} · {requests.total} requests
                </p>
                <div className="flex gap-2">
                  <button disabled={reqPage <= 1} onClick={() => setReqPage(p => p - 1)}
                    className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">â† Prev</button>
                  <button disabled={reqPage >= requests.last_page} onClick={() => setReqPage(p => p + 1)}
                    className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next â†’</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* â”€â”€ Personal Info Registration Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {personalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto animate-scale-in">

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-amber-50 rounded-t-2xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <UserCheck className="w-4 h-4 text-amber-600" />
                    <h3 className="font-bold text-sm text-amber-800">Participant Registration</h3>
                  </div>
                  <p className="text-xs text-amber-700 line-clamp-1">"{personalModal.name}"</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Your registration will be reviewed. You'll be notified at the email you provide.
                  </p>
                </div>
                <button onClick={() => { setPersonalModal(null); setPersonalSuccess(false) }}
                  className="p-1.5 rounded-lg hover:bg-amber-100 transition-colors shrink-0">
                  <X className="w-4 h-4 text-amber-600" />
                </button>
              </div>
            </div>

            {personalSuccess ? (
              /* Success state */
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Registration Submitted!</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    {personalRegistrationStatus === 'pending_approval' ? <>Your registration is <strong>pending approval</strong>. The event organizer will review your application and notify you at <strong>{personalForm.email}</strong>.</> : <>Your place is confirmed for this event. We have recorded your details and notified MENRO.</>}
                  </p>
                </div>
                <button onClick={() => { setPersonalModal(null); setPersonalSuccess(false) }}
                  className="btn-primary w-full">Done</button>
              </div>
            ) : (
              /* Form */
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 border border-gray-100">
                  Please provide your participant details. MENRO can view these details when reviewing event registrations. Fields marked <span className="text-red-500">*</span> are required.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="label">Full Name <span className="text-red-500">*</span></label>
                    <input className="input" placeholder="e.g. Juan dela Cruz"
                      value={personalForm.full_name}
                      onChange={e => setPersonalForm(f => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Email Address <span className="text-red-500">*</span></label>
                    <input type="email" className="input" placeholder="you@email.com"
                      value={personalForm.email}
                      onChange={e => setPersonalForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Phone Number <span className="text-red-500">*</span></label>
                    <input className="input" placeholder="09XX-XXX-XXXX"
                      value={personalForm.phone}
                      onChange={e => setPersonalForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Home Address <span className="text-red-500">*</span></label>
                    <input className="input" placeholder="Barangay, Municipality, Province"
                      value={personalForm.address}
                      onChange={e => setPersonalForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Age <span className="text-red-500">*</span></label>
                    <input type="number" min={10} max={120} className="input" placeholder="e.g. 25"
                      value={personalForm.age}
                      onChange={e => setPersonalForm(f => ({ ...f, age: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Gender</label>
                    <select className="input" value={personalForm.gender}
                      onChange={e => setPersonalForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="">Prefer not to say</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Organization / Affiliation</label>
                    <input className="input" placeholder="e.g. School, NGO, Company, Government Office"
                      value={personalForm.organization}
                      onChange={e => setPersonalForm(f => ({ ...f, organization: e.target.value }))} />
                  </div>

                  {/* Representative option */}
                  <div className="sm:col-span-2">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5 rounded text-primary-600 w-4 h-4 shrink-0"
                        checked={personalForm.is_representative}
                        onChange={e => setPersonalForm(f => ({ ...f, is_representative: e.target.checked, group_size: e.target.checked ? f.group_size : '1' }))} />
                      <div>
                        <span className="text-sm font-semibold text-gray-800">I am a representative joining on behalf of a group or organization</span>
                        <p className="text-xs text-gray-400 mt-0.5">Check this if you are requesting to bring multiple people from your organization.</p>
                      </div>
                    </label>
                  </div>

                  {personalForm.is_representative && (
                    <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <label className="label text-amber-800">Number of People Joining (including yourself) <span className="text-red-500">*</span></label>
                      <input type="number" min={2} max={500} className="input" placeholder="e.g. 15"
                        value={personalForm.group_size}
                        onChange={e => setPersonalForm(f => ({ ...f, group_size: e.target.value }))} />
                      <p className="text-xs text-amber-600 mt-1.5">MENRO will review and confirm the number of slots available for your group.</p>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label className="label">Why do you want to join?</label>
                    <textarea className="input resize-none" rows={3}
                      placeholder="Share your motivation for joining this planting event…"
                      value={personalForm.motivation}
                      onChange={e => setPersonalForm(f => ({ ...f, motivation: e.target.value }))} />
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setPersonalModal(null)} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={submitPersonalRegistration} disabled={personalSubmitting}
                    className="btn-primary flex-1 gap-2">
                    <Send className="w-4 h-4" />
                    {personalSubmitting ? 'Submitting…' : 'Register to Join'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â”€â”€ Review Request Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            {/* Header */}
            <div className={cn(
              'px-5 py-4 rounded-t-2xl border-b',
              reviewModal.action === 'approved' ? 'bg-green-50 border-green-200' :
              reviewModal.action === 'rejected' ? 'bg-red-50 border-red-200' :
                                                  'bg-amber-50 border-amber-200'
            )}>
              <div className="flex items-center gap-2">
                {reviewModal.action === 'approved' ? <CheckCircle className="w-5 h-5 text-green-600" /> :
                 reviewModal.action === 'rejected' ? <XCircle className="w-5 h-5 text-red-600" /> :
                                                     <Clock className="w-5 h-5 text-amber-600" />}
                <h3 className={cn('font-bold text-sm',
                  reviewModal.action === 'approved' ? 'text-green-800' :
                  reviewModal.action === 'rejected' ? 'text-red-800' : 'text-amber-800')}>
                  {reviewModal.action === 'approved' ? 'Approve Request' :
                   reviewModal.action === 'rejected' ? 'Reject Request' : 'Set to Pending'}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                "{reviewModal.req.organization_name}" — {reviewModal.req.event_name}
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="label">
                  Admin Notes
                  <span className="text-gray-400 font-normal normal-case ml-1">(optional)</span>
                </label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder={
                    reviewModal.action === 'approved'
                      ? 'e.g. Approved. Please coordinate with MENRO office for site assignment.'
                      : reviewModal.action === 'rejected'
                      ? 'e.g. Rejected due to scheduling conflict. Please resubmit for a later date.'
                      : 'Add a note for this request…'
                  }
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={submitReview}
                  disabled={reviewing !== null}
                  className={cn('flex-1',
                    reviewModal.action === 'approved' ? 'btn-primary' :
                    reviewModal.action === 'rejected' ? 'btn-danger' : 'btn-secondary')}>
                  {reviewing !== null ? 'Submitting…' :
                   reviewModal.action === 'approved' ? 'Confirm Approval' :
                   reviewModal.action === 'rejected' ? 'Confirm Rejection' : 'Set to Pending'}
                </button>
                <button onClick={() => { setReviewModal(null); setReviewNote('') }}
                  className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Create / Edit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editingEvent ? 'Edit Event' : 'Create Planting Event'}
              </h2>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 1. Event Title */}
              <div>
                <label className="label">Event Title *</label>
                <input className="input" placeholder="e.g. Caminawit Mangrove Planting Day"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* 2. Restoration Site — searchable dropdown */}
              <div className="relative">
                <label className="label">Restoration Site *</label>
                {(() => {
                  const selectedSite = sites.find(s => String(s.id) === form.restoration_site_id)
                  const q = siteSearch.trim().toLowerCase()
                  const matches = sites.filter(s =>
                    !q || s.name.toLowerCase().includes(q) || (s.barangay ?? '').toLowerCase().includes(q))
                  return (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          className="input pl-9"
                          placeholder="Search restoration site…"
                          value={siteDropdownOpen ? siteSearch : (selectedSite ? `${selectedSite.name} — ${selectedSite.barangay ?? ''}` : siteSearch)}
                          onFocus={() => { setSiteDropdownOpen(true); setSiteSearch('') }}
                          onChange={e => { setSiteSearch(e.target.value); setSiteDropdownOpen(true) }}
                        />
                        {selectedSite && !siteDropdownOpen && (
                          <button type="button" onClick={() => { setForm(f => ({ ...f, restoration_site_id: '' })); setSiteSearch('') }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {siteDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                          {matches.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-gray-400">No sites found</p>
                          ) : matches.map(s => (
                            <button key={s.id} type="button"
                              onClick={() => { setForm(f => ({ ...f, restoration_site_id: String(s.id) })); setSiteDropdownOpen(false); setSiteSearch('') }}
                              className={cn('w-full text-left px-3 py-2 hover:bg-primary-50 flex items-center justify-between gap-2',
                                String(s.id) === form.restoration_site_id && 'bg-primary-50')}>
                              <span className="min-w-0">
                                <span className="text-sm font-medium text-gray-800 block truncate">{s.name}</span>
                                <span className="text-xs text-gray-400">{s.barangay ? `Brgy. ${s.barangay}` : '—'}</span>
                              </span>
                              <Badge label={s.status} type="status" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* 3. Target Mangrove Species — multi-select checkboxes */}
              <div>
                <label className="label">Target Mangrove Species *</label>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 p-1.5 space-y-0.5">
                  {speciesOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-gray-400">Loading species…</p>
                  ) : speciesOptions.map(sp => {
                    const checked = form.target_species.includes(sp.scientific_name)
                    return (
                      <label key={sp.id}
                        className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm',
                          checked ? 'bg-primary-50 text-primary-800' : 'hover:bg-gray-50 text-gray-700')}>
                        <input type="checkbox" checked={checked}
                          onChange={() => toggleTargetSpecies(sp.scientific_name)}
                          className="rounded text-primary-600 w-4 h-4 shrink-0" />
                        <span className="min-w-0 truncate">
                          <span className="italic">{sp.scientific_name}</span>
                          {sp.local_name && <span className="text-gray-400 not-italic"> — {sp.local_name}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* 4. Automatic Zonation Information — from selected species */}
              {form.target_species.length > 0 && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                  <p className="text-xs font-bold text-teal-800 mb-2 flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5" /> Selected Species &amp; Recommended Zonation
                  </p>
                  <div className="space-y-1">
                    {form.target_species.map(name => {
                      const z = getZonation(name)
                      const sp = speciesOptions.find(s => s.scientific_name === name)
                      return (
                        <div key={name} className="flex items-center justify-between gap-3 text-xs">
                          <span className="italic text-gray-700 truncate">
                            {name}{sp?.local_name ? <span className="not-italic text-gray-400"> — {sp.local_name}</span> : null}
                          </span>
                          <span className="shrink-0 inline-flex items-center rounded-full bg-white border border-teal-200 text-teal-700 px-2 py-0.5 font-medium">
                            {z ? z.zone : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 5. Schedule and Capacity */}
              <div className="pt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Schedule and Capacity</p>
                <div className="space-y-4">
                  <div>
                    <label className="label">Date &amp; Time *</label>
                    <input className="input" type="datetime-local"
                      value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Max Number of Volunteers *</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {CAPACITY_PRESETS.map(n => (
                        <button key={n} type="button"
                          onClick={() => setForm(f => ({ ...f, max_volunteers: String(n) }))}
                          className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors',
                            Number(form.max_volunteers) === n
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                          {n}
                        </button>
                      ))}
                      <input className="input w-28 ml-1" type="number" min={1} step={1} placeholder="Custom"
                        value={form.max_volunteers} onChange={e => setForm(f => ({ ...f, max_volunteers: e.target.value }))} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Pick a preset or enter a custom capacity.</p>
                  </div>
                </div>
              </div>

              {/* 6. Additional Notes + Quick Add */}
              <div>
                <label className="label">Additional Notes</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_NOTES.map(note => {
                    const active = form.notes.split(',').map(s => s.trim()).includes(note)
                    return (
                      <button key={note} type="button" onClick={() => toggleQuickNote(note)}
                        className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                        {active ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {note}
                      </button>
                    )
                  })}
                </div>
                <textarea className="input resize-none" rows={3}
                  placeholder="Other reminders or instructions (optional)…"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* 7. Status */}
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {EVENT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitForm} disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Saving…' : editingEvent ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Planting Event dialog (new events only) ─────────────────── */}
      {confirmCreate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Confirm Planting Event</h2>
              <button onClick={() => setConfirmCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-2.5 text-sm">
              {(() => {
                const site = sites.find(s => String(s.id) === form.restoration_site_id)
                const zonations = Array.from(new Set(
                  form.target_species.map(s => getZonation(s)?.zone).filter(Boolean) as string[]
                ))
                let whenStr = form.scheduled_at
                try { whenStr = format(parseISO(form.scheduled_at), 'MMMM d, yyyy — h:mm a') } catch {}
                const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
                  <div className="flex gap-3">
                    <span className="w-36 shrink-0 text-gray-400 font-medium">{k}</span>
                    <span className="text-gray-800 min-w-0">{v}</span>
                  </div>
                )
                return (
                  <>
                    <Row k="Event Title" v={form.name} />
                    <Row k="Restoration Site" v={site ? `${site.name}${site.barangay ? ` (Brgy. ${site.barangay})` : ''}` : '—'} />
                    <Row k="Target Species" v={<span className="italic">{form.target_species.join(', ') || '—'}</span>} />
                    <Row k="Zonation" v={zonations.join(', ') || '—'} />
                    <Row k="Date & Time" v={whenStr} />
                    <Row k="Volunteer Capacity" v={form.max_volunteers} />
                    <Row k="Additional Notes" v={form.notes.trim() || '—'} />
                    <Row k="Status" v={form.status.charAt(0).toUpperCase() + form.status.slice(1)} />
                  </>
                )
              })()}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setConfirmCreate(false)} disabled={submitting} className="btn-secondary flex-1">
                Back to Edit
              </button>
              <button onClick={() => saveEvent()} disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Creating…' : 'Confirm & Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailEvent && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center" onClick={() => setDetailEvent(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="event-detail-title" className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between gap-3"><h2 id="event-detail-title" className="text-lg font-bold">{detailEvent.name}</h2><button onClick={() => setDetailEvent(null)} aria-label="Close details" className="p-2"><X /></button></div>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{detailEvent.description || 'No additional details provided.'}</p>
            <div className="text-sm text-gray-600 space-y-1"><p>{formatDate(detailEvent.scheduled_at)}</p><p>{detailEvent.site?.name}{detailEvent.location_name ? ` · ${detailEvent.location_name}` : ''}</p><p>Volunteer registration spots: {detailEvent.remaining_capacity ?? detailEvent.max_volunteers} of {detailEvent.max_volunteers} remaining</p></div>
            {canManage && <div className="border-t border-gray-100 pt-3"><h3 className="text-sm font-bold text-gray-900">Registered participants ({detailEvent.registrations?.length ?? 0})</h3>{detailEvent.registrations?.length ? <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">{detailEvent.registrations.map(reg => <div key={reg.id} className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600"><p className="font-semibold text-gray-900">{reg.full_name ?? 'Participant'}{reg.age ? ` · ${reg.age} years old` : ''}{(reg.group_size ?? 1) > 1 ? ` · group of ${reg.group_size}` : ''}</p><p>{reg.email ?? 'No email'}{reg.phone ? ` · ${reg.phone}` : ''}</p>{reg.address && <p>{reg.address}</p>}{reg.organization && <p>Organization: {reg.organization}</p>}</div>)}</div> : <p className="mt-2 text-xs text-gray-500">No registrations yet.</p>}</div>}
            <button onClick={() => setDetailEvent(null)} className="btn-primary min-h-11 w-full justify-center">Close</button>
          </section>
        </div>
      )}
    </SidebarLayout>
  )
}
