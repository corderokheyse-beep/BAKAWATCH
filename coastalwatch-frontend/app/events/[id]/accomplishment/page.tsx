'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import LocationPicker from '@/components/map/LocationPicker'
import { useAuth } from '@/lib/auth-context'
import { fetchPastEvents, fetchSpecies } from '@/lib/mangrove-api'
import type { MangroveSpecies, PlantingEvent } from '@/lib/types'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { readJpegGps } from '@/lib/exif-gps'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export default function EventAccomplishmentPage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const eventId = Number(params.id)
  const [event, setEvent] = useState<PlantingEvent | null>(null)
  const [species, setSpecies] = useState<MangroveSpecies[]>([])
  const [loading, setLoading] = useState(true)
  const [existing, setExisting] = useState<any>(null)
  const [speciesId, setSpeciesId] = useState('')
  const [seedlings, setSeedlings] = useState('0')
  const [volunteers, setVolunteers] = useState('0')
  const [remarks, setRemarks] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [photoGps, setPhotoGps] = useState<({ lat: number; lng: number } | null)[]>([])
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [hasExifGps, setHasExifGps] = useState(false)
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), [])

  useEffect(() => {
    if (authLoading) return
    if (!user || user.role !== 'field_worker') { router.replace('/login'); return }
    Promise.all([fetchPastEvents(), fetchSpecies(), api.get(`/events/${eventId}/accomplishments/mine`).catch(() => ({ data: null }))])
      .then(([past, speciesList, mine]) => {
        const found = past.find(e => e.id === eventId)
        if (!found || !found.can_report_accomplishment) { toast.error('This event is not assigned to your site.'); router.replace('/events'); return }
        setEvent(found); setSpecies(speciesList); setExisting(mine.data)
      })
      .catch(() => toast.error('Could not load event report details.'))
      .finally(() => setLoading(false))
  }, [authLoading, user, eventId, router])

  useEffect(() => {
    const previews = photos.map(file => URL.createObjectURL(file))
    setPhotoPreviews(previews)
    return () => previews.forEach(URL.revokeObjectURL)
  }, [photos])

  async function choosePhotos(list: FileList | null) {
    if (!list) return
    const selected = Array.from(list)
    if (selected.length < 1 || selected.length > 5) { toast.error('Choose between 1 and 5 photos.'); return }
    if (selected.some(file => !IMAGE_TYPES.includes(file.type) || file.size > MAX_BYTES)) { toast.error('Photos must be JPEG, PNG, WebP, or HEIC and 10 MB or smaller.'); return }
    setPhotos(selected)
    const gps = await Promise.all(selected.map(readJpegGps))
    const firstGps = gps.find((item): item is { lat: number; lng: number } => Boolean(item))
    setPhotoGps(gps)
    setHasExifGps(Boolean(firstGps))
    if (firstGps) setCoordinates(firstGps)
    else {
      setCoordinates(null)
      navigator.geolocation?.getCurrentPosition(
        position => setCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    }
  }

  function removePhoto(index: number) {
    const remainingPhotos = photos.filter((_, i) => i !== index)
    const remainingGps = photoGps.filter((_, i) => i !== index)
    const firstGps = remainingGps.find((item): item is { lat: number; lng: number } => Boolean(item))
    setPhotos(remainingPhotos)
    setPhotoGps(remainingGps)
    setHasExifGps(Boolean(firstGps))
    setCoordinates(firstGps ?? null)
    if (!firstGps && remainingPhotos.length > 0) {
      navigator.geolocation?.getCurrentPosition(
        position => setCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Location services are not available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      position => {
        setCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocating(false)
        toast.success('Current location pinned on the map.')
      },
      () => {
        setLocating(false)
        toast.error('Could not read your location. Check browser location permissions and try again.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  async function submit() {
    if (!event || !speciesId || photos.length < 1 || !/^\d+$/.test(seedlings) || !/^\d+$/.test(volunteers)) {
      toast.error('Choose a species, add 1–5 photos, and enter whole number counts.'); return
    }
    if (!confirm('Are you sure you want to submit this accomplishment report?')) return
    setSubmitting(true)
    const body = new FormData()
    body.append('mangrove_species_id', speciesId)
    body.append('seedlings_planted', seedlings)
    body.append('volunteers_present', volunteers)
    body.append('remarks', remarks)
    photos.forEach((file, index) => body.append(`photos[${index}]`, file))
    if (coordinates) { body.append('latitude', String(coordinates.lat)); body.append('longitude', String(coordinates.lng)) }
    try {
      await api.post(`/events/${event.id}/accomplishments`, body, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Day 0 accomplishment report submitted.')
      router.replace('/events')
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Could not submit the report.') }
    finally { setSubmitting(false) }
  }

  if (loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>
  if (!event) return <SidebarLayout><div className="p-6">Event not found.</div></SidebarLayout>
  return <SidebarLayout title="Event Accomplishment Report" subtitle="Submit the Day 0 baseline for mangrove growth monitoring">
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {existing ? <section className="card space-y-2"><h2 className="text-lg font-bold text-green-800">Report Submitted · View Report</h2><p><strong>Event:</strong> {event.name} · {formatDate(event.scheduled_at)}</p><p><strong>Reporter:</strong> {existing.user?.name ?? 'Bantay Bakawan'}</p><p><strong>Submitted:</strong> {existing.submitted_at ? formatDate(existing.submitted_at) : ''}</p><p><strong>Species:</strong> {existing.species_name}</p><p><strong>Seedlings planted:</strong> {existing.seedlings_planted}</p><p><strong>Volunteers present:</strong> {existing.volunteers_present}</p>{existing.remarks && <p><strong>Observation / Remarks:</strong> {existing.remarks}</p>}<p><strong>Location:</strong> {existing.latitude ?? '—'}, {existing.longitude ?? '—'}</p><div className="grid grid-cols-2 gap-2">{(existing.photos ?? []).map((photo: any, i: number) => <img key={i} src={photo.url} alt={`Submitted event photo ${i + 1}`} className="rounded-xl w-full aspect-square object-cover" />)}</div></section> : <>
        <section className="card space-y-4">
          <label className="block text-sm font-semibold">Event Title<input readOnly value={event.name} className="input mt-1 bg-gray-50" /></label>
          <label className="block text-sm font-semibold">Event Date<input readOnly value={formatDate(event.scheduled_at)} className="input mt-1 bg-gray-50" /></label>
          <label className="block text-sm font-semibold">Report Submission Date<input readOnly value={today} className="input mt-1 bg-gray-50" /></label>
          <label className="block text-sm font-semibold">Mangrove Species planted<select className="input mt-1" value={speciesId} onChange={e => setSpeciesId(e.target.value)}><option value="">Select species</option>{species.map(item => <option key={item.id} value={item.id}>{item.local_name || item.scientific_name} ({item.scientific_name})</option>)}</select></label>
          <label className="block text-sm font-semibold">Total Seedlings Planted<input className="input mt-1 min-h-12" type="number" min="0" step="1" value={seedlings} onChange={e => setSeedlings(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Volunteers Present<input className="input mt-1 min-h-12" type="number" min="0" step="1" value={volunteers} onChange={e => setVolunteers(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Documentation photos (1–5)<input className="input mt-1 min-h-12" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={e => void choosePhotos(e.target.files)} /></label>
          <p className="text-xs text-gray-500">{photos.length} photo(s) selected. Each file must be 10 MB or smaller.</p>
          {photos.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{photos.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="relative"><img src={photoPreviews[index]} alt={file.name} className="rounded-lg aspect-square w-full object-cover" /><button type="button" onClick={() => removePhoto(index)} aria-label={`Remove ${file.name}`} className="absolute right-2 top-2 h-9 w-9 rounded-full bg-white/95 text-gray-700 shadow flex items-center justify-center"><X className="w-4 h-4" /></button></div>)}</div>}
          {!hasExifGps && photos.length > 0 && <div className="space-y-2"><p className="text-sm text-amber-800">⚠️ GPS location missing. Tap the map to pin the planting spot or use current location.</p><button type="button" className="btn-secondary min-h-11" onClick={useCurrentLocation} disabled={locating}>{locating ? 'Finding current location…' : 'Use current location'}</button><LocationPicker latitude={coordinates?.lat ?? null} longitude={coordinates?.lng ?? null} onChange={(lat, lng) => setCoordinates({ lat, lng })} /></div>}
          <label className="block text-sm font-semibold">Observation / Remarks <span className="font-normal text-gray-400">(optional)</span><textarea className="input mt-1 min-h-28" maxLength={5000} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Issues encountered, site condition, weather..." /></label>
        </section>
        <button onClick={submit} disabled={submitting} className="btn-primary min-h-12 w-full justify-center">{submitting ? 'Submitting…' : 'Submit Accomplishment Report'}</button>
      </>}
    </main>
  </SidebarLayout>
}
