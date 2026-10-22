'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import type { Report, ReportUpdate, ReportStatusHistoryEntry } from '@/lib/types'
import { readJpegGps } from '@/lib/exif-gps'
import { Plus, Camera, Check, X, Clock, ImageOff, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), { ssr: false })
const PERIODS = ['1st Month Check', '3rd Month Check', '6th Month Check', '1st Year Check']
const THREATS = ['Lumala / Natuluyan nang nasira', 'May Aksyon na / Nae-remediate', 'Naresolba na / Ligtas na', 'Walang Pagbabago']
const HEALTH = ['Malusog / Mabilis ang Paglaki', 'Bansot / Mabagal Lumaki', 'Inaatake ng Peste / Barnacles', 'Maraming Namatay']

interface TimelineData { report: Report; before_photo: string | null; after_photo: string | null; updates: ReportUpdate[]; status_history: ReportStatusHistoryEntry[] }

export default function MonitoringTimeline({ reportId }: { reportId: number; reportStatus?: string; onStatusChange?: (status: string) => void }) {
  const { user } = useAuth()
  const canAdd = !!user && ['field_worker', 'volunteer'].includes(user.role)
  const [data, setData] = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<'threat' | 'growth_monitoring'>('threat')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<File[]>([])
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [hasExifGps, setHasExifGps] = useState(false)
  const [locating, setLocating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: result } = await api.get(`/reports/${reportId}/timeline`)
      setData(result)
      setType(result.report.report_type === 'event_accomplishment' ? 'growth_monitoring' : 'threat')
    } catch { /* not visible to this user */ }
    finally { setLoading(false) }
  }, [reportId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#timeline') {
      setShowForm(true)
    }
  }, [])

  function setField(key: string, value: string) { setFields(current => ({ ...current, [key]: value })) }
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

  async function selectPhotos(list: FileList | null) {
    const selected = Array.from(list ?? [])
    if (selected.length < 1 || selected.length > 5 || selected.some(f => !f.type.startsWith('image/') || f.size > 10 * 1024 * 1024)) {
      toast.error('Choose 1–5 images, each 10 MB or smaller.'); return
    }
    setPhotos(selected)
    const locations = await Promise.all(selected.map(readJpegGps))
    const gps = locations.find((item): item is { lat: number; lng: number } => Boolean(item))
    setHasExifGps(Boolean(gps))
    setCoordinates(gps ?? null)
  }

  async function submitUpdate() {
    const required = type === 'threat' ? ['threat_status', 'area_trend', 'next_step'] : ['period', 'survival_rate', 'health']
    if (!photos.length || required.some(key => !fields[key])) { toast.error('Complete the required fields and add at least one photo.'); return }
    setSaving(true)
    try {
      const form = new FormData()
      form.append('type', type)
      Object.entries(fields).forEach(([key, value]) => form.append(`fields[${key}]`, value))
      if (coordinates) { form.append('latitude', String(coordinates.lat)); form.append('longitude', String(coordinates.lng)) }
      photos.forEach(photo => form.append('photos[]', photo))
      await api.post(`/reports/${reportId}/updates`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Update added to the report timeline.')
      setShowForm(false); setFields({}); setPhotos([]); setCoordinates(null); setHasExifGps(false)
      await load()
    } catch (e: any) { toast.error(e?.response?.data?.message ?? 'Failed to add update.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>
  if (!data) return <p className="text-sm text-gray-400 py-6 text-center">Monitoring timeline unavailable.</p>
  const isGrowth = data.report.report_type === 'event_accomplishment'
  const orderedUpdates = [...data.updates].sort((a, b) =>
    new Date(b.created_at || b.update_date).getTime() - new Date(a.created_at || a.update_date).getTime()
  )
  const timelineEntries = [
    ...data.status_history.map(entry => ({ kind: 'status' as const, entry, at: entry.created_at })),
    ...orderedUpdates.map(entry => ({ kind: 'update' as const, entry, at: entry.created_at || entry.update_date })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return <div className="space-y-5">
    <section>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Baseline vs latest update</p>
      <div className="grid grid-cols-2 gap-3">
        {[{ title: isGrowth ? 'Day 0 baseline' : 'Initial report', src: data.before_photo, date: data.report.created_at }, { title: 'Latest update', src: data.after_photo, date: data.updates[0]?.update_date }].map((item, i) => <figure key={i} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50"><div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">{item.src ? <img src={item.src} alt={item.title} className="w-full h-full object-cover" /> : <ImageOff className="w-6 h-6 text-gray-300" />}</div><figcaption className="px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide">{item.title}</p><p className="text-xs text-gray-500">{item.date ? formatDate(item.date) : 'No update photo yet'}</p></figcaption></figure>)}
      </div>
    </section>

    {canAdd && showForm && <section className="rounded-xl border border-primary-200 bg-primary-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between"><h4 className="font-bold">Add Update</h4><button onClick={() => setShowForm(false)} aria-label="Close update form"><X className="w-5 h-5" /></button></div>
      {isGrowth ? <>
        <label className="block text-sm font-medium">Monitoring Interval<select className="input mt-1" value={fields.period ?? ''} onChange={e => setField('period', e.target.value)}><option value="">Select period</option>{PERIODS.map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="block text-sm font-medium">Survival Rate Estimate (%)<input className="input mt-1" type="number" min="0" max="100" step="1" value={fields.survival_rate ?? ''} onChange={e => setField('survival_rate', e.target.value)} /></label>
        <label className="block text-sm font-medium">Average Plant Height in cm (optional)<input className="input mt-1" type="number" min="0" max="1000" step="0.1" value={fields.average_height ?? ''} onChange={e => setField('average_height', e.target.value)} placeholder="e.g. 45" /></label>
        <label className="block text-sm font-medium">Health &amp; Growth Condition<select className="input mt-1" value={fields.health ?? ''} onChange={e => setField('health', e.target.value)}><option value="">Choose condition</option>{HEALTH.map(h => <option key={h}>{h}</option>)}</select></label>
        <label className="block text-sm font-medium">Maintenance &amp; Field Remarks<textarea className="input mt-1" rows={3} value={fields.notes ?? ''} onChange={e => setField('notes', e.target.value)} /></label>
      </> : <>
        <fieldset><legend className="text-sm font-medium">Current Threat Status / Condition</legend>{THREATS.map(value => <label key={value} className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="threat-status" checked={fields.threat_status === value} onChange={() => setField('threat_status', value)} />{value}</label>)}</fieldset>
        <label className="block text-sm font-medium">Estimated Affected Area Trend<select className="input mt-1" value={fields.area_trend ?? ''} onChange={e => setField('area_trend', e.target.value)}><option value="">Select trend</option><option>Lumawak (Expanded)</option><option>Umiit (Reduced)</option><option>Pareho pa rin (Same)</option></select></label>
        <label className="block text-sm font-medium">Recommended Next Step for MENRO<select className="input mt-1" value={fields.next_step ?? ''} onChange={e => setField('next_step', e.target.value)}><option value="">Select next step</option><option>Kailangan ng Agarang Aksyon / Escalation</option><option>Ituloy ang Regular na Monitoring</option><option>Pwede nang Isara ang Kaso</option></select></label>
        <label className="block text-sm font-medium">Observed Changes / Field Notes<textarea className="input mt-1" rows={3} value={fields.notes ?? ''} onChange={e => setField('notes', e.target.value)} /></label>
      </>}
      <label className="block text-sm font-medium">Updated geotagged photos (1–5)<input type="file" multiple accept="image/*" className="input mt-1" onChange={e => selectPhotos(e.target.files)} /></label>
      {!hasExifGps && <div className="space-y-2"><p className="text-xs text-amber-800">⚠️ GPS location missing. Tap the map to pin the site or use current location (optional).</p><button type="button" className="btn-secondary min-h-10" onClick={useCurrentLocation} disabled={locating}>{locating ? 'Finding current location…' : 'Use current location'}</button><LocationPicker latitude={coordinates?.lat ?? null} longitude={coordinates?.lng ?? null} onChange={(lat, lng) => setCoordinates({ lat, lng })} /></div>}
      {photos.length > 0 && <p className="text-xs text-gray-600">{photos.length} photo(s) selected.</p>}
      <div className="flex gap-2"><button onClick={submitUpdate} disabled={saving} className="btn-primary min-h-11 flex-1 justify-center"><Check className="w-4 h-4" />{saving ? 'Saving…' : 'Save Update'}</button><button onClick={() => setShowForm(false)} disabled={saving} className="btn-secondary min-h-11"><X className="w-4 h-4" /></button></div>
    </section>}

    <section><p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Updates &amp; Progress Timeline</p><ol className="relative border-l-2 border-gray-100 ml-2 space-y-4">
      {timelineEntries.map((item, index) => item.kind === 'status' ? (
        <li key={`h-${item.entry.id}`} className="ml-4">
          <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-primary-400 border-2 border-white" />
          <div className="flex items-center gap-2 flex-wrap">
            {index === 0 && <span className="text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Latest</span>}
            <span className="text-xs text-gray-400">{formatDate(item.entry.created_at)}</span>
            <Badge label={item.entry.new_status} type="status" />
            {item.entry.changer && <span className="text-xs text-gray-400">by {item.entry.changer.name}</span>}
          </div>
          {item.entry.note && <p className="text-sm mt-1"><strong className="text-gray-700">MENRO Action Taken:</strong> {item.entry.note}</p>}
        </li>
      ) : (
        <li key={`u-${item.entry.id}`} className="ml-4">
          <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
          <div className="flex items-center gap-2 flex-wrap">
            {index === 0 && <span className="text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Latest</span>}
            <span className="text-xs text-gray-400">Update {orderedUpdates.length - orderedUpdates.indexOf(item.entry)} · {formatDate(item.entry.update_date)}</span>
            <Badge label={item.entry.type === 'growth_monitoring' ? 'Growth Monitoring' : 'Threat Update'} type="status" />
            {item.entry.updater && <span className="text-xs text-gray-400">by {item.entry.updater.name}</span>}
          </div>
          {(item.entry.fields?.threat_status || item.entry.fields?.health) && <p className="text-sm font-semibold mt-1">{item.entry.fields?.threat_status ?? item.entry.fields?.health}</p>}
          {item.entry.observation && <p className="text-sm mt-1">{item.entry.observation}</p>}
          {item.entry.latitude != null && item.entry.longitude != null && <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700"><MapPin className="w-3.5 h-3.5" />{item.entry.latitude.toFixed(6)}, {item.entry.longitude.toFixed(6)}</p>}
          <dl className="mt-1 text-xs text-gray-600 space-y-1">{Object.entries(item.entry.fields ?? {}).map(([key, value]) => <div key={key}><dt className="inline font-semibold capitalize">{key.replaceAll('_', ' ')}: </dt><dd className="inline">{String(value)}</dd></div>)}</dl>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {data.before_photo && <figure className="rounded-lg overflow-hidden border border-gray-100"><img src={data.before_photo} alt="Day 0 baseline" className="w-full aspect-square object-cover" /><figcaption className="px-2 py-1 text-[10px] font-semibold text-gray-500">Day 0 baseline</figcaption></figure>}
            {(item.entry.photos ?? []).map((photo: any, i: number) => <figure key={i} className="rounded-lg overflow-hidden border border-gray-100"><img src={photo.url} alt={`Update photo ${i + 1}`} className="w-full aspect-square object-cover" /><figcaption className="px-2 py-1 text-[10px] font-semibold text-gray-500">Update photo {i + 1}</figcaption></figure>)}
            {item.entry.image_url && !item.entry.photos?.length && <figure className="rounded-lg overflow-hidden border border-gray-100"><img src={item.entry.image_url} alt="Update photo" className="w-full aspect-square object-cover" /><figcaption className="px-2 py-1 text-[10px] font-semibold text-gray-500">Update photo</figcaption></figure>}
          </div>
        </li>
      ))}
      {!timelineEntries.length && <li className="ml-4 text-xs text-gray-400 flex items-center gap-2"><Clock className="w-4 h-4" />No monitoring activity yet.</li>}
    </ol></section>

    {canAdd && !showForm && <button onClick={() => setShowForm(true)} className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary-300 text-primary-600 font-semibold hover:bg-primary-50"><Plus className="w-4 h-4" />Add Update</button>}
  </div>
}
