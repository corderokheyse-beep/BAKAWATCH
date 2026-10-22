'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import nextDynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { Upload, X, Leaf, HelpCircle, Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import PhotoCapture from '@/components/ui/PhotoCapture'

const LocationPicker = nextDynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <LoadingSpinner />,
})

const schema = z.object({
  title:         z.string().min(5, 'Title must be at least 5 characters'),
  description:   z.string().min(20, 'Description must be at least 20 characters'),
  category:      z.enum(['damage', 'restoration', 'wildlife', 'pollution', 'other']),
  threat_type:   z.enum(['damaged_tree', 'illegal_cutting', 'disease_pest', 'pollution', 'coastal_erosion', 'storm_damage', 'other']).optional(),
  location_name: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface MLPrediction {
  species: string
  probability: number
}

interface MLResult {
  species: string
  predicted_species?: string
  local_name: string
  family: string
  description: string
  confidence: number
  condition: string
  needs_verification?: boolean
  all_predictions: MLPrediction[]
}

// Confidence tier styling
function confidenceTier(pct: number): { label: string; color: string; bg: string; border: string } {
  if (pct >= 80) return { label: 'High confidence',   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300' }
  if (pct >= 55) return { label: 'Medium confidence', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300' }
  return           { label: 'Low confidence',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300' }
}

export default function NewReportPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const [lat, setLat]               = useState<number | null>(null)
  const [lng, setLng]               = useState<number | null>(null)
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [mlResult, setMlResult]     = useState<MLResult | null>(null)
  const [mlLoading, setMlLoading]   = useState(false)
  const [mlError, setMlError]       = useState(false)
  const [showAllPredictions, setShowAllPredictions] = useState(false)
  // Manual species selection — the reporter can confirm/override the AI guess.
  const [speciesOptions, setSpeciesOptions] = useState<{ scientific_name: string; local_name?: string | null }[]>([])
  const [manualSpecies, setManualSpecies]   = useState<string>('')

  // Load the managed species list for the manual override dropdown.
  useEffect(() => {
    api.get('/species')
      .then(({ data }) => {
        const list = (data?.data ?? data ?? []) as any[]
        setSpeciesOptions(list.map(s => ({ scientific_name: s.scientific_name, local_name: s.local_name })))
      })
      .catch(() => {})
  }, [])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'other' },
  })

  // Redirect unauthenticated users after render, not during
  useEffect(() => {
    if (!user) router.push('/login')
  }, [user, router])

  if (!user) return null

  // -- Image selection + instant ML species detection ----------------------------
  async function handleImage(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setMlResult(null)
    setMlError(false)
    setShowAllPredictions(false)
    setManualSpecies('')

    setMlLoading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      const { data } = await api.post('/reports/analyze-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const result: MLResult = {
        species:            data.species            ?? 'Unknown',
        predicted_species:  data.predicted_species  ?? data.species ?? 'Unknown',
        local_name:         data.local_name         ?? '',
        family:             data.family             ?? '',
        description:        data.description        ?? '',
        confidence:         data.confidence         ?? 0,
        condition:          data.condition          ?? 'Unknown',
        needs_verification: data.needs_verification ?? false,
        all_predictions:    data.all_predictions    ?? [],
      }
      setMlResult(result)
      // Pre-select the AI's confident guess; leave blank when uncertain so the
      // reporter is nudged to choose manually.
      if (!result.needs_verification && result.confidence >= 60) {
        setManualSpecies(result.predicted_species ?? '')
      }
    } catch {
      setMlError(true)
    } finally {
      setMlLoading(false)
    }
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setMlResult(null)
    setMlError(false)
    setShowAllPredictions(false)
    setManualSpecies('')
  }

  // -- Form submit ----------------------------------------------------------------
  async function onSubmit(data: FormData) {
    if (!lat || !lng) { toast.error('Please select a location on the map'); return }

    try {
      const formData = new FormData()
      Object.entries(data).forEach(([k, v]) => v && formData.append(k, String(v)))
      formData.append('latitude',  String(lat))
      formData.append('longitude', String(lng))
      if (imageFile) formData.append('image', imageFile)
      // The reporter's confirmed/overridden species (human-verified).
      if (manualSpecies) formData.append('human_verified_species', manualSpecies)

      await api.post('/reports', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Report submitted successfully!')
      router.push('/reports')
    } catch (err: any) {
      // Surface the specific validation reason (e.g. photo type/size) instead of a generic message.
      const data = err.response?.data
      const fieldError = data?.errors ? Object.values(data.errors).flat()[0] as string : null
      toast.error(fieldError ?? data?.message ?? 'Submission failed')
    }
  }

  const tier = mlResult ? confidenceTier(mlResult.confidence) : null

  return (
    <SidebarLayout>
      <div className="page-container">
        <h1 className="page-title mb-1">Submit a Report</h1>
        <p className="page-subtitle mb-5">
          Report mangrove observations in the field. Upload a photo and the AI will
          automatically identify the mangrove species.
        </p>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* === Left column: details + location =============================== */}
          <div className="space-y-6">

          {/* -- Report Details -------------------------------------------------- */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Report Details</h2>

            <div>
              <label className="label">Title *</label>
              <input {...register('title')} className="input"
                placeholder="Brief description of what you observed" />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="label">Category *</label>
              <select {...register('category')} className="input">
                <option value="damage">Damage</option>
                <option value="restoration">Restoration</option>
                <option value="wildlife">Wildlife</option>
                <option value="pollution">Pollution</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="label">Threat Type</label>
              <select {...register('threat_type')} className="input">
                <option value="">Select threat type (optional)</option>
                <option value="damaged_tree">Damaged mangrove tree</option>
                <option value="illegal_cutting">Illegal cutting</option>
                <option value="disease_pest">Disease or pest infestation</option>
                <option value="pollution">Pollution impact</option>
                <option value="coastal_erosion">Coastal erosion</option>
                <option value="storm_damage">Storm / typhoon damage</option>
                <option value="other">Other environmental threat</option>
              </select>
            </div>

            <div>
              <label className="label">Description *</label>
              <textarea {...register('description')} rows={4} className="input resize-none"
                placeholder="Describe what you observed in detail…" />
              {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
            </div>

            <div>
              <label className="label">Location name (optional)</label>
              <input {...register('location_name')} className="input"
                placeholder="e.g. Barangay Agsalin, Gloria, Oriental Mindoro" />
            </div>
          </div>

          {/* -- Location (left column) ----------------------------------------- */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-800">Location *</h2>
            <LocationPicker latitude={lat} longitude={lng}
              onChange={(la, lo) => { setLat(la); setLng(lo) }} />
          </div>

          </div>{/* === end left column === */}

          {/* === Right column: photo + AI species detection =================== */}
          <div className="space-y-6">

          {/* -- Photo + AI Species Detection ------------------------------------ */}
          <div className="card space-y-4">
            <div>
              <h2 className="font-semibold text-gray-800">Photo & Species Detection</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Upload a clear photo of the mangrove leaves or trunk. The AI will identify
                the species from 6 dominant Philippine mangrove species.
              </p>
            </div>

            {/* PhotoCapture: live camera or file upload */}
            <PhotoCapture
              onPhoto={handleImage}
              onClear={clearImage}
              preview={imagePreview}
              hint="JPG, PNG, WebP, HEIC — max 10MB"
              maxMB={10}
            />

            {/* Loading state */}
            {mlLoading && (
              <div className="flex items-center gap-3 p-4 bg-primary-50 rounded-xl border border-primary-200">
                <Loader2 className="w-5 h-5 text-primary-500 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-primary-800">Identifying species…</p>
                  <p className="text-xs text-primary-600">The AI is analysing the image</p>
                </div>
              </div>
            )}

                {/* Species result */}
                {mlResult && tier && (
                  <div className={cn('rounded-xl border-2 overflow-hidden', tier.bg, tier.border)}>

                    {/* Primary result */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tier.bg)}>
                            <Leaf className={cn('w-5 h-5', tier.color)} />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                              AI Species Detection
                            </p>
                            <p className={cn('text-base font-bold italic leading-tight', tier.color)}>
                              {mlResult.species}
                            </p>
                            {mlResult.local_name && (
                              <p className="text-xs text-gray-500 font-medium mt-0.5">
                                &ldquo;{mlResult.local_name}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn(
                            'inline-block text-xs font-bold px-2.5 py-1 rounded-full',
                            tier.color,
                            tier.bg,
                            'border',
                            tier.border,
                          )}>
                            {mlResult.confidence.toFixed(1)}%
                          </span>
                          <p className={cn('text-[10px] mt-0.5', tier.color)}>{tier.label}</p>
                        </div>
                      </div>

                      {/* Species details grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/70 rounded-lg p-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Family</p>
                          <p className="text-xs font-semibold text-gray-700">
                            {mlResult.family || '—'}
                          </p>
                        </div>
                        <div className="bg-white/70 rounded-lg p-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Local Name</p>
                          <p className="text-xs font-semibold text-gray-700">
                            {mlResult.local_name || '—'}
                          </p>
                        </div>
                      </div>

                      {/* Ecological description */}
                      {mlResult.description && (
                        <p className="text-xs text-gray-600 leading-relaxed bg-white/60 rounded-lg p-2.5">
                          {mlResult.description}
                        </p>
                      )}
                    </div>

                    {/* All predictions toggle */}
                    {mlResult.all_predictions.length > 1 && (
                      <div className="border-t border-white/50">
                        <button
                          type="button"
                          onClick={() => setShowAllPredictions(v => !v)}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold transition-colors',
                            tier.color, 'hover:bg-white/30'
                          )}
                        >
                          <span>All species probabilities</span>
                          {showAllPredictions
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {showAllPredictions && (
                          <div className="px-4 pb-3 space-y-1.5">
                            {mlResult.all_predictions.map((p, i) => (
                              <div key={p.species} className="flex items-center gap-2">
                                <span className={cn(
                                  'text-[10px] font-bold w-4 text-right shrink-0',
                                  i === 0 ? tier.color : 'text-gray-400'
                                )}>
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={cn(
                                      'text-xs truncate',
                                      i === 0 ? cn('font-bold italic', tier.color) : 'text-gray-500 italic'
                                    )}>
                                      {p.species}
                                    </span>
                                    <span className={cn(
                                      'text-[10px] font-bold ml-2 shrink-0',
                                      i === 0 ? tier.color : 'text-gray-400'
                                    )}>
                                      {p.probability.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-white/50 rounded-full h-1 overflow-hidden">
                                    <div
                                      className={cn('h-1 rounded-full transition-all', i === 0 ? 'bg-current' : 'bg-gray-300')}
                                      style={{ width: `${p.probability}%`, color: 'inherit' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="px-4 py-2 border-t border-white/40">
                      <p className="text-[10px] text-gray-400">
                        AI identification is a guide only. Results are saved with your report for admin review.
                      </p>
                    </div>
                  </div>
                )}

                {/* Low-confidence warning */}
                {mlResult && mlResult.needs_verification && (
                  <div className="flex items-start gap-2.5 p-3 bg-orange-50 rounded-xl border border-orange-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-orange-500 mt-0.5" />
                    <div className="text-xs text-orange-800">
                      <p className="font-semibold">The AI isn&rsquo;t confident about this photo.</p>
                      <p className="mt-0.5 text-orange-700">
                        Its best guess was <span className="italic">{mlResult.predicted_species}</span> ({mlResult.confidence.toFixed(1)}%).
                        Please select the correct species below, or leave it for MENRO to verify.
                      </p>
                    </div>
                  </div>
                )}

                {/* Manual species selection — confirm or override the AI */}
                {mlResult && (
                  <div className={cn(
                    'rounded-xl border p-3.5 space-y-2',
                    manualSpecies ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                  )}>
                    <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                      <Leaf className="w-3.5 h-3.5 text-primary-500" />
                      Confirm Species
                      {manualSpecies && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                    </label>
                    <select
                      value={manualSpecies}
                      onChange={e => setManualSpecies(e.target.value)}
                      className="input w-full text-sm"
                    >
                      <option value="">— Not sure / let MENRO verify —</option>
                      {speciesOptions.map(s => (
                        <option key={s.scientific_name} value={s.scientific_name}>
                          {s.scientific_name}{s.local_name ? ` (${s.local_name})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400">
                      Your selection is saved as the reporter-confirmed species. MENRO still reviews it.
                    </p>
                  </div>
                )}

                {/* ML unavailable */}
                {mlError && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
                    <HelpCircle className="w-4 h-4 shrink-0 text-gray-400" />
                    Species detection unavailable — the report will still be submitted normally.
                  </div>
                )}

          </div>

          </div>{/* === end right column === */}
          </div>{/* === end grid === */}

          {/* -- Sticky actions -------------------------------------------------- */}
          <div className="sticky bottom-0 mt-6 py-3 bg-gradient-to-t from-white via-white to-transparent">
            <div className="flex gap-3 max-w-md ml-auto">
              <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                {isSubmitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </SidebarLayout>
  )
}
