'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import SidebarLayout from '@/components/layout/SidebarLayout'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { fetchSites, fetchSpecies } from '@/lib/mangrove-api'
import type { RestorationSite, MangroveSpecies, SeedlingAvailability } from '@/lib/types'
import {
  TreePine, Building2, User, Mail, Phone, Calendar,
  MapPin, Users, FileText, CheckCircle, ArrowLeft, Send, X,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface FormData {
  organization_name: string
  contact_person: string
  contact_email: string
  contact_phone: string
  contact_address: string
  event_name: string
  description: string
  preferred_date: string
  preferred_location: string
  preferred_restoration_site_id: string
  target_species: number[]
  expected_participants: string
  seedlings_requested: string
  purpose: string
}

const empty = (): FormData => ({
  organization_name: '', contact_person: '', contact_email: '', contact_phone: '', contact_address: '',
  event_name: '', description: '', preferred_date: '', preferred_location: '',
  preferred_restoration_site_id: '', target_species: [], expected_participants: '', seedlings_requested: '', purpose: '',
})

export default function EventRequestPage() {
  const { user } = useAuth()
  const [form, setForm]         = useState<FormData>(empty())
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [minDate, setMinDate]       = useState('')
  const [sites, setSites] = useState<RestorationSite[]>([])
  const [species, setSpecies] = useState<MangroveSpecies[]>([])
  const [seedlingAvailability, setSeedlingAvailability] = useState<SeedlingAvailability[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const loadSeedlingAvailability = useCallback(async () => {
    setAvailabilityLoading(true)
    setAvailabilityError('')
    try {
      const { data } = await api.get<SeedlingAvailability[]>('/seedlings/availability')
      setSeedlingAvailability(Array.isArray(data) ? data : [])
    } catch {
      setAvailabilityError('Current seedling availability could not be loaded.')
    } finally {
      setAvailabilityLoading(false)
    }
  }, [])

  // Set min date on client only to avoid SSR/client hydration mismatch
  useEffect(() => {
    const today = new Date()
    setMinDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
    fetchSites().then(setSites).catch(() => {})
    fetchSpecies().then(setSpecies).catch(() => {})
    loadSeedlingAvailability()
    const requestedEditId = Number(new URLSearchParams(window.location.search).get('edit'))
    if (requestedEditId) {
      api.get('/event-requests/mine').then(({ data }) => {
        const request = (Array.isArray(data) ? data : data?.data ?? []).find((row: any) => Number(row.id) === requestedEditId)
        if (!request || request.status !== 'pending') { toast.error('Only your pending requests can be edited.'); return }
        setEditingId(request.id)
        setForm({
          organization_name: request.organization_name ?? '', contact_person: request.contact_person ?? '', contact_email: request.contact_email ?? '', contact_phone: request.contact_phone ?? '', contact_address: request.contact_address ?? '',
          event_name: request.event_name ?? '', description: request.description ?? '', preferred_date: request.preferred_date?.slice(0, 10) ?? '', preferred_location: request.preferred_location ?? '',
          preferred_restoration_site_id: String(request.preferred_restoration_site_id ?? ''), target_species: (request.target_species ?? []).map(Number), expected_participants: String(request.expected_participants ?? ''), seedlings_requested: String(request.seedlings_requested ?? ''), purpose: request.purpose ?? '',
        })
      }).catch(() => toast.error('Could not load this event request for editing.'))
    }
  }, [loadSeedlingAvailability])

  // Pre-fill contact info from logged-in user
  useEffect(() => {
    if (!user) return
    setForm(f => ({
      ...f,
      contact_person: f.contact_person || user.name || '',
      contact_email:  f.contact_email  || user.email || '',
      contact_phone: f.contact_phone || user.phone || '',
    }))
  }, [user])

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const availableForSpecies = (item: MangroveSpecies) => {
    const scientificName = item.scientific_name.trim().toLowerCase()
    const scientificMatches = seedlingAvailability.filter(
      entry => entry.species_name.trim().toLowerCase() === scientificName,
    )
    const matches = scientificMatches.length
      ? scientificMatches
      : seedlingAvailability.filter(
        entry => entry.species_name.trim().toLowerCase() === item.local_name?.trim().toLowerCase(),
      )
    return matches.reduce((total, entry) => total + Math.max(0, Number(entry.total_remaining) || 0), 0)
  }

  const selectedSpecies = species.filter(item => form.target_species.includes(item.id))
  const availableSeedlings = selectedSpecies.length
    ? selectedSpecies.reduce((total, item) => total + availableForSpecies(item), 0)
    : seedlingAvailability.reduce((total, item) => total + Math.max(0, Number(item.total_remaining) || 0), 0)

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.organization_name.trim()) errs.organization_name = 'Organization name is required.'
    if (!form.contact_person.trim())    errs.contact_person    = 'Contact person is required.'
    if (!form.contact_address.trim()) errs.contact_address = 'Address is required.'
    if (!form.contact_phone.trim()) errs.contact_phone = 'Mobile number is required.'
    if (!form.contact_email.trim())     errs.contact_email     = 'Email is required.'
    else if (!/\S+@\S+\.\S+/.test(form.contact_email)) errs.contact_email = 'Enter a valid email.'
    if (!form.event_name.trim())        errs.event_name        = 'Event name is required.'
    if (!form.preferred_date)           errs.preferred_date    = 'Preferred date is required.'
    if (!form.expected_participants || Number(form.expected_participants) < 1)
      errs.expected_participants = 'Enter the expected number of participants.'
    if (!form.seedlings_requested || !Number.isInteger(Number(form.seedlings_requested)) || Number(form.seedlings_requested) < 1)
      errs.seedlings_requested = 'Enter the number of seedlings requested.'
    if (!form.preferred_restoration_site_id) errs.preferred_restoration_site_id = 'Choose a restoration site.'
    if (!form.target_species.length) errs.target_species = 'Choose at least one target species.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setConfirmSubmit(true)
  }

  const confirmAndSubmitRequest = async () => {
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        expected_participants: Number(form.expected_participants),
        seedlings_requested: Number(form.seedlings_requested),
        preferred_restoration_site_id: Number(form.preferred_restoration_site_id),
        target_species: form.target_species,
      }
      if (editingId) await api.put(`/event-requests/${editingId}`, payload)
      else await api.post('/event-requests', payload)
      setConfirmSubmit(false)
      setSubmitted(true)
      toast.success('Request submitted successfully!')
    } catch (err: any) {
      setConfirmSubmit(false)
      const apiErrors = err?.response?.data?.errors ?? {}
      const mapped: Record<string, string> = {}
      Object.entries(apiErrors).forEach(([k, v]) => { mapped[k] = (v as string[]).join(' ') })
      if (Object.keys(mapped).length) {
        setErrors(mapped)
      } else {
        toast.error(err?.response?.data?.message ?? 'Submission failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <SidebarLayout title="Event Request">
        <div className="page-container flex items-center justify-center py-24">
          <div className="max-w-md w-full text-center space-y-5 animate-scale-in">
            <div className="w-20 h-20 rounded-3xl bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Request Submitted!</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Thank you, <strong>{form.organization_name}</strong>. Your plantation event request {editingId ? 'has been updated and sent to MENRO for review.' : 'has been received.'}
                The MENRO Admin will review it and get back to you at <strong>{form.contact_email}</strong>.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Link href={user ? '/volunteer/requests' : '/events'} className="btn-primary gap-2">
                <Calendar className="w-4 h-4" /> {user ? 'View My Requests' : 'View Events'}
              </Link>
              {!editingId && <button onClick={() => { setForm(empty()); setSubmitted(false) }} className="btn-secondary">
                Submit Another
              </button>}
            </div>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout title="Request Plantation Event" subtitle="Submit a request to organize a planting activity">
      <div className="page-container max-w-2xl">

        {/* Header */}
        <div className="mb-6">
          <Link href="/events" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-primary-600 transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Events
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-forest-700 flex items-center justify-center shrink-0">
              <TreePine className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">{editingId ? 'Edit Planting Event Request' : 'Request a Plantation Event'}</h1>
              <p className="page-subtitle">
                Organizations and groups can request to conduct a mangrove planting activity in Gloria, Oriental Mindoro.
                The MENRO Admin will review and respond to your request.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Organization info */}
          <div className="card space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-primary-600" />
              <h2 className="section-title">Organization Information</h2>
            </div>

            <div>
              <label className="label">Organization / Group Name *</label>
              <input className={cn('input', errors.organization_name && 'border-red-400 focus:border-red-400')}
                placeholder="e.g. Gloria Youth Environmental Club"
                value={form.organization_name} onChange={set('organization_name')}
                suppressHydrationWarning />
              {errors.organization_name && <p className="text-xs text-red-500 mt-1">{errors.organization_name}</p>}
            </div>

            <div><label className="label">Request Date</label><input className="input bg-gray-50" value={minDate} readOnly /></div>
            <div><label className="label">Address *</label><input className={cn('input', errors.contact_address && 'border-red-400')} placeholder="Barangay, municipality, province" value={form.contact_address} onChange={set('contact_address')} />{errors.contact_address && <p className="mt-1 text-xs text-red-500">{errors.contact_address}</p>}</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Contact Person *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={cn('input pl-9', errors.contact_person && 'border-red-400')}
                    placeholder="Full name"
                    value={form.contact_person} onChange={set('contact_person')}
                    suppressHydrationWarning />
                </div>
                {errors.contact_person && <p className="text-xs text-red-500 mt-1">{errors.contact_person}</p>}
              </div>
              <div>
                <label className="label">Mobile Number *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" placeholder="e.g. 09XX-XXX-XXXX"
                    value={form.contact_phone} onChange={set('contact_phone')}
                    suppressHydrationWarning />
                </div>
                {errors.contact_phone && <p className="mt-1 text-xs text-red-500">{errors.contact_phone}</p>}
              </div>
            </div>

            <div>
              <label className="label">Contact Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" className={cn('input pl-9', errors.contact_email && 'border-red-400')}
                  placeholder="email@organization.com"
                  value={form.contact_email} onChange={set('contact_email')}
                  suppressHydrationWarning />
              </div>
              {errors.contact_email && <p className="text-xs text-red-500 mt-1">{errors.contact_email}</p>}
            </div>
          </div>

          {/* Event details */}
          <div className="card space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <TreePine className="w-4 h-4 text-primary-600" />
              <h2 className="section-title">Event Details</h2>
            </div>

            <div>
              <label className="label">Event Name *</label>
              <input className={cn('input', errors.event_name && 'border-red-400')}
                placeholder="e.g. Gloria Youth Mangrove Planting Drive 2026"
                value={form.event_name} onChange={set('event_name')}
                suppressHydrationWarning />
              {errors.event_name && <p className="text-xs text-red-500 mt-1">{errors.event_name}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Preferred Date *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="date" className={cn('input pl-9', errors.preferred_date && 'border-red-400')}
                    min={minDate}
                    value={form.preferred_date} onChange={set('preferred_date')}
                    suppressHydrationWarning />
                </div>
                {errors.preferred_date && <p className="text-xs text-red-500 mt-1">{errors.preferred_date}</p>}
              </div>
              <div>
                <label className="label">Expected Participants *</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="number" min={1} className={cn('input pl-9', errors.expected_participants && 'border-red-400')}
                    placeholder="e.g. 50"
                    value={form.expected_participants} onChange={set('expected_participants')}
                    suppressHydrationWarning />
                </div>
                {errors.expected_participants && <p className="text-xs text-red-500 mt-1">{errors.expected_participants}</p>}
              </div>
              <div>
                <label className="label">Seedlings Requested *</label>
                <input type="number" min={1} step={1} className={cn('input', errors.seedlings_requested && 'border-red-400')}
                  placeholder="e.g. 100"
                  value={form.seedlings_requested} onChange={set('seedlings_requested')}
                  suppressHydrationWarning />
                {errors.seedlings_requested && <p className="text-xs text-red-500 mt-1">{errors.seedlings_requested}</p>}
              </div>
            </div>

            <div>
              <label className="label">Preferred Restoration Site *</label>
              <select className={cn('input', errors.preferred_restoration_site_id && 'border-red-400')} value={form.preferred_restoration_site_id} onChange={e => { const selected = sites.find(site => String(site.id) === e.target.value); setForm(f => ({ ...f, preferred_restoration_site_id: e.target.value, preferred_location: selected?.name ?? f.preferred_location })) }}>
                <option value="">Select a site</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}{site.barangay ? ` · ${site.barangay}` : ''}</option>)}
              </select>{errors.preferred_restoration_site_id && <p className="mt-1 text-xs text-red-500">{errors.preferred_restoration_site_id}</p>}
            </div>

            <div>
              <label className="label">Target Mangrove Species *</label>
              <div className="mt-1 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-gray-200 p-3 sm:grid-cols-2">{species.map(item => <label key={item.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-sm text-gray-700 transition hover:bg-emerald-50"><span className="flex items-center gap-2"><input type="checkbox" checked={form.target_species.includes(item.id)} onChange={e => setForm(f => ({ ...f, target_species: e.target.checked ? [...f.target_species, item.id] : f.target_species.filter(id => id !== item.id) }))} />{item.local_name ?? item.scientific_name} <em className="text-xs text-gray-500">{item.scientific_name}</em></span><span className="shrink-0 text-[11px] text-emerald-700">{availableForSpecies(item).toLocaleString()} available</span></label>)}</div>{errors.target_species && <p className="mt-1 text-xs text-red-500">{errors.target_species}</p>}
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-emerald-900">
                    {selectedSpecies.length ? 'Available for selected species' : 'Total seedlings available'}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-emerald-800">
                    {availabilityLoading ? 'Loading…' : `${availableSeedlings.toLocaleString()} seedlings`}
                  </span>
                </div>
                {availabilityError
                  ? <div className="mt-1 flex items-center justify-between gap-2 text-xs text-red-700"><span>{availabilityError}</span><button type="button" onClick={loadSeedlingAvailability} className="font-semibold underline">Retry</button></div>
                  : <p className="mt-1 text-[11px] text-emerald-700">Live remaining stock from the MENRO inventory. Availability may change before approval.</p>}
              </div>
            </div>

            <div>
              <label className="label">Preferred Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className="input pl-9" placeholder="e.g. Caminawit Shoreline, Gloria"
                  value={form.preferred_location} onChange={set('preferred_location')}
                  suppressHydrationWarning />
              </div>
            </div>

            <div>
              <label className="label">Event Description</label>
              <textarea className="input resize-none" rows={3}
                placeholder="Briefly describe the event, activities planned, etc."
                value={form.description} onChange={set('description')}
                suppressHydrationWarning />
            </div>

            <div>
              <label className="label">Purpose / Objectives</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <textarea className="input pl-9 resize-none" rows={3}
                  placeholder="Why does your organization want to conduct this planting activity?"
                  value={form.purpose} onChange={set('purpose')}
                  suppressHydrationWarning />
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-sm text-primary-800">
            <p className="font-semibold mb-1">What happens next?</p>
            <ul className="list-disc list-inside space-y-0.5 text-primary-700 text-xs">
              <li>Your request will be reviewed by the MENRO Admin.</li>
              <li>You will be contacted at the email you provided with the decision.</li>
              <li>If approved, the event will be listed on the BAKAWATCH Events page.</li>
              <li>Approved events are subject to site availability and MENRO scheduling.</li>
            </ul>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full gap-2 py-3">
            <Send className="w-4 h-4" />
            {submitting ? (editingId ? 'Saving changes…' : 'Submitting Request…') : (editingId ? 'Save Request Changes' : 'Submit Plantation Event Request')}
          </button>
        </form>
      </div>

      {confirmSubmit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/70 rounded-t-2xl">
              <div>
                <h2 className="text-sm font-bold text-emerald-950">
                  {editingId ? 'Confirm Request Changes' : 'Confirm Planting Event Request'}
                </h2>
                <p className="text-xs text-emerald-700">
                  {editingId ? `Save changes to “${form.event_name}”?` : `Submit “${form.event_name}” for MENRO review?`}
                </p>
              </div>
              <button onClick={() => setConfirmSubmit(false)} disabled={submitting} className="p-1.5 rounded-lg hover:bg-emerald-100/70 transition-colors">
                <X className="w-4 h-4 text-emerald-700" />
              </button>
            </div>
            <div className="p-6 space-y-2.5 text-sm">
              {(() => {
                const selectedSite = sites.find(s => String(s.id) === form.preferred_restoration_site_id)
                const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
                  <div className="flex gap-3">
                    <span className="w-32 shrink-0 text-gray-400 font-medium text-xs uppercase tracking-wide pt-0.5">{k}</span>
                    <span className="text-gray-800 font-medium min-w-0 break-words">{v}</span>
                  </div>
                )
                return (
                  <>
                    <Row k="Event Name" v={form.event_name} />
                    <Row k="Organization" v={form.organization_name} />
                    <Row k="Preferred Site" v={selectedSite?.name ?? form.preferred_location ?? '—'} />
                    <Row k="Preferred Date" v={form.preferred_date} />
                    <Row k="Participants" v={`${form.expected_participants} expected`} />
                    <Row k="Seedlings Requested" v={Number(form.seedlings_requested).toLocaleString()} />
                    <Row k="Available Seedlings" v={availableSeedlings.toLocaleString()} />
                    <Row k="Contact Person" v={form.contact_person} />
                    <Row k="Contact Info" v={`${form.contact_email} · ${form.contact_phone}`} />
                  </>
                )
              })()}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button type="button" onClick={() => setConfirmSubmit(false)} disabled={submitting} className="btn-secondary flex-1">
                Back to Edit
              </button>
              <button type="button" onClick={confirmAndSubmitRequest} disabled={submitting} className="btn-primary flex-1 gap-2">
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting…' : editingId ? 'Confirm & Save' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
