'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitPlantationRecord, fetchSpecies } from '@/lib/mangrove-api'
import type { RestorationSite, MangroveSpecies } from '@/lib/types'
import { enqueueDraft, isNetworkError } from '@/lib/offline-queue'
import { SEEDLING_SOURCES } from '@/lib/constants'
import { MapPin, Loader2, CheckCircle2 } from 'lucide-react'
import PhotoCapture from '@/components/ui/PhotoCapture'

// Fallback list used only if the species reference API is unreachable.
const FALLBACK_SPECIES = [
  'Rhizophora mucronata',
  'Rhizophora apiculata',
  'Avicennia marina',
  'Avicennia officinalis',
  'Bruguiera gymnorrhiza',
  'Ceriops tagal',
  'Sonneratia alba',
  'Xylocarpus granatum',
  'Lumnitzera racemosa',
  'Nypa fruticans',
]

const schema = z.object({
  restoration_site_id: z.coerce.number({ required_error: 'Select a site' }).positive('Select a site'),
  species_name:        z.string().min(2, 'Species name required'),
  date_planted:        z.string().min(1, 'Date required'),
  time_planted:        z.string().optional(),
  seedling_source:     z.string().min(1, 'Seedling source is required'),
  latitude:            z.coerce.number({ required_error: 'Location required' }).min(-90).max(90),
  longitude:           z.coerce.number({ required_error: 'Location required' }).min(-180).max(180),
  is_replacement:      z.boolean().optional(),
  geo_override_reason: z.string().optional(),
  notes:               z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  sites: RestorationSite[]
  onSuccess: () => void
}

export default function PlantationForm({ sites, onSuccess }: Props) {
  const [gpsStatus, setGpsStatus]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [gpsError, setGpsError]     = useState('')
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  // 'gps' when captured from device, 'manual' once the user edits a coordinate by hand
  const [gpsSource, setGpsSource]   = useState<'gps' | 'manual'>('gps')
  const [photoFile, setPhotoFile]   = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toastMsg, setToastMsg]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [speciesRef, setSpeciesRef] = useState<MangroveSpecies[]>([])
  const [speciesNames, setSpeciesNames] = useState<string[]>(FALLBACK_SPECIES)
  const speciersRef = useRef<HTMLDivElement>(null)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date_planted: new Date().toISOString().split('T')[0],
      time_planted: new Date().toTimeString().slice(0, 5),
    },
  })

  // Auto-capture GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    setGpsStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitude',  pos.coords.latitude,  { shouldValidate: true })
        setValue('longitude', pos.coords.longitude, { shouldValidate: true })
        setGpsAccuracy(pos.coords.accuracy ?? null)
        setGpsSource('gps')
        setGpsStatus('ok')
      },
      () => {
        setGpsStatus('error')
        setGpsError('Auto-location failed — enter coordinates manually or click the button.')
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }, [setValue])

  // Load the managed species reference (falls back to the static list on error)
  useEffect(() => {
    fetchSpecies()
      .then(list => {
        if (list.length) {
          setSpeciesRef(list)
          setSpeciesNames(list.map(s => s.scientific_name))
        }
      })
      .catch(() => {/* keep fallback */})
  }, [])

  const captureGPS = () => {
    setGpsError('')
    setGpsStatus('loading')
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device')
      setGpsStatus('error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitude',  pos.coords.latitude,  { shouldValidate: true })
        setValue('longitude', pos.coords.longitude, { shouldValidate: true })
        setGpsAccuracy(pos.coords.accuracy ?? null)
        setGpsSource('gps')
        setGpsStatus('ok')
      },
      () => {
        setGpsError('Unable to retrieve location. Enable location permissions.')
        setGpsStatus('error')
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }


  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    setToastMsg(null)

    // Build a serializable field map — reused for both the online FormData and
    // the offline draft so a queued record syncs identically later.
    const datePlanted = values.time_planted
      ? `${values.date_planted} ${values.time_planted}:00`
      : values.date_planted
    const fields: Record<string, string> = {
      restoration_site_id: String(values.restoration_site_id),
      species_name:        values.species_name,
      date_planted:        datePlanted,
      latitude:            String(values.latitude),
      longitude:           String(values.longitude),
      gps_source:          gpsSource,
    }
    if (values.seedling_source)          fields.seedling_source = values.seedling_source
    if (values.notes)                    fields.notes = values.notes
    if (gpsAccuracy != null)             fields.gps_accuracy_m = String(Math.round(gpsAccuracy))
    if (values.is_replacement)           fields.is_replacement = '1'
    if (values.geo_override_reason?.trim()) fields.geo_override_reason = values.geo_override_reason.trim()

    try {
      const fd = new FormData()
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
      if (photoFile) fd.append('image', photoFile)

      const res: any = await submitPlantationRecord(fd)
      // Backend returns { record, geo_mismatch, warning } — surface any boundary warning
      if (res?.warning) {
        setToastMsg({ type: 'success', msg: `Submitted. ${res.warning}` })
      } else {
        setToastMsg({ type: 'success', msg: 'Plantation record submitted successfully!' })
      }
      onSuccess()
    } catch (err: any) {
      // Offline / network failure → save as a local draft and sync later.
      if (isNetworkError(err)) {
        try {
          await enqueueDraft({
            kind: 'plantation',
            endpoint: '/plantation-records',
            fields,
            image: photoFile,
            imageName: photoFile?.name ?? null,
          })
          setToastMsg({
            type: 'success',
            msg: 'No connection — saved as a local draft. It will sync automatically when you are back online. (Not yet verified.)',
          })
          // Delay redirect so the user can read the offline warning
          setTimeout(() => onSuccess(), 2500)
        } catch {
          setToastMsg({ type: 'error', msg: 'Offline and unable to save a local draft on this device.' })
        }
      } else {
        const msg = err?.response?.data?.message
          ?? Object.values(err?.response?.data?.errors ?? {}).flat().join(' ')
          ?? 'Submission failed. Please try again.'
        setToastMsg({ type: 'error', msg: String(msg) })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {toastMsg && (
        <div className={`p-3 rounded-xl text-sm flex items-start gap-2 ${toastMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : '⚠️'}
          {toastMsg.msg}
        </div>
      )}

      {/* Site + Species — two columns on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Restoration Site *</label>
          <select className="input" {...register('restoration_site_id', { valueAsNumber: true })} defaultValue="">
            <option value="" disabled>Select a site…</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {errors.restoration_site_id && <p className="err-msg">{errors.restoration_site_id.message}</p>}
        </div>

        <div className="relative" ref={speciersRef}>
          <label className="label">Species Name *</label>
          <select className="input" {...register('species_name')} defaultValue="">
            <option value="" disabled>Select a species…</option>
            {speciesNames.map(s => {
              const ref = speciesRef.find(r => r.scientific_name === s)
              return (
                <option key={s} value={s}>
                  {s}{ref?.local_name ? ` — ${ref.local_name}` : ''}
                </option>
              )
            })}
          </select>
          {errors.species_name && <p className="err-msg">{errors.species_name.message}</p>}
        </div>
      </div>

      {/* Date + Time + Seedling source — three columns on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="label">Date Planted *</label>
          <input type="date" className="input" {...register('date_planted')} />
          {errors.date_planted && <p className="err-msg">{errors.date_planted.message}</p>}
        </div>
        <div>
          <label className="label">Time Planted</label>
          <input type="time" className="input" {...register('time_planted')} />
          <p className="text-xs text-gray-400 mt-1">Optional</p>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label">Seedling Source *</label>
          <select className="input" {...register('seedling_source')} defaultValue="">
            <option value="" disabled>Select seedling source</option>
            {SEEDLING_SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
          </select>
          {errors.seedling_source && <p className="err-msg">{errors.seedling_source.message}</p>}
        </div>
      </div>

      {/* GPS auto-fill location */}
      <div>
        <label className="label">GPS Location *</label>
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={captureGPS}
            disabled={gpsStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            {gpsStatus === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Detecting…</>
            ) : gpsStatus === 'ok' ? (
              <><CheckCircle2 className="w-4 h-4 text-green-600" /> GPS Captured</>
            ) : (
              <><MapPin className="w-4 h-4" /> Re-capture GPS</>
            )}
          </button>
          {gpsStatus === 'loading' && (
            <span className="text-xs text-gray-400 animate-pulse">Requesting device location…</span>
          )}
          {gpsStatus === 'ok' && (
            <span className="text-xs text-green-600 font-medium">Location auto-filled ✓</span>
          )}
        </div>
        {gpsError && <p className="err-msg mb-2">{gpsError}</p>}
        {gpsSource === 'gps' && gpsAccuracy != null && (
          <p className="text-xs text-gray-500 mb-1">GPS accuracy: ±{Math.round(gpsAccuracy)} m</p>
        )}
        {gpsSource === 'manual' && (
          <p className="text-xs text-amber-600 mb-1">Coordinates entered manually — will be marked for verification.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input type="number" step="any" className="input" placeholder="Latitude"
              {...register('latitude', { valueAsNumber: true, onChange: () => setGpsSource('manual') })} />
            {errors.latitude && <p className="err-msg">{errors.latitude.message}</p>}
          </div>
          <div>
            <input type="number" step="any" className="input" placeholder="Longitude"
              {...register('longitude', { valueAsNumber: true, onChange: () => setGpsSource('manual') })} />
            {errors.longitude && <p className="err-msg">{errors.longitude.message}</p>}
          </div>
        </div>
      </div>

      {/* Replacement cohort */}
      <div className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <input type="checkbox" id="is_replacement" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600"
          {...register('is_replacement')} />
        <label htmlFor="is_replacement" className="text-sm text-gray-700">
          This is a <strong>replacement</strong> planting
          <span className="block text-xs text-gray-400">Replacement seedlings are tracked separately from the original cohort in survival-rate calculations.</span>
        </label>
      </div>

      {/* Optional out-of-boundary override reason */}
      <div>
        <label className="label">Out-of-boundary reason (optional)</label>
        <textarea className="input" rows={2}
          placeholder="If this location is outside the site boundary (e.g. GPS drift, boundary not yet mapped), explain why. It will be recorded and flagged for review."
          {...register('geo_override_reason')} />
        <p className="text-xs text-gray-400 mt-1">Off-boundary records are never rejected — they are accepted and flagged for a reviewer.</p>
      </div>

      {/* Photo */}
      {/* Photo — live capture or gallery upload */}
      <div>
        <label className="label">Photo (optional)</label>
        <PhotoCapture
          onPhoto={file => {
            setPhotoFile(file)
            setPhotoPreview(URL.createObjectURL(file))
            setPhotoError('')
          }}
          onClear={() => {
            setPhotoFile(null)
            setPhotoPreview(null)
            setPhotoError('')
          }}
          preview={photoPreview}
          hint="JPG, PNG, WebP, HEIC — max 5 MB"
          maxMB={5}
        />
        {photoError && <p className="err-msg mt-1">{photoError}</p>}
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes (optional)</label>
        <textarea className="input" rows={2} placeholder="Observations, soil conditions, weather…" {...register('notes')} />
      </div>

      {/* Sticky action bar — always reachable without scrolling to the end */}
      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 bg-white/95 backdrop-blur border-t border-gray-100 rounded-b-2xl">
        <button type="submit" disabled={submitting} className="btn-primary w-full justify-center gap-2">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Plantation Record'}
        </button>
      </div>
    </form>
  )
}
