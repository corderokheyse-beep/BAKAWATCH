'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitEcosystemRecord } from '@/lib/mangrove-api'
import type { RestorationSite } from '@/lib/types'
import { enqueueDraft, isNetworkError } from '@/lib/offline-queue'

const schema = z.object({
  restoration_site_id: z.number({ required_error: 'Select a site' }),
  measurement_date:    z.string().min(1),
  soil_salinity_ppt:   z.number().min(0, 'Must be >= 0'),
  water_ph:            z.number().min(0).max(14, 'pH must be 0-14'),
  water_temp_celsius:  z.number(),
  tidal_condition:     z.enum(['low', 'mid', 'high', 'storm']),
  latitude:            z.number().optional(),
  longitude:           z.number().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  sites: RestorationSite[]
  onSuccess: () => void
}

export default function EcosystemForm({ sites, onSuccess }: Props) {
  const [gpsError, setGpsError]     = useState('')
  const [gpsLoading, setGpsLoading] = useState(true)
  const [gpsLocated, setGpsLocated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const captureGPS = useCallback(() => {
    setGpsError('')
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setGpsError('GPS requires a secure HTTPS connection. Enter coordinates manually or use the deployed HTTPS site.')
      setGpsLoading(false)
      return
    }
    if (!navigator.geolocation) {
      setGpsError('Location services are unavailable in this browser.')
      setGpsLoading(false)
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitude',  pos.coords.latitude,  { shouldValidate: true })
        setValue('longitude', pos.coords.longitude, { shouldValidate: true })
        setGpsLocated(true)
        setGpsLoading(false)
      },
      (error) => {
        setGpsLocated(false)
        setGpsLoading(false)
        setGpsError(error.code === error.PERMISSION_DENIED
          ? 'Location permission is blocked. Allow access in browser settings, or enter coordinates manually.'
          : 'Could not determine your location. Turn on device location or enter coordinates manually.')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    )
  }, [setValue])

  useEffect(() => {
    captureGPS()
  }, [captureGPS])

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    setToast(null)
    try {
      await submitEcosystemRecord(values)
      setToast({ type: 'success', msg: 'Ecosystem record submitted!' })
      onSuccess()
    } catch (err: any) {
      if (isNetworkError(err)) {
        const fields: Record<string, string> = {}
        Object.entries(values).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') fields[k] = String(v)
        })
        try {
          await enqueueDraft({ kind: 'ecosystem', endpoint: '/ecosystem-records', fields })
          setToast({ type: 'success', msg: 'No connection — saved as a local draft. It will sync automatically when online. (Not yet verified.)' })
          onSuccess()
        } catch {
          setToast({ type: 'error', msg: 'Offline and unable to save a local draft on this device.' })
        }
      } else {
        setToast({ type: 'error', msg: 'Submission failed. Please try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {toast && (
        <div className={`p-3 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <label className="label">Restoration Site</label>
        <select className="input" {...register('restoration_site_id', { valueAsNumber: true })}>
          <option value="">Select a site…</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {errors.restoration_site_id && <p className="text-red-500 text-xs mt-1">{errors.restoration_site_id.message}</p>}
      </div>

      <div>
        <label className="label">Measurement Date</label>
        <input type="date" className="input" {...register('measurement_date')} />
        {errors.measurement_date && <p className="text-red-500 text-xs mt-1">{errors.measurement_date.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Soil Salinity (ppt)</label>
          <input type="number" step="0.1" min="0" className="input" {...register('soil_salinity_ppt', { valueAsNumber: true })} />
          {errors.soil_salinity_ppt && <p className="text-red-500 text-xs mt-1">{errors.soil_salinity_ppt.message}</p>}
        </div>
        <div>
          <label className="label">Water pH</label>
          <input type="number" step="0.1" min="0" max="14" className="input" {...register('water_ph', { valueAsNumber: true })} />
          {errors.water_ph && <p className="text-red-500 text-xs mt-1">{errors.water_ph.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Water Temp (°C)</label>
          <input type="number" step="0.1" className="input" {...register('water_temp_celsius', { valueAsNumber: true })} />
          {errors.water_temp_celsius && <p className="text-red-500 text-xs mt-1">{errors.water_temp_celsius.message}</p>}
        </div>
        <div>
          <label className="label">Tidal Condition</label>
          <select className="input" {...register('tidal_condition')}>
            <option value="low">Low</option>
            <option value="mid">Mid</option>
            <option value="high">High</option>
            <option value="storm">Storm</option>
          </select>
          {errors.tidal_condition && <p className="text-red-500 text-xs mt-1">{errors.tidal_condition.message}</p>}
        </div>
      </div>

      <div>
        <label className="label">Location (optional)</label>
        <button type="button" onClick={captureGPS} disabled={gpsLoading} className="btn-secondary text-sm mb-2">
          {gpsLoading ? 'Finding GPS location…' : gpsLocated ? 'Refresh GPS Location' : 'Capture GPS Location'}
        </button>
        {gpsError && <p role="status" className="text-amber-700 text-xs mb-2">{gpsError}</p>}
        {gpsLocated && <p className="text-green-700 text-xs mb-2">Current device location captured. You can adjust the coordinates below.</p>}
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="any" className="input" placeholder="Latitude" {...register('latitude', { valueAsNumber: true })} />
          <input type="number" step="any" className="input" placeholder="Longitude" {...register('longitude', { valueAsNumber: true })} />
        </div>
      </div>

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? 'Submitting…' : 'Submit Ecosystem Record'}
      </button>
    </form>
  )
}
