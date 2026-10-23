'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  fetchSite, fetchSitePlantationRecords, fetchSitePhotos, updateSite,
} from '@/lib/mangrove-api'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { RestorationSite, PlantationRecord, SitePhoto, SiteSpeciesRef } from '@/lib/types'
import {
  MapPin, Leaf, TreePine, Activity,
  ArrowLeft, Plus, Camera, Calendar,
  CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight,
  User as UserIcon, Sprout, Pencil, Check, X as XIcon,
} from 'lucide-react'

const SitePolygonMap = dynamic(() => import('@/components/map/SitePolygonMap'), { ssr: false })

type Tab = 'overview' | 'plantations' | 'photos'

const STATUS_CONFIG: Record<string, {
  label: string; icon: string; color: string; fill: string; bg: string; text: string
}> = {
  active:      { label: 'Active',      icon: '🌿', color: '#15803d', fill: '#22c55e', bg: '#f0fdf4', text: '#15803d' },
  in_progress: { label: 'In Progress', icon: '⏳', color: '#b45309', fill: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
  inactive:    { label: 'Inactive',    icon: '⛔', color: '#4b5563', fill: '#9ca3af', bg: '#f9fafb', text: '#4b5563' },
}

const PLANTATION_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  active:  { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-green-600' },
  flagged: { icon: <Clock       className="w-3.5 h-3.5" />, color: 'text-amber-600' },
  dead:    { icon: <XCircle     className="w-3.5 h-3.5" />, color: 'text-red-500'   },
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const siteId = Number(id)

  const [site, setSite]               = useState<RestorationSite | null>(null)
  const [plantations, setPlantations] = useState<PlantationRecord[]>([])
  const [photos, setPhotos]           = useState<SitePhoto[]>([])
  const [loading, setLoading]         = useState(true)
  const [siteLoadError, setSiteLoadError] = useState<'not-found' | 'load-failed' | null>(null)
  const [tab, setTab]                 = useState<Tab>('overview')
  const [photoFilter, setPhotoFilter] = useState<'all' | 'before' | 'after'>('all')
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Assignment editor (menro + admin)
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [fieldWorkers, setFieldWorkers] = useState<{ id: number; name: string }[]>([])
  const [assigneeDraft, setAssigneeDraft] = useState<string>('')
  const [savingAssignee, setSavingAssignee] = useState(false)

  // Planting-progress editor (menro + admin)
  const [editingProgress, setEditingProgress] = useState(false)
  const [areaDraft, setAreaDraft] = useState<string>('')
  const [plantedDraft, setPlantedDraft] = useState<string>('')
  const [savingProgress, setSavingProgress] = useState(false)

  // Status editor (menro + admin)
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState<string>('')
  const [savingStatus, setSavingStatus] = useState(false)

  // Name editor (menro + admin)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState<string>('')
  const [savingName, setSavingName] = useState(false)

  // About / description editor (menro + admin)
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState<string>('')
  const [savingAbout, setSavingAbout] = useState(false)

  // Established-year editor (menro + admin)
  const [editingYear, setEditingYear] = useState(false)
  const [yearDraft, setYearDraft] = useState<string>('')
  const [savingYear, setSavingYear] = useState(false)

  // Species editor (menro + admin)
  const [editingSpecies, setEditingSpecies] = useState(false)
  const [speciesOptions, setSpeciesOptions] = useState<SiteSpeciesRef[]>([])
  const [speciesDraft, setSpeciesDraft] = useState<number[]>([])
  const [savingSpecies, setSavingSpecies] = useState(false)

  useEffect(() => {
    if (user?.role === 'field_worker') {
      router.replace('/analytics')
      return
    }
    setSite(null)
    setSiteLoadError(null)
    setLoading(true)
    // Fetch site first — it's public. Secondary data (plantation records, photos,
    // ecosystem) requires auth and may 403 for some roles; use allSettled so a
    // failure on any secondary call never prevents the site from rendering.
    Promise.allSettled([
      fetchSite(siteId),
      fetchSitePlantationRecords(siteId),
      fetchSitePhotos(siteId),
    ]).then(([s, p, ph]) => {
      if (s.status === 'fulfilled') {
        setSite(s.value)
      } else {
        const status = (s.reason as { response?: { status?: number } })?.response?.status
        setSiteLoadError(status === 404 ? 'not-found' : 'load-failed')
        console.error('[Site detail] Failed to load site.', s.reason)
      }
      if (p.status  === 'fulfilled') setPlantations(p.value)
      if (ph.status === 'fulfilled') setPhotos(ph.value)
    }).finally(() => setLoading(false))
  }, [siteId, user, router])

  const canAddUpdate = user?.role === 'menro'
  // Site editing is allowed for menro, admin, and staff — matching the backend
  // route gate (role:menro,admin,staff on PUT /sites/{id}). Note: a 'staff'
  // account is also labelled "MENRO Admin" in the UI, so it must be included
  // here or those users would see no edit controls at all.
  const canAssign    = user?.role === 'menro' || user?.role === 'admin' || user?.role === 'staff'
  const filteredPhotos = photoFilter === 'all' ? photos : photos.filter(p => p.photo_type === photoFilter)

  if (user?.role === 'field_worker') return <SidebarLayout title="Analytics"><div className="page-container flex items-center justify-center py-24"><LoadingSpinner /></div></SidebarLayout>

  async function openAssigneeEditor() {
    setAssigneeDraft(site?.assigned_to != null ? String(site.assigned_to) : '')
    setEditingAssignee(true)
    if (fieldWorkers.length === 0) {
      try {
        const { data } = await api.get('/field-workers')
        setFieldWorkers((data ?? []).map((u: any) => ({ id: u.id, name: u.name })))
      } catch { /* dropdown just stays empty */ }
    }
  }

  async function saveAssignee() {
    if (!site) return
    setSavingAssignee(true)
    try {
      await updateSite(site.id, { assigned_to: assigneeDraft === '' ? null : Number(assigneeDraft) } as any)
      const fresh = await fetchSite(site.id)
      setSite(fresh)
      setEditingAssignee(false)
      toast.success('Bantay Bakawan updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update assignment')
    } finally {
      setSavingAssignee(false)
    }
  }

  function openProgressEditor() {
    setAreaDraft(site?.area_hectares != null ? String(site.area_hectares) : '')
    setPlantedDraft(site?.planted_hectares != null ? String(site.planted_hectares) : '')
    setEditingProgress(true)
  }

  async function saveProgress() {
    if (!site) return
    const area    = areaDraft === '' ? null : Number(areaDraft)
    const planted = plantedDraft === '' ? null : Number(plantedDraft)
    if (area != null && planted != null && planted > area) {
      toast.error('Planted hectares cannot exceed the site area.')
      return
    }
    setSavingProgress(true)
    try {
      await updateSite(site.id, { area_hectares: area, planted_hectares: planted } as any)
      setSite(await fetchSite(site.id))
      setEditingProgress(false)
      toast.success('Planting progress updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update planting progress')
    } finally {
      setSavingProgress(false)
    }
  }

  function openStatusEditor() {
    setStatusDraft(site?.status ?? 'active')
    setEditingStatus(true)
  }

  async function saveStatus() {
    if (!site) return
    setSavingStatus(true)
    try {
      await updateSite(site.id, { status: statusDraft } as any)
      setSite(await fetchSite(site.id))
      setEditingStatus(false)
      toast.success('Site status updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update status')
    } finally {
      setSavingStatus(false)
    }
  }

  function openNameEditor() {
    setNameDraft(site?.name ?? '')
    setEditingName(true)
  }

  async function saveName() {
    if (!site) return
    const trimmed = nameDraft.trim()
    if (trimmed === '') {
      toast.error('Site name cannot be empty.')
      return
    }
    setSavingName(true)
    try {
      await updateSite(site.id, { name: trimmed } as any)
      setSite(await fetchSite(site.id))
      setEditingName(false)
      toast.success('Site name updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update site name')
    } finally {
      setSavingName(false)
    }
  }

  function openAboutEditor() {
    setAboutDraft(site?.description ?? '')
    setEditingAbout(true)
  }

  async function saveAbout() {
    if (!site) return
    setSavingAbout(true)
    try {
      await updateSite(site.id, { description: aboutDraft.trim() === '' ? null : aboutDraft.trim() } as any)
      setSite(await fetchSite(site.id))
      setEditingAbout(false)
      toast.success('Site description updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update description')
    } finally {
      setSavingAbout(false)
    }
  }

  function openYearEditor() {
    setYearDraft(site?.established_year != null ? String(site.established_year) : '')
    setEditingYear(true)
  }

  async function saveYear() {
    if (!site) return
    const trimmed = yearDraft.trim()
    const year = trimmed === '' ? null : Number(trimmed)
    if (year != null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())) {
      toast.error(`Enter a valid year between 1900 and ${new Date().getFullYear()}.`)
      return
    }
    setSavingYear(true)
    try {
      await updateSite(site.id, { established_year: year } as any)
      setSite(await fetchSite(site.id))
      setEditingYear(false)
      toast.success('Established year updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update established year')
    } finally {
      setSavingYear(false)
    }
  }

  async function openSpeciesEditor() {
    setSpeciesDraft((site?.site_species ?? []).map(sp => sp.id))
    setEditingSpecies(true)
    if (speciesOptions.length === 0) {
      try {
        const { data } = await api.get('/species')
        const list = (data?.data ?? data ?? []) as any[]
        setSpeciesOptions(list.map(s => ({
          id: s.id, scientific_name: s.scientific_name, local_name: s.local_name, family: s.family,
        })))
      } catch { /* picker just shows no options */ }
    }
  }

  async function saveSpecies() {
    if (!site) return
    setSavingSpecies(true)
    try {
      await updateSite(site.id, { species_ids: speciesDraft } as any)
      setSite(await fetchSite(site.id))
      setEditingSpecies(false)
      toast.success('Mangrove species updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update species')
    } finally {
      setSavingSpecies(false)
    }
  }

  if (loading) return (
    <SidebarLayout>
      <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
    </SidebarLayout>
  )
  if (siteLoadError) return (
    <SidebarLayout>
      <div className="text-center py-16 px-4">
        <TreePine className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-700 font-semibold">
          {siteLoadError === 'not-found' ? 'Site not found.' : 'Unable to load this site.'}
        </p>
        {siteLoadError === 'load-failed' && (
          <>
            <p className="text-sm text-gray-500 mt-2">The server could not load the site details. Please try again.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-secondary text-sm mt-4"
            >
              Try again
            </button>
          </>
        )}
        <Link href="/sites" className="text-primary-600 text-sm mt-2 inline-block hover:underline">← Back to Sites</Link>
      </div>
    </SidebarLayout>
  )
  if (!site) return (
    <SidebarLayout>
      <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const cfg = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview',    label: 'Overview' },
    { key: 'plantations', label: 'Plantation Records', count: plantations.length },
    { key: 'photos',      label: 'Photos',             count: photos.length },
  ]

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="animate-slide-up">
          <Link href="/sites" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> All Sites
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-3xl mt-1 shrink-0">{cfg.icon}</span>
              <div className="min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      className="input py-1.5 text-lg font-bold w-full min-w-[16rem]"
                      value={nameDraft}
                      disabled={savingName}
                      onChange={e => setNameDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                      autoFocus
                    />
                    <button onClick={saveName} disabled={savingName}
                      className="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingName(false)} disabled={savingName}
                      className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight break-words">{site.name}</h1>
                    {canAssign && (
                      <button onClick={openNameEditor}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 shrink-0"
                        title="Edit site name">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                  </div>
                )}
                {site.barangay && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-500">Brgy. {site.barangay}, Gloria, Oriental Mindoro</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {editingStatus ? (
                <div className="flex items-center gap-1.5">
                  <select
                    className="input py-1.5 text-sm"
                    value={statusDraft}
                    onChange={e => setStatusDraft(e.target.value)}
                    disabled={savingStatus}
                  >
                    <option value="active">Active</option>
                    <option value="in_progress">In Progress</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button onClick={saveStatus} disabled={savingStatus}
                    className="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingStatus(false)} disabled={savingStatus}
                    className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={canAssign ? openStatusEditor : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-shadow',
                    canAssign && 'hover:shadow-sm cursor-pointer'
                  )}
                  style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.color + '60' }}
                  title={canAssign ? 'Change site status' : undefined}
                >
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: cfg.color }} />
                  {cfg.label}
                  {canAssign && <Pencil className="w-3 h-3 opacity-70" />}
                </button>
              )}
              {canAddUpdate && (
                <Link href="/plantation/new" className="btn-primary text-sm flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Update
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-0.5 bg-gray-100/80 p-1 rounded-2xl w-fit border border-gray-200/60 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
                tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  tab === t.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview tab ────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="animate-fade-in space-y-6">

            {/* Site location map — full width so there is no empty gutter. */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Site Location</span>
                <span className="ml-auto text-xs text-gray-400">Gloria, Oriental Mindoro</span>
              </div>
              <SitePolygonMap
                sites={[site]}
                height="clamp(320px, 42vh, 460px)"
                selectedSiteId={site.id}
                editable={canAssign}
                onBoundarySaved={async () => { setSite(await fetchSite(site.id)) }}
                center={
                  (site as any).latitude && (site as any).longitude
                    ? [(site as any).latitude, (site as any).longitude]
                    : [12.9330, 121.4800]
                }
                zoom={14}
              />
            </div>

            {/* Quick-glance stats — one even row of four cards below the map. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Area */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Area</p>
                <p className="text-xl font-extrabold mt-1 truncate text-blue-700">
                  {site.area_hectares != null ? `${site.area_hectares} ha` : '—'}
                </p>
              </div>

              {/* Established — editable inline by MENRO/admin/staff */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Established</p>
                  {canAssign && !editingYear && (
                    <button onClick={openYearEditor}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-600 hover:text-primary-700">
                      <Pencil className="w-3 h-3" /> {site.established_year ? 'Edit' : 'Set'}
                    </button>
                  )}
                </div>
                {editingYear ? (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={new Date().getFullYear()}
                      placeholder="e.g. 2020"
                      className="input py-1.5 text-sm w-full"
                      value={yearDraft}
                      disabled={savingYear}
                      onChange={e => setYearDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveYear() }}
                      autoFocus
                    />
                    <button onClick={saveYear} disabled={savingYear}
                      className="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingYear(false)} disabled={savingYear}
                      className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xl font-extrabold mt-1 truncate text-gray-900">
                    {site.established_year != null ? site.established_year : '—'}
                  </p>
                )}
              </div>

              {/* Species */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Species</p>
                <p className="text-xl font-extrabold mt-1 truncate text-primary-700">{site.site_species?.length ?? 0}</p>
              </div>

              {/* Survival */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Survival</p>
                <p className="text-xl font-extrabold mt-1 truncate text-teal-700">
                  {site.survival_rate != null ? `${site.survival_rate}%` : '—'}
                </p>
              </div>
            </div>

            {/* Detail cards in a balanced masonry layout. CSS columns pack the
                cards tightly across two columns regardless of their individual
                heights, so there is no dead gap beside a shorter column. Each
                card gets a consistent bottom gap and never splits across columns. */}
            <div className="columns-1 lg:columns-2 gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid">

              {/* About / description — editable by MENRO/admin */}
              {(site.description || canAssign) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">About</p>
                    {canAssign && !editingAbout && (
                      <button onClick={openAboutEditor}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                        <Pencil className="w-3 h-3" /> {site.description ? 'Edit' : 'Add'}
                      </button>
                    )}
                  </div>
                  {editingAbout ? (
                    <div className="space-y-2">
                      <textarea
                        className="input w-full resize-none text-sm leading-relaxed"
                        rows={5}
                        value={aboutDraft}
                        disabled={savingAbout}
                        onChange={e => setAboutDraft(e.target.value)}
                        placeholder="Describe this restoration site — location, history, objectives, notable features, etc."
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={saveAbout} disabled={savingAbout}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
                          <Check className="w-4 h-4" /> Save
                        </button>
                        <button onClick={() => setEditingAbout(false)} disabled={savingAbout}
                          className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : site.description ? (
                    <p className="text-sm text-gray-600 leading-relaxed">{site.description}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No description yet. Click Add to write one.</p>
                  )}
                </div>
              )}

              {/* Assigned Bantay Bakawan */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Assigned Bantay Bakawan</p>
                  {canAssign && !editingAssignee && (
                    <button onClick={openAssigneeEditor}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                      <Pencil className="w-3 h-3" /> {site.assigned_worker ? 'Change' : 'Assign'}
                    </button>
                  )}
                </div>
                {editingAssignee ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="input flex-1 py-2 text-sm"
                      value={assigneeDraft}
                      onChange={e => setAssigneeDraft(e.target.value)}
                      disabled={savingAssignee}
                    >
                      <option value="">Unassigned</option>
                      {fieldWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <button onClick={saveAssignee} disabled={savingAssignee}
                      className="p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingAssignee(false)} disabled={savingAssignee}
                      className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4 text-primary-600" />
                    </span>
                    <p className="text-sm font-semibold text-gray-800">
                      {site.assigned_worker?.name ?? <span className="text-gray-400 font-normal">Unassigned</span>}
                    </p>
                  </div>
                )}
              </div>

              {/* Planting progress — editable by MENRO/admin */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Planting Progress</p>
                  {canAssign && !editingProgress && (
                    <button onClick={openProgressEditor}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>

                {editingProgress ? (
                  (() => {
                    const a = areaDraft === '' ? null : Number(areaDraft)
                    const p = plantedDraft === '' ? null : Number(plantedDraft)
                    const unplanted = a != null && p != null ? Math.max(0, +(a - p).toFixed(4)) : null
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Total Area (ha)</label>
                            <input type="number" min={0} step="0.01" className="input w-full py-2 text-sm mt-1"
                              value={areaDraft} disabled={savingProgress}
                              onChange={e => setAreaDraft(e.target.value)} placeholder="e.g. 16.8" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Planted (ha)</label>
                            <input type="number" min={0} step="0.01" className="input w-full py-2 text-sm mt-1"
                              value={plantedDraft} disabled={savingProgress}
                              onChange={e => setPlantedDraft(e.target.value)} placeholder="e.g. 10" />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          Unplanted: <span className="font-bold text-amber-700">{unplanted != null ? `${unplanted} ha` : '—'}</span>
                          {a != null && p != null && p > a && (
                            <span className="ml-2 text-red-600 font-semibold">Planted exceeds area</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <button onClick={saveProgress} disabled={savingProgress}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
                            <Check className="w-4 h-4" /> Save
                          </button>
                          <button onClick={() => setEditingProgress(false)} disabled={savingProgress}
                            className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })()
                ) : site.planted_hectares != null && site.area_hectares != null ? (
                  (() => {
                    const unplanted = Math.max(0, +(site.area_hectares - site.planted_hectares).toFixed(4))
                    const pct = site.area_hectares > 0
                      ? Math.min(100, Math.round((site.planted_hectares / site.area_hectares) * 100))
                      : 0
                    return (
                      <div className="space-y-3">
                        {/* Single cohesive progress bar */}
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-semibold text-gray-700">{pct}% planted</span>
                            <span className="text-gray-400">{site.planted_hectares} / {site.area_hectares} ha</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full bg-primary-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        {/* Planted / Unplanted breakdown — restrained two-tone */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl p-3 bg-gray-50 border border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-2 h-2 rounded-full bg-primary-500" />
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Planted</p>
                            </div>
                            <p className="text-lg font-extrabold text-gray-900">{site.planted_hectares}<span className="text-xs font-semibold text-gray-400 ml-1">ha</span></p>
                          </div>
                          <div className="rounded-xl p-3 bg-gray-50 border border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-2 h-2 rounded-full bg-gray-300" />
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Unplanted</p>
                            </div>
                            <p className="text-lg font-extrabold text-gray-900">{unplanted}<span className="text-xs font-semibold text-gray-400 ml-1">ha</span></p>
                          </div>
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    Planted/unplanted area breakdown unavailable.
                    {canAssign && ' Click Edit to set it.'}
                  </p>
                )}
              </div>

              {/* Mangrove species documented at this site — editable by MENRO/admin */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-primary-500" /> Mangrove Species
                  </p>
                  <div className="flex items-center gap-2">
                    {site.site_species && site.site_species.length > 0 && !editingSpecies && (
                      <span className="text-[10px] font-bold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-0.5">
                        {site.site_species.length} species
                      </span>
                    )}
                    {canAssign && !editingSpecies && (
                      <button onClick={openSpeciesEditor}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingSpecies ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">{speciesDraft.length} selected</span>
                      {speciesDraft.length > 0 && (
                        <button onClick={() => setSpeciesDraft([])} className="text-[11px] text-gray-400 hover:text-gray-700">
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 p-2 grid grid-cols-1 gap-1">
                      {speciesOptions.length === 0 ? (
                        <p className="text-xs text-gray-400 p-2">Loading species…</p>
                      ) : (
                        speciesOptions.map(sp => {
                          const checked = speciesDraft.includes(sp.id)
                          return (
                            <label key={sp.id}
                              className={cn(
                                'flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer transition-colors',
                                checked ? 'bg-primary-50 text-primary-800' : 'hover:bg-gray-50 text-gray-700'
                              )}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={savingSpecies}
                                onChange={e => setSpeciesDraft(prev =>
                                  e.target.checked ? [...prev, sp.id] : prev.filter(id => id !== sp.id)
                                )}
                                className="rounded text-primary-600 w-3.5 h-3.5 shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="italic">{sp.scientific_name}</span>
                                {sp.local_name && <span className="text-gray-400 not-italic"> · {sp.local_name}</span>}
                              </span>
                            </label>
                          )
                        })
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={saveSpecies} disabled={savingSpecies}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
                        <Check className="w-4 h-4" /> Save
                      </button>
                      <button onClick={() => setEditingSpecies(false)} disabled={savingSpecies}
                        className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : site.site_species && site.site_species.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {site.site_species.map(sp => (
                      <span key={sp.id}
                        title={sp.family ?? undefined}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-1">
                        <Leaf className="w-3 h-3" />
                        <span className="italic">{sp.scientific_name}</span>
                        {sp.local_name && <span className="text-primary-400 not-italic">· {sp.local_name}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    No species documented yet.{canAssign && ' Click Edit to add.'}
                  </p>
                )}
              </div>

              {/* Site Details — clean, professional definition list */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Site Details</p>

                <dl className="divide-y divide-gray-100">
                  {/* Established year — edit it from the "Established" tile at the top */}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      Established
                    </dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {site.established_year ?? <span className="text-gray-400 font-normal">Not set</span>}
                    </dd>
                  </div>

                  {/* Area */}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-sm text-gray-500">
                      <Leaf className="w-4 h-4 text-gray-400" />
                      Area
                    </dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {site.area_hectares != null ? `${site.area_hectares} ha` : <span className="text-gray-400 font-normal">—</span>}
                    </dd>
                  </div>

                  {/* Species */}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-sm text-gray-500">
                      <Sprout className="w-4 h-4 text-gray-400" />
                      Species
                    </dt>
                    <dd className="text-sm font-semibold text-gray-900">{site.site_species?.length ?? 0}</dd>
                  </div>

                  {/* Planted records */}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-sm text-gray-500">
                      <TreePine className="w-4 h-4 text-gray-400" />
                      Planted records
                    </dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {site.plantation_count != null ? site.plantation_count.toLocaleString() : <span className="text-gray-400 font-normal">—</span>}
                    </dd>
                  </div>

                  {/* Survival rate — with subtle bar, the single accent */}
                  <div className="py-2.5">
                    <div className="flex items-center justify-between">
                      <dt className="flex items-center gap-2 text-sm text-gray-500">
                        <Activity className="w-4 h-4 text-gray-400" />
                        Survival rate
                      </dt>
                      <dd className={cn('text-sm font-bold',
                        site.survival_rate == null ? 'text-gray-400' :
                        site.survival_rate >= 70 ? 'text-teal-700' :
                        site.survival_rate >= 40 ? 'text-amber-700' : 'text-red-600'
                      )}>
                        {site.survival_rate != null ? `${site.survival_rate}%` : '—'}
                      </dd>
                    </div>
                    {site.survival_rate != null && (
                      <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700',
                            site.survival_rate >= 70 ? 'bg-teal-500' :
                            site.survival_rate >= 40 ? 'bg-amber-500' : 'bg-red-500'
                          )}
                          style={{ width: `${Math.min(site.survival_rate, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </dl>

                {/* Created date */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  Created {formatDate(site.created_at)}
                </div>
              </div>

            </div>{/* ── end detail cards ── */}
          </div>
        )}

        {/* ── Plantation Records tab ───────────────────────────────────────── */}
        {tab === 'plantations' && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">{plantations.length} plantation record{plantations.length !== 1 ? 's' : ''}</p>
              {canAddUpdate && (
                <Link href="/plantation/new" className="btn-primary text-sm flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> New Record
                </Link>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['#', 'Species', 'Date Planted', 'Status', 'Seedling Source'].map(h => (
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {plantations.map(p => {
                    const pCfg = PLANTATION_STATUS_CONFIG[p.status]
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="table-cell text-gray-400 font-mono text-xs">#{p.id}</td>
                        <td className="table-cell font-semibold text-gray-900">{p.species_name}</td>
                        <td className="table-cell text-gray-600">{formatDate(p.date_planted)}</td>
                        <td className="table-cell">
                          <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold capitalize', pCfg?.color)}>
                            {pCfg?.icon}{p.status}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500">{p.seedling_source ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              {plantations.length === 0 && (
                <div className="text-center py-12">
                  <TreePine className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No plantation records yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Photos tab ──────────────────────────────────────────────────── */}
        {tab === 'photos' && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-1.5 bg-gray-100/80 p-1 rounded-xl border border-gray-200/60">
                {(['all', 'before', 'after'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setPhotoFilter(f)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                      photoFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="ml-1 text-[10px] text-gray-400">
                      ({f === 'all' ? photos.length : photos.filter(p => p.photo_type === f).length})
                    </span>
                  </button>
                ))}
              </div>
              {canAddUpdate && (
                <button className="btn-primary text-sm flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> Upload Photo
                </button>
              )}
            </div>

            {filteredPhotos.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <Camera className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No photos yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredPhotos.map((photo, idx) => (
                  <button
                    key={photo.id}
                    onClick={() => setLightboxIdx(idx)}
                    className="relative rounded-2xl overflow-hidden aspect-square bg-gray-100 group hover:shadow-lg transition-all duration-200"
                  >
                    <img
                      src={photo.cloudinary_url}
                      alt={`${photo.photo_type} photo`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    <span className={cn(
                      'absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full',
                      photo.photo_type === 'before'
                        ? 'bg-amber-500 text-white'
                        : 'bg-green-500 text-white'
                    )}>
                      {photo.photo_type}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Lightbox */}
            {lightboxIdx !== null && (
              <div
                className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in"
                onClick={() => setLightboxIdx(null)}
              >
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null && i > 0 ? i - 1 : filteredPhotos.length - 1) }}
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <img
                  src={filteredPhotos[lightboxIdx]?.cloudinary_url}
                  alt="Site photo"
                  className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl"
                  onClick={e => e.stopPropagation()}
                />
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null && i < filteredPhotos.length - 1 ? i + 1 : 0) }}
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
                  {lightboxIdx + 1} / {filteredPhotos.length}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </SidebarLayout>
  )
}
