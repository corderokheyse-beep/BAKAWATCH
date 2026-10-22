'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import type { Report, PaginatedResponse, ReportCategory, ReportStatus } from '@/lib/types'
import { formatDate, CATEGORY_ICONS } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  AlertTriangle, Search, MapPin, Calendar as CalendarIcon,
  X, CheckCircle, XCircle, Clock, Eye, Filter, RefreshCw,
  User, FileText, Loader2, ChevronDown, ShieldCheck,
  Brain, Check, Pencil, Ban,
} from 'lucide-react'
import { fetchSpecies } from '@/lib/mangrove-api'
import type { MangroveSpecies } from '@/lib/types'

// â”€â”€â”€ Status config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:           { label: 'Pending',           color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: <Clock className="w-3.5 h-3.5" /> },
  under_review:      { label: 'Under Review',       color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: <Eye className="w-3.5 h-3.5" /> },
  resolved:          { label: 'Resolved',           color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     icon: <ShieldCheck className="w-3.5 h-3.5" /> },
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border', cfg.color, cfg.bg)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ─── AI species classification + human verification ───────────────────────────
function SpeciesVerification({ report, onUpdated }: { report: Report; onUpdated: (r: Report) => void }) {
  const [species, setSpecies] = useState<MangroveSpecies[]>([])
  const [correctedSpecies, setCorrectedSpecies] = useState(report.human_verified_species ?? report.ml_species ?? '')
  const [notes, setNotes] = useState(report.verification_notes ?? '')
  const [mode, setMode] = useState<'confirmed' | 'corrected' | 'rejected' | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchSpecies().then(setSpecies).catch(() => {}) }, [])

  const vstatus = report.verification_status ?? 'unverified'
  // ml_confidence is stored 0–100 already
  const confidence = report.ml_confidence != null ? Math.round(report.ml_confidence) : null

  let predictions: { species: string; probability: number }[] = []
  try { if (report.ml_all_predictions) predictions = JSON.parse(report.ml_all_predictions) } catch {}

  async function save(status: 'confirmed' | 'corrected' | 'rejected') {
    setSaving(true)
    try {
      const { data } = await api.patch(`/reports/${report.id}/verify-species`, {
        verification_status: status,
        human_verified_species: status === 'corrected' ? correctedSpecies : undefined,
        verification_notes: notes || undefined,
      })
      toast.success('Species verification saved.')
      onUpdated(data.report)
      setMode(null)
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to save verification.')
    } finally {
      setSaving(false)
    }
  }

  const statusBadge: Record<string, { label: string; cls: string }> = {
    unverified: { label: 'Unverified AI guess', cls: 'bg-gray-100 text-gray-600' },
    confirmed:  { label: 'Confirmed by reviewer', cls: 'bg-green-100 text-green-700' },
    corrected:  { label: 'Corrected by reviewer', cls: 'bg-amber-100 text-amber-700' },
    rejected:   { label: 'Rejected by reviewer', cls: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Species Classification
        </p>
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusBadge[vstatus].cls)}>
          {statusBadge[vstatus].label}
        </span>
      </div>

      {/* AI prediction (never treated as confirmed) */}
      <div className="text-sm">
        <p className="text-gray-700">
          <span className="text-gray-400">AI predicts:</span>{' '}
          <span className="italic font-medium">{report.ml_species ?? 'Unknown'}</span>
          {confidence != null && <span className="text-gray-400"> · {confidence}% confidence</span>}
        </p>
        {report.ml_model_version && (
          <p className="text-[11px] text-gray-400 mt-0.5">Model: {report.ml_model_version}</p>
        )}
        <p className="text-[11px] text-amber-600 mt-1">
          AI predictions are not confirmed identifications. A reviewer must verify the species.
        </p>
      </div>

      {predictions.length > 1 && (
        <div className="text-xs text-gray-500">
          <span className="font-semibold">Alternatives:</span>{' '}
          {predictions.slice(1, 4).map(p => `${p.species} (${Math.round(p.probability)}%)`).join(', ')}
        </div>
      )}

      {/* Verified result */}
      {vstatus !== 'unverified' && (
        <div className="text-sm rounded-lg bg-white border border-gray-100 px-3 py-2">
          <span className="text-gray-400">Verified species:</span>{' '}
          <span className="italic font-semibold text-gray-800">
            {report.human_verified_species ?? (vstatus === 'rejected' ? '— (AI classification rejected)' : '—')}
          </span>
          {report.verifier?.name && <span className="text-xs text-gray-400"> · by {report.verifier.name}</span>}
        </div>
      )}

      {/* Reviewer actions */}
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save('confirmed')} disabled={saving || !report.ml_species}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            <Check className="w-3.5 h-3.5" /> Confirm AI
          </button>
          <button type="button" onClick={() => setMode('corrected')} disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
            <Pencil className="w-3.5 h-3.5" /> Correct
          </button>
          <button type="button" onClick={() => save('rejected')} disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
            <Ban className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      ) : mode === 'corrected' ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500">Correct species</label>
          <input list="species-list" className="input" value={correctedSpecies}
            onChange={e => setCorrectedSpecies(e.target.value)} placeholder="Scientific name" />
          <datalist id="species-list">
            {species.map(s => <option key={s.id} value={s.scientific_name}>{s.local_name}</option>)}
          </datalist>
          <textarea className="input" rows={2} placeholder="Verification notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" onClick={() => save('corrected')} disabled={saving || !correctedSpecies.trim()}
              className="btn-primary text-xs gap-1.5 py-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save correction
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// â”€â”€â”€ Review Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ReviewModalProps {
  report: Report
  onClose: () => void
  onUpdated: (updated: Report) => void
}

