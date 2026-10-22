'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchSites } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import type { RestorationSite } from '@/lib/types'
import {
  MapPin, Filter, Plus, TreePine, Layers, Activity,
  Search, X, ChevronRight, BarChart2, Pencil,
  Sprout, Clock, Ban,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; Icon: LucideIcon; color: string; bg: string; text: string }> = {
  active:      { label: 'Active',      Icon: Sprout, color: '#15803d', bg: '#f0fdf4', text: '#15803d' },
  in_progress: { label: 'In Progress', Icon: Clock,  color: '#b45309', bg: '#fffbeb', text: '#b45309' },
  inactive:    { label: 'Inactive',    Icon: Ban,    color: '#4b5563', bg: '#f9fafb', text: '#4b5563' },
}

export default function SitesPage() {
  const { user } = useAuth()
  const [sites, setSites]               = useState<RestorationSite[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('')

  // MENRO / staff / admin can edit site details (matches the backend
  // role:menro,admin,staff gate on PUT /sites/{id}). The editing itself happens
  // inline on the site detail page.
  const canEdit = user?.role === 'menro' || user?.role === 'admin' || user?.role === 'staff'

  useEffect(() => {
    fetchSites()
      .then(setSites)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const barangays = Array.from(new Set(sites.map(s => s.barangay).filter(Boolean))).sort() as string[]

  const filtered = sites.filter(s => {
    if (statusFilter   && s.status   !== statusFilter)   return false
    if (barangayFilter && s.barangay !== barangayFilter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.barangay?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const hasFilters = !!(search || statusFilter || barangayFilter)

  const statusCounts = Object.fromEntries(
    Object.keys(STATUS_CONFIG).map(k => [k, sites.filter(s => s.status === k).length])
  )

  if (loading) return <SidebarLayout><div className="flex items-center justify-center h-64"><LoadingSpinner /></div></SidebarLayout>

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Restoration Sites</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {sites.length} site{sites.length !== 1 ? 's' : ''} across Gloria, Oriental Mindoro
            </p>
          </div>
          {user?.role === 'menro' && (
            <Link href="/sites/new" className="btn-primary flex items-center gap-2 text-sm group shrink-0">
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              Add Site
            </Link>
          )}
        </div>

        {/* Status summary chips */}
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150',
                statusFilter === key
                  ? 'shadow-sm scale-[1.02]'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
              style={statusFilter === key ? { background: cfg.bg, borderColor: cfg.color, color: cfg.text } : {}}
            >
              <cfg.Icon className="w-3.5 h-3.5" />
              {cfg.label}
              <span className={cn(
                'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                statusFilter === key ? 'bg-white/60' : 'bg-gray-100 text-gray-500'
              )}>
                {statusCounts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 flex flex-wrap items-center gap-3 reveal">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9 py-2 text-sm w-full"
              placeholder="Search sites or barangays…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Barangay filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              className="input py-2 text-xs w-auto min-w-[150px]"
              value={barangayFilter}
              onChange={e => setBarangayFilter(e.target.value)}
            >
              <option value="">All barangays</option>
              {barangays.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setBarangayFilter('') }}
              className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400 font-medium">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Site cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <TreePine className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-base font-semibold text-gray-600 mb-1">No sites found</p>
            <p className="text-sm text-gray-400">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 reveal stagger">
            {filtered.map(site => {
              const cfg = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active
              return (
                <Link
                  key={site.id}
                  href={`/sites/${site.id}`}
                  className="group bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3"
                >
                  {/* Status accent bar */}
                  <div className="h-1 rounded-full -mt-5 -mx-5 mb-1" style={{ background: cfg.color, opacity: 0.7 }} />

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: cfg.bg, color: cfg.color }}><cfg.Icon className="w-4 h-4" /></span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm group-hover:text-primary-700 transition-colors leading-snug line-clamp-2">
                          {site.name}
                        </h3>
                        {site.barangay && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                            <span className="text-xs text-gray-500 truncate">Brgy. {site.barangay}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.color + '60' }}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    {site.area_hectares != null && (
                      <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Layers className="w-3 h-3 text-blue-500" />
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Area</p>
                        </div>
                        <p className="text-sm font-extrabold text-blue-800">{site.area_hectares} ha</p>
                      </div>
                    )}
                    {site.plantation_count != null && (
                      <div className="bg-green-50 rounded-xl p-2.5 border border-green-100">
                        <div className="flex items-center gap-1 mb-0.5">
                          <TreePine className="w-3 h-3 text-green-600" />
                          <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Planted</p>
                        </div>
                        <p className="text-sm font-extrabold text-green-800">{site.plantation_count.toLocaleString()}</p>
                      </div>
                    )}
                    {site.survival_rate != null && (
                      <div className={cn(
                        'rounded-xl p-2.5 border',
                        site.survival_rate >= 70 ? 'bg-teal-50 border-teal-100' :
                        site.survival_rate >= 40 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                      )}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Activity className={cn('w-3 h-3',
                            site.survival_rate >= 70 ? 'text-teal-600' :
                            site.survival_rate >= 40 ? 'text-amber-600' : 'text-red-600'
                          )} />
                          <p className={cn('text-[10px] font-bold uppercase tracking-wide',
                            site.survival_rate >= 70 ? 'text-teal-700' :
                            site.survival_rate >= 40 ? 'text-amber-700' : 'text-red-700'
                          )}>Survival</p>
                        </div>
                        <p className={cn('text-sm font-extrabold',
                          site.survival_rate >= 70 ? 'text-teal-800' :
                          site.survival_rate >= 40 ? 'text-amber-800' : 'text-red-800'
                        )}>{site.survival_rate}%</p>
                      </div>
                    )}
                    {site.established_year && (
                      <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                        <div className="flex items-center gap-1 mb-0.5">
                          <BarChart2 className="w-3 h-3 text-gray-500" />
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Est.</p>
                        </div>
                        <p className="text-sm font-extrabold text-gray-700">{site.established_year}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                    <span className={cn('text-xs font-medium inline-flex items-center gap-1',
                      canEdit ? 'text-primary-600' : 'text-gray-400')}>
                      {canEdit ? (<><Pencil className="w-3 h-3" /> View &amp; edit details</>) : 'View details'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}

      </div>
    </SidebarLayout>
  )
}
