'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/lib/auth-context'
import { fetchMyPlantationRecords } from '@/lib/mangrove-api'
import type { PlantationRecord } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  TreePine, Plus, Search, X, ChevronRight,
  MapPin, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  active:  'bg-green-50 text-green-700 border-green-200',
  flagged: 'bg-amber-50 text-amber-700 border-amber-200',
  dead:    'bg-red-50 text-red-700 border-red-200',
}

export default function MyPlantationsPage() {
  const { user, isFieldWorker, loading: authLoading } = useAuth()
  const router = useRouter()

  const [records, setRecords]     = useState<PlantationRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [siteFilter, setSiteFilter]     = useState('')

  // Unique list of sites present in the user's records — powers the site dropdown
  const siteOptions = Array.from(
    new Map(
      records
        .filter(r => r.site?.name)
        .map(r => [r.site!.name, r.site!.name] as const)
    ).values()
  ).sort((a, b) => a.localeCompare(b))

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
  }, [authLoading, user, router])

  useEffect(() => {
    if (authLoading || !user) return
    fetchMyPlantationRecords()
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [authLoading, user]) // eslint-disable-line

  const filtered = records.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false
    if (siteFilter && r.site?.name !== siteFilter) return false
    if (search && !r.species_name.toLowerCase().includes(search.toLowerCase()) &&
        !r.site?.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    active:  records.filter(r => r.status === 'active').length,
    flagged: records.filter(r => r.status === 'flagged').length,
    dead:    records.filter(r => r.status === 'dead').length,
  }

  if (authLoading || loading) return (
    <SidebarLayout title="My Plantations">
      <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="My Plantations" subtitle="Your submitted plantation records">
      <div className="page-container space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="page-title">My Plantations</h1>
            <p className="page-subtitle">
              {records.length} record{records.length !== 1 ? 's' : ''} submitted
            </p>
          </div>
          <Link href="/plantation/new" className="btn-primary text-sm group shrink-0">
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
            New Record
          </Link>
        </div>

        {/* Compact summary row — most important number first */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',   value: records.length,  cls: 'text-gray-900' },
            { label: 'Active',  value: counts.active,   cls: 'text-green-600' },
            { label: 'Flagged', value: counts.flagged,  cls: 'text-amber-600' },
            { label: 'Dead',    value: counts.dead,     cls: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className={cn('text-2xl font-extrabold leading-none', s.cls)}>{s.value}</p>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter chips + search on one row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: '',        label: `All (${records.length})` },
              { key: 'active',  label: `Active (${counts.active})` },
              { key: 'flagged', label: `Flagged (${counts.flagged})` },
              { key: 'dead',    label: `Dead (${counts.dead})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150',
                  statusFilter === key
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto sm:items-center">
            {/* Site filter — pick a site to show only its records */}
            {siteOptions.length > 1 && (
              <select
                className="input sm:w-56 text-sm"
                value={siteFilter}
                onChange={e => setSiteFilter(e.target.value)}
              >
                <option value="">All sites ({siteOptions.length})</option>
                {siteOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}

            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9 pr-9"
                placeholder="Search by species or site…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Records grid — full width, 2–3 columns on desktop */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16">
            <div className="w-14 h-14 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <TreePine className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">
              {records.length === 0 ? 'No plantations recorded yet' : 'No records match your filters'}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {records.length === 0
                ? 'Start recording your mangrove plantings'
                : 'Try adjusting your search or filters'}
            </p>
            {records.length === 0 ? (
              <Link href="/plantation/new" className="btn-primary text-sm inline-flex gap-2">
                <Plus className="w-4 h-4" /> Record a Planting
              </Link>
            ) : (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setSiteFilter('') }}
                className="btn-secondary text-sm inline-flex gap-2"
              >
                <X className="w-4 h-4" /> Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(r => (
              <Link
                key={r.id}
                href={`/plantation/${r.id}`}
                className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
              >
                {/* Icon */}
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  r.status === 'active'  ? 'bg-green-50' :
                  r.status === 'flagged' ? 'bg-amber-50' : 'bg-red-50'
                )}>
                  <TreePine className={cn(
                    'w-5 h-5',
                    r.status === 'active'  ? 'text-green-600' :
                    r.status === 'flagged' ? 'text-amber-500' : 'text-red-400'
                  )} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 italic truncate group-hover:text-primary-700 transition-colors">
                    {r.species_name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {r.site?.name && (
                      <span className="text-xs text-gray-400 flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{r.site.name}</span>
                      </span>
                    )}
                    <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                      <CalendarDays className="w-3 h-3" /> {formatDate(r.date_planted)}
                    </span>
                  </div>
                </div>

                {/* Status + arrow */}
                <div className="flex items-center gap-2 shrink-0">
                  <Badge label={r.status} type="status" />
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </SidebarLayout>
  )
}