function ReviewModal({ report, onClose, onUpdated }: ReviewModalProps) {
  const [status, setStatus]     = useState<ReportStatus>(report.status)
  const [notes, setNotes]       = useState(report.admin_notes ?? '')
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const { data } = await api.patch(`/reports/${report.id}/review`, {
        status,
        action_taken: notes || null,
      })
      toast.success(`Report marked as ${status}.`)
      onUpdated(data.report)
      onClose()
    } catch {
      toast.error('Failed to update report status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-bold text-gray-900 truncate">{report.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={report.status} />
              <span className="text-xs text-gray-400">#{report.id}</span>
              <span className="text-xs text-gray-400">Â·</span>
              <span className="text-xs text-gray-500">{report.report_type === 'event_accomplishment' ? 'Accomplishment Report' : report.category}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Report image */}
          {report.image_url && (
            <div className="relative h-52 w-full rounded-xl overflow-hidden bg-gray-100">
              <img src={report.image_url} alt={report.title} className="absolute inset-0 w-full h-full object-cover" />
            </div>
          )}

          {/* Report details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted by</p>
              <p className="flex items-center gap-1.5 text-gray-700 font-medium">
                <User className="w-3.5 h-3.5 text-gray-400" />
                {report.user?.name ?? 'Unknown'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Location</p>
              <p className="flex items-center gap-1.5 text-gray-700">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                {report.location_name ?? `${report.latitude?.toFixed(4)}, ${report.longitude?.toFixed(4)}`}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Submitted</p>
              <p className="flex items-center gap-1.5 text-gray-700">
                <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                {formatDate(report.created_at)}
              </p>
            </div>
          </div>

          {/* AI species classification + human verification */}
          {report.ml_analyzed && (
            <SpeciesVerification report={report} onUpdated={onUpdated} />
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-3">{report.description}</p>
          </div>
          {report.event_accomplishment && (
            <section className="rounded-xl border border-green-100 bg-green-50/50 p-4 space-y-2">
              <h3 className="font-bold text-green-900">Event Accomplishment Report · Day 0</h3>
              <p className="text-sm">{report.event_accomplishment.event?.name} · {report.event_accomplishment.event?.scheduled_at ? formatDate(report.event_accomplishment.event.scheduled_at) : ''}</p>
              <p className="text-sm">Reporter: {report.user?.name} ({report.user?.role === 'field_worker' ? 'Bantay Bakawan' : report.user?.role}) · Site: {report.event_accomplishment.site?.name}</p>
              <p className="text-sm">{report.event_accomplishment.species_name} · {report.event_accomplishment.seedlings_planted} seedlings · {report.event_accomplishment.volunteers_present} volunteers present</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{report.event_accomplishment.photos.map((photo, i) => <img key={i} src={photo.url} alt={`Day 0 photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />)}</div>
            </section>
          )}
          {(report.updates?.length ?? 0) > 0 && <section className="space-y-2"><h3 className="font-bold">Photo History</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{report.image_url && <figure><img src={report.image_url} alt="Report baseline" className="aspect-square w-full rounded-lg object-cover" /><figcaption className="text-xs">Baseline</figcaption></figure>}{report.updates?.map(update => update.image_url && <figure key={update.id}><img src={update.image_url} alt="Follow-up update" className="aspect-square w-full rounded-lg object-cover" /><figcaption className="text-xs">{formatDate(update.update_date)}</figcaption></figure>)}</div></section>}

          {/* Status selector */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">MENRO Report Status</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(STATUS_CONFIG) as [ReportStatus, typeof STATUS_CONFIG[ReportStatus]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setStatus(key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
                    status === key
                      ? cn(cfg.color, cfg.bg, 'ring-2 ring-offset-1', key === 'pending' ? 'ring-amber-400' : key === 'under_review' ? 'ring-blue-400' : 'ring-teal-400')
                      : 'text-gray-600 bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  {cfg.icon}
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Admin notes */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">
              Admin Notes <span className="text-gray-300 font-normal normal-case">(optional â€” visible to submitter)</span>
            </label>
            <textarea
              className="input w-full resize-none"
              rows={3}
              placeholder="Add notes for the submitterâ€¦"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={1000}
            />
            <p className="text-xs text-gray-400 text-right mt-1">{notes.length}/1000</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || status === report.status && notes === (report.admin_notes ?? '')}
            className="btn-primary gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Savingâ€¦' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminThreatReportsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()

  const [data, setData]         = useState<PaginatedResponse<Report> | null>(null)
  const [loading, setLoading]   = useState(false)
  const [page, setPage]         = useState(1)
  const [selected, setSelected] = useState<Report | null>(null)

  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) router.replace('/login')
  }, [authLoading, user, isAdmin, router])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get('/admin/threat-reports', {
        params: {
          page,
          per_page: 20,
          search:   search   || undefined,
          status:   statusFilter   || undefined,
          category: categoryFilter || undefined,
        },
      })
      setData(res)
    } catch {
      toast.error('Failed to load threat reports.')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, categoryFilter])

  useEffect(() => {
    if (!authLoading && isAdmin) fetchReports()
  }, [authLoading, isAdmin, fetchReports])

  function handleUpdated(updated: Report) {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        data: prev.data.map(r => r.id === updated.id ? updated : r),
      }
    })
  }

  function handleFilter(reset = false) {
    if (reset) { setSearch(''); setStatusFilter(''); setCategoryFilter('') }
    setPage(1)
  }

  if (authLoading) return (
    <div className="flex items-center justify-center h-screen bg-[#f5f7f5]">
      <LoadingSpinner />
    </div>
  )

  if (!isAdmin) return null

  const pendingCount = data?.data.filter(r => r.status === 'pending').length ?? 0

  return (
    <SidebarLayout title="Threat Reports" subtitle="Admin â€” Manage Community Reports">
      <div className="page-container space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Threat Reports
            </h1>
            <p className="page-subtitle">
              Review and manage community-submitted threat reports.
            </p>
          </div>
          <button onClick={() => fetchReports()} disabled={loading} className="btn-secondary gap-2 self-start sm:self-auto">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Status summary pills */}
        <div className="flex flex-wrap gap-2">
          {(Object.entries(STATUS_CONFIG) as [ReportStatus, typeof STATUS_CONFIG[ReportStatus]][]).map(([key, cfg]) => {
            const count = data?.data.filter(r => r.status === key).length ?? 0
            return (
              <button
                key={key}
                onClick={() => { setStatusFilter(statusFilter === key ? '' : key); setPage(1) }}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                  statusFilter === key ? cn(cfg.color, cfg.bg) : 'text-gray-500 bg-white border-gray-200 hover:border-gray-300'
                )}
              >
                {cfg.icon}
                {cfg.label}
                <span className={cn('ml-0.5 tabular-nums', statusFilter === key ? 'opacity-80' : 'text-gray-400')}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div className="card !p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Search title, description, locationâ€¦"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <select
              className="input w-40"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_CONFIG) as ReportStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <select
              className="input w-40"
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
            >
              <option value="">All categories</option>
              <option value="event_accomplishment">Accomplishment Reports</option>
              {(['damage', 'restoration', 'wildlife', 'pollution', 'other'] as ReportCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            {(search || statusFilter || categoryFilter) && (
              <button onClick={() => handleFilter(true)} className="btn-secondary gap-1.5 text-sm">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="card !p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          ) : data?.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <FileText className="w-10 h-10 opacity-25" />
              <p className="text-sm">No reports found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Report</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted by</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data?.data.map(report => (
                    <tr
                      key={report.id}
                      className={cn(
                        'hover:bg-gray-50/60 transition-colors',
                        report.status === 'pending' && 'bg-amber-50/30'
                      )}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          {report.image_url ? (
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                              <img src={report.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg shrink-0">
                              {CATEGORY_ICONS[report.category]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate max-w-[220px]">{report.title}</p>
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              {report.location_name ?? `${report.latitude?.toFixed(3)}, ${report.longitude?.toFixed(3)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-lg capitalize">
                          {report.report_type === 'event_accomplishment' ? 'Accomplishment Report' : <>{CATEGORY_ICONS[report.category]} {report.category}</>}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-700">{report.user?.name ?? 'â€”'}</p>
                        <p className="text-xs text-gray-400">{report.user?.email ?? ''}</p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={report.status} />
                        {report.admin_notes && (
                          <p className="text-xs text-gray-400 mt-1 max-w-[160px] truncate" title={report.admin_notes}>
                            {report.admin_notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(report.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => setSelected(report)}
                          className="btn-secondary text-xs gap-1.5 py-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.last_page > 1 && (
          <Pagination currentPage={data.current_page} lastPage={data.last_page} onPageChange={setPage} />
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <ReviewModal
          report={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </SidebarLayout>
  )
}
