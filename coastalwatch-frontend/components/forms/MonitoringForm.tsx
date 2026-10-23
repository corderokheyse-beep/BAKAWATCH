'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitMonitoringRecord } from '@/lib/mangrove-api'
import type { PlantationRecord } from '@/lib/types'
import { enqueueDraft, isNetworkError } from '@/lib/offline-queue'
import { MapPin, Loader2, CheckCircle2, ClipboardList } from 'lucide-react'

const schema = z.object({
  plantation_record_id: z.number({
    required_error: 'Select a plantation record',
    invalid_type_error: 'Select a plantation record',
  }).int().positive('Select a plantation record'),
  monitoring_date:      z.string().min(1),
  height_cm:            z.number().min(0, 'Must be >= 0'),
  diameter_cm:          z.number().min(0, 'Must be >= 0'),
  survival_status:      z.enum(['alive', 'dead']),
  growth_stage:         z.enum(['seedling', 'sapling', 'juvenile', 'mature']),
  disease_observation:  z.string().optional(),
  latitude:             z.number({ required_error: 'Location required' }),
  longitude:            z.number({ required_error: 'Location required' }),
})

type FormValues = z.infer<typeof schema>

interface Props {
  plantationRecords: PlantationRecord[]
  preselectedId?: number | null
  onSuccess: (plantationRecordId?: number) => void
}

export default function MonitoringForm({ plantationRecords, preselectedId, onSuccess }: Props) {
  const [gpsStatus, setGpsStatus]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [gpsError, setGpsError]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toastMsg, setToastMsg]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      monitoring_date: new Date().toISOString().split('T')[0],
      survival_status: 'alive',
      growth_stage:    'seedling',
      ...(preselectedId ? { plantation_record_id: preselectedId } : {}),
    },
  })

  const selectedPlantationId = watch('plantation_record_id')

  // Auto-capture GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    setGpsStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitude',  pos.coords.latitude)
        setValue('longitude', pos.coords.longitude)
        setGpsStatus('ok')
      },
      () => setGpsStatus('error'),
      { timeout: 8000, enableHighAccuracy: true }
    )
  }, [setValue])

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
        setValue('latitude',  pos.coords.latitude)
        setValue('longitude', pos.coords.longitude)
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
    try {
      await submitMonitoringRecord(values)
      setToastMsg({ type: 'success', msg: 'Monitoring record submitted!' })
      onSuccess(values.plantation_record_id)
    } catch (err: any) {
      if (isNetworkError(err)) {
        const fields: Record<string, string> = {}
        Object.entries(values).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') fields[k] = String(v)
        })
        try {
          await enqueueDraft({ kind: 'monitoring', endpoint: '/monitoring-records', fields })
          setToastMsg({ type: 'success', msg: 'No connection — saved as a local draft. It will sync automatically when online. (Not yet verified.)' })
          // Delay redirect so the user can read the offline warning
          setTimeout(() => onSuccess(values.plantation_record_id), 2500)
        } catch {
          setToastMsg({ type: 'error', msg: 'Offline and unable to save a local draft on this device.' })
        }
      } else {
        setToastMsg({ type: 'error', msg: 'Submission failed. Please try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {toastMsg && (
        <div className={`p-3 rounded-xl text-sm flex items-start gap-2 ${toastMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : '⚠️'}
          {toastMsg.msg}
        </div>
      )}

      <div>
        <label className="label">Plantation Record *</label>
        <select className="input" {...register('plantation_record_id', {
          setValueAs: value => value === '' ? undefined : Number(value),
        })}>
          <option value="">Select a plantation record…</option>
          {plantationRecords.map(r => (
            <option key={r.id} value={r.id}>
              #{r.id} — {r.species_name} (planted {r.date_planted})
            </option>
          ))}
        </select>
        {errors.plantation_record_id && <p className="err-msg">{errors.plantation_record_id.message}</p>}
        {selectedPlantationId > 0 && (
          <a
            href={`/plantation/${selectedPlantationId}`}
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline transition-colors"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            View previous monitoring records for this tree
          </a>
        )}
      </div>

      <div>
        <label className="label">Monitoring Date *</label>
        <input type="date" className="input" {...register('monitoring_date')} />
        {errors.monitoring_date && <p className="err-msg">{errors.monitoring_date.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Height (cm) *</label>
          <input type="number" step="0.1" min="0" className="input" placeholder="e.g. 45.5" {...register('height_cm', { valueAsNumber: true })} />
          {errors.height_cm && <p className="err-msg">{errors.height_cm.message}</p>}
        </div>
        <div>
          <label className="label">Diameter (cm) *</label>
          <input type="number" step="0.1" min="0" className="input" placeholder="e.g. 2.3" {...register('diameter_cm', { valueAsNumber: true })} />
          {errors.diameter_cm && <p className="err-msg">{errors.diameter_cm.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Survival Status *</label>
          <select className="input" {...register('survival_status')}>
            <option value="alive">✅ Alive</option>
            <option value="dead">❌ Dead</option>
          </select>
        </div>
        <div>
          <label className="label">Growth Stage *</label>
          <select className="input" {...register('growth_stage')}>
            <option value="seedling">🌱 Seedling</option>
            <option value="sapling">🌿 Sapling</option>
            <option value="juvenile">🌳 Juvenile</option>
            <option value="mature">🌲 Mature</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Disease / Damage Observation</label>
        <textarea className="input" rows={2} placeholder="Describe any disease, pest damage, or unusual condition…" {...register('disease_observation')} />
      </div>

      {/* GPS auto-fill */}
      <div>
        <label className="label">GPS Location *</label>
        <div className="flex items-center gap-3 mb-2">
          <button type="button" onClick={captureGPS} disabled={gpsStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            {gpsStatus === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Detecting…</>
            ) : gpsStatus === 'ok' ? (
              <><CheckCircle2 className="w-4 h-4 text-green-600" /> GPS Captured</>
            ) : (
              <><MapPin className="w-4 h-4" /> Re-capture GPS</>
            )}
          </button>
          {gpsStatus === 'ok' && <span className="text-xs text-green-600 font-medium">Location auto-filled ✓</span>}
        </div>
        {gpsError && <p className="err-msg mb-2">{gpsError}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input type="number" step="any" className="input" placeholder="Latitude" {...register('latitude', { valueAsNumber: true })} />
            {errors.latitude && <p className="err-msg">{errors.latitude.message}</p>}
          </div>
          <div>
            <input type="number" step="any" className="input" placeholder="Longitude" {...register('longitude', { valueAsNumber: true })} />
            {errors.longitude && <p className="err-msg">{errors.longitude.message}</p>}
          </div>
        </div>
      </div>

      <button type="submit" disabled={submitting} className="btn-primary w-full justify-center gap-2">
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Monitoring Record'}
      </button>
    </form>
  )
}
