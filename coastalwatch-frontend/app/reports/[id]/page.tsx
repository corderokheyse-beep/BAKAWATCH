'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Report } from '@/lib/types'
import { formatDate, CATEGORY_ICONS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { MapPin, Calendar, User, ArrowLeft, CheckCircle, XCircle, Leaf, Loader2, RefreshCw, Maximize2, X, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import MonitoringTimeline from '@/components/reports/MonitoringTimeline'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

// Confidence tier styling — same as the report form
function confidenceTier(pct: number) {
  if (pct >= 80) return { color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', label: 'High confidence' }
  if (pct >= 55) return { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200', label: 'Medium confidence' }
  return           { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Low confidence' }
}

export default function ReportDetailPage() {
  const { id }    = useParams()
  const router    = useRouter()
  const { user, isStaff, isMenro } = useAuth()
  const [report, setReport]       = useState<Report | null>(null)
  const [loading, setLoading]     = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [notes, setNotes]         = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [lightbox, setLightbox]       = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Derived after state declarations so `report` is in scope.
  const isOwner = !!user && !!report && user.id === (report as any).user_id
  const canAddUpdate = isStaff || (isOwner && ['field_worker', 'volunteer'].includes(user?.role ?? ''))
  const canViewTimeline = isMenro || isStaff || canAddUpdate

  useEffect(() => {
    api.get(`/reports/${id}`)
      .then(r => { setReport(r.data); setNotes(r.data.admin_notes ?? '') })
      .catch(() => router.push('/reports'))
      .finally(() => setLoading(false))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReview(status: 'pending' | 'under_review' | 'resolved') {
    if (!report) return
    setReviewing(true)
    try {
      const { data } = await api.patch(`/reports/${report.id}/review`, { status, action_taken: notes })
      setReport(data.report)
      toast.success(`Report marked as ${status.replace('_', ' ')}`)
    } catch {
      toast.error('Review failed')
    } finally {
      setReviewing(false)
    }
  }

  async function handleReanalyze() {
    if (!report) return
    setReanalyzing(true)
    try {
      const { data } = await api.post(`/reports/${report.id}/analyze`)
      setReport(prev => prev ? {
        ...prev,
        ml_species:    data.species,
        ml_confidence: data.confidence,
        ml_analyzed:   true,
      } : prev)
      toast.success('Analysis updated.')
    } catch {
      toast.error('Re-analysis failed. ML service may be unavailable.')
    } finally {
      setReanalyzing(false)
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file || !report) return
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return }

    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      // Laravel needs POST + _method=PUT for multipart file uploads on a PUT route.
      fd.append('_method', 'PUT')
      const { data } = await api.post(`/reports/${report.id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setReport(data.report)
      toast.success('Photo updated.')
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.image?.[0] ?? err?.response?.data?.message ?? 'Photo upload failed.'
      toast.error(msg)
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  if (loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>
  if (!report) return null

  const tier = report.ml_analyzed && report.ml_confidence != null
    ? confidenceTier(report.ml_confidence)
    : null

  // Owner may add/replace the photo while the report is still pending; staff always may.
  const canEditPhoto = isStaff || (user?.id === report.user_id && report.status === 'pending')

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to reports
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8">
          {/* ── Main content ─────────────────────────────────────────────── */}
          <div className="lg:col-span-8 space-y-6">
            {report.image_url && (
              <div className="card p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="relative w-full bg-gray-900/90 flex items-center justify-center cursor-zoom-in group"
                  style={{ minHeight: '18rem', maxHeight: '32rem' }}
                  title="Click to view full size"
                >
                  {/* Full image, never cropped */}
                  <img
                    src={report.image_url}
                    alt={report.title}
                    className="max-h-[32rem] w-auto max-w-full object-contain"
                  />
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[11px] font-medium text-white bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-3 h-3" /> View full size
                  </span>
                </button>
                {canEditPhoto && (
                  <div className="px-4 py-2.5 border-t border-gray-100 flex justify-end">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 cursor-pointer">
                      {uploadingPhoto
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                        : <><ImageIcon className="w-3.5 h-3.5" /> Replace photo</>}
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* No photo yet — let the owner (while pending) or staff add one */}
            {!report.image_url && canEditPhoto && (
              <label className="card flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors group">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-primary-100 flex items-center justify-center mb-2 transition-colors">
                  {uploadingPhoto
                    ? <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                    : <ImageIcon className="w-6 h-6 text-gray-400 group-hover:text-primary-500 transition-colors" />}
                </div>
                <span className="text-sm font-semibold text-gray-500 group-hover:text-primary-600 transition-colors">
                  {uploadingPhoto ? 'Uploading…' : 'Add a photo to this report'}
                </span>
                <span className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP, HEIC — max 10MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
              </label>
            )}

            <div className="card">
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge label={report.status} type="status" />
                <Badge label={report.report_type === 'event_accomplishment' ? 'Accomplishment Reports' : report.category} type="category" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">{report.title}</h1>
              <p className="text-gray-600 leading-relaxed">{report.description}</p>

              {report.admin_notes && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm font-medium text-blue-800 mb-1">MENRO Action Taken</p>
                  <p className="text-sm text-blue-700">{report.admin_notes}</p>
                </div>
              )}
            </div>

            {/* ── AI Species Detection panel ──────────────────────────────── */}
            {report.image_url && (
              <div className={cn(
                'rounded-xl border-2 p-4 space-y-3',
                tier ? cn(tier.bg, tier.border) : 'bg-gray-50 border-gray-200'
              )}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', tier?.bg ?? 'bg-gray-100')}>
                      <Leaf className={cn('w-4 h-4', tier?.color ?? 'text-gray-400')} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">AI Species Detection</p>
                      {report.ml_analyzed && report.ml_species ? (
                        <p className={cn('text-sm font-bold italic', tier?.color ?? 'text-gray-700')}>
                          {report.ml_species}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Not yet analyzed</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {report.ml_analyzed && report.ml_confidence != null && tier && (
                      <div className="text-right">
                        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border', tier.color, tier.bg, tier.border)}>
                          {report.ml_confidence.toFixed(1)}%
                        </span>
                        <p className={cn('text-[10px] mt-0.5', tier.color)}>{tier.label}</p>
                      </div>
                    )}
                    {/* Re-analyze button — staff/admin only */}
                    {isStaff && (
                      <button
                        onClick={handleReanalyze}
                        disabled={reanalyzing}
                        title="Re-run AI analysis"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-4 h-4', reanalyzing && 'animate-spin')} />
                      </button>
                    )}
                  </div>
                </div>

                {!report.ml_analyzed && (
                  <p className="text-xs text-gray-400">
                    {isStaff
                      ? 'Click the refresh icon to run AI species detection on this image.'
                      : 'AI analysis was not available when this report was submitted.'}
                  </p>
                )}
              </div>
            )}

            {/* Map */}
            {report.latitude != null && report.longitude != null && <div className="card p-0 overflow-hidden">
              <MapView
                reports={[report]}
                height="280px"
                center={[report.latitude, report.longitude]}
                zoom={14}
              />
            </div>}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────────────── */}
          <div className="lg:col-span-4 space-y-4">
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-800">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                  <span>{report.location_name ?? (report.latitude != null && report.longitude != null ? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}` : 'Location not recorded')}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>{formatDate(report.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{report.user?.name ?? 'Anonymous'}</span>
                </div>
                {report.reviewer && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle className="w-4 h-4 text-gray-400" />
                    <span>Reviewed by {report.reviewer.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Admin review panel */}
            {isMenro && (
              <div className="card space-y-3 border-orange-100 bg-orange-50">
                <h3 className="font-semibold text-orange-800">Official Action Taken</h3>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Notice of Violation issued on Nov 12, 2026. Visible to the reporting volunteer."
                  rows={3}
                  className="input text-sm resize-none"
                />
                <p className="text-xs text-orange-800">Choose a status to save it with your official action. You can post an action while keeping the current status.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => handleReview('pending')}
                    disabled={reviewing}
                    className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Pending
                  </button>
                  <button
                    onClick={() => handleReview('under_review')}
                    disabled={reviewing}
                    className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Under Review
                  </button>
                  <button onClick={() => handleReview('resolved')} disabled={reviewing} className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40"><CheckCircle className="w-4 h-4" /> Resolved</button>
                </div>
              </div>
            )}

            {/* Monitoring timeline — visible to the submitter and MENRO so they
                can add observation updates and follow-up photos after a site visit */}
          </div>
        </div>

        {canViewTimeline && (
          <div id="timeline" className="card mt-6 scroll-mt-24 p-5 sm:p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Monitoring Updates</h3>
            <MonitoringTimeline
              reportId={Number(id)}
              reportStatus={(report as any).status}
              onStatusChange={newStatus => setReport(r => r ? { ...r, status: newStatus as any } : r)}
            />
          </div>
        )}
      </div>

      {/* ── Full-screen image lightbox ──────────────────────────────────── */}
      {lightbox && report.image_url && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          {/* stopPropagation so clicking the image itself doesn't close it */}
          <img
            src={report.image_url}
            alt={report.title}
            className="max-h-[92vh] max-w-[92vw] w-auto h-auto object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </SidebarLayout>
  )
}
