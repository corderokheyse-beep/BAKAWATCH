'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchSites } from '@/lib/mangrove-api'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { cn } from '@/lib/utils'
import type { RestorationSite } from '@/lib/types'
import {
  BarChart2, MapPin, TreePine, TrendingUp, ArrowRight,
  Leaf, Search, X, AlertTriangle,
  Sprout, Clock, Ban, AlertCircle,
} from 'lucide-react'

// ── Status config — matches Live Map legend exactly ───────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; text: string; Icon: React.ElementType }> = {
  active:      { label: 'Active',      color: '#15803d', bg: '#f0fdf4', text: '#15803d', Icon: Sprout },
  in_progress: { label: 'In Progress', color: '#b45309', bg: '#fffbeb', text: '#b45309', Icon: Clock },
  inactive:    { label: 'Inactive',    color: '#4b5563', bg: '#f9fafb', text: '#4b5563', Icon: Ban },
}

const STATUS_ORDER = ['active', 'in_progress', 'inactive']

// ── Survival rate tier ────────────────────────────────────────────────────────
function survivalTier(rate: number) {
  if (rate >= 70) return { color: 'text-green-600',  bar: 'bg-green-500',  badge: null }
  if (rate >= 40) return { color: 'text-amber-600',  bar: 'bg-amber-400',  badge: 'Low survival' }
  return              { color: 'text-red-600',    bar: 'bg-red-500',    badge: 'Critical' }
}

// ── Tiny survival ring ────────────────────────────────────────────────────────
function SurvivalRing({ rate }: { rate: number }) {
  const r   = 16
  const c   = 2 * Math.PI * r
  const pct = Math.min(Math.max(rate, 0), 100)
  const dash = (pct / 100) * c
  const tier = survivalTier(pct)
  return (
    <svg width="44" height="44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none"
        stroke={pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'}
        strokeWidth="4"
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
      />
      <text x="22" y="27" textAnchor="middle" fontSize="9" fontWeight="700"
        fill={pct >= 70 ? '#15803d' : pct >= 40 ? '#92400e' : '#991b1b'}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

// ── Per-site accent — stable unique colour per site, derived from its id ──────
function siteAccent(seed: number | string): { from: string; to: string } {
  const n = typeof seed === 'number' ? seed : Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0)
  const hue = 90 + (n * 47) % 120
  return { from: `hsl(${hue} 55% 38%)`, to: `hsl(${(hue + 24) % 360} 60% 30%)` }
}

function siteInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

type SortKey = 'name' | 'survival' | 'area' | 'trees'

export default function AnalyticsIndexPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [sites, setSites]           = useState<RestorationSite[]>([])
  const [loading, setLoading]       = useState(true)
  const [assignedSiteId, setAssignedSiteId] = useState<number | null>(null)
  const [noAssignedSite, setNoAssignedSite] = useState(false)
  const [assignmentError, setAssignmentError] = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('name')

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (user.role === 'field_worker') {
      api.get('/analytics/mine').then(({ data }) => {
        if (data.site?.id) {
          setAssignedSiteId(Number(data.site.id))
          router.replace(`/analytics/${data.site.id}`)
        }
        else setNoAssignedSite(true)
      }).catch(() => setAssignmentError(true)).finally(() => setLoading(false))
      return
    }
    if (!['menro', 'staff', 'admin', 'denr', 'evaluator', 'volunteer'].includes(user.role)) {
      router.replace('/login'); return
    }
    fetchSites().then(setSites).finally(() => setLoading(false))
  }, [authLoading, user]) // eslint-disable-line

  // Derived filters
  const barangays = useMemo(() =>
    Array.from(new Set(sites.map(s => s.barangay).filter(Boolean))).sort() as string[],
    [sites]
  )

  const filtered = useMemo(() => {
    let list = sites.filter(s => {
      if (statusFilter   && s.status   !== statusFilter)   return false
      if (barangayFilter && s.barangay !== barangayFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!s.name.toLowerCase().includes(q) && !(s.barangay ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    if (sortKey === 'survival') list = [...list].sort((a, b) => (b.survival_rate ?? 0) - (a.survival_rate ?? 0))
    else if (sortKey === 'area') list = [...list].sort((a, b) => (b.area_hectares ?? 0) - (a.area_hectares ?? 0))
    else if (sortKey === 'trees') list = [...list].sort((a, b) => (b.plantation_count ?? 0) - (a.plantation_count ?? 0))
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [sites, search, statusFilter, barangayFilter, sortKey])

  const hasFilters = !!(search || statusFilter || barangayFilter)

  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, st) => {
    acc[st] = sites.filter(s => s.status === st).length
    return acc
  }, {})

  // ── Summary aggregates ──────────────────────────────────────────────────────
  const totalTrees    = sites.reduce((s, x) => s + Number(x.plantation_count ?? 0), 0)
  const totalHa       = sites.reduce((s, x) => s + Number(x.area_hectares ?? 0), 0)
  const sitesWithRate = sites.filter(s => s.survival_rate != null)
  const avgSurvival   = sitesWithRate.length
    ? Math.round(sitesWithRate.reduce((s, x) => s + Number(x.survival_rate ?? 0), 0) / sitesWithRate.length)
    : null
  const needsAttention = sites.filter(s => s.survival_rate != null && s.survival_rate < 40).length

  if (authLoading || loading) return (
    <SidebarLayout title="Analytics" subtitle="Site-level restoration analytics">
      <div className="page-container flex items-center justify-center py-24"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  // Bantay Bakawan land directly on their assigned site's read-only analytics.
  // Do not render the multi-site overview, search, or sorting controls for them.
  if (user?.role === 'field_worker') {
    if (assignedSiteId) {
      return (
        <SidebarLayout title="Analytics" subtitle="Your assigned restoration site">
          <div className="page-container flex items-center justify-center py-24"><LoadingSpinner /></div>
        </SidebarLayout>
      )
    }
    return (
      <SidebarLayout title="Analytics" subtitle="Your assigned restoration site">
        <div className="page-container flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <MapPin className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-gray-800">
            {noAssignedSite ? 'No restoration site assigned yet.' : 'Analytics could not be loaded.'}
          </h1>
          <p className="text-sm text-gray-500">
            {noAssignedSite ? 'Please contact MENRO.' : 'Please try again in a moment or contact MENRO.'}
          </p>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout title="Analytics" subtitle={user?.role === 'volunteer' ? 'Read-only restoration analytics' : 'Site-level restoration analytics'}>
      <div className="page-container space-y-6">

        {/* Header */}
        <div className="animate-slide-up">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-1">Analytics</p>
          <h1 className="page-title">Restoration Analytics</h1>
          <p className="page-subtitle">
            Overview of all restoration sites — survival rates, species distribution, growth trends and ecosystem data.
          </p>
        </div>

        {/* ── Summary cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          {[
            {
              label: 'Total Sites',
              value: sites.length,
              icon: BarChart2,
              color: 'text-blue-600',
              bg: 'bg-blue-50',
              border: 'border-l-4 border-blue-500',
              tip: 'All registered restoration sites',
            },
            {
              label: 'Trees Planted',
              value: totalTrees.toLocaleString(),
              icon: TreePine,
              color: 'text-green-600',
              bg: 'bg-green-50',
              border: 'border-l-4 border-green-500',
              tip: 'Total plantation records across all sites',
            },
            {
              label: 'Avg. Survival',
              value: avgSurvival != null ? `${avgSurvival}%` : '—',
              icon: TrendingUp,
              color: avgSurvival == null ? 'text-gray-400' : avgSurvival >= 70 ? 'text-green-600' : avgSurvival >= 40 ? 'text-amber-600' : 'text-red-600',
              bg: avgSurvival == null ? 'bg-gray-50' : avgSurvival >= 70 ? 'bg-green-50' : avgSurvival >= 40 ? 'bg-amber-50' : 'bg-red-50',
              border: avgSurvival == null ? 'border-l-4 border-gray-300' : avgSurvival >= 70 ? 'border-l-4 border-green-500' : avgSurvival >= 40 ? 'border-l-4 border-amber-400' : 'border-l-4 border-red-500',
              tip: 'Trees still alive out of those planted, averaged across all sites',
            },
            {
              label: 'Total Area',
              value: `${totalHa.toFixed(1)} ha`,
              icon: Leaf,
              color: 'text-teal-600',
              bg: 'bg-teal-50',
              border: 'border-l-4 border-teal-500',
              tip: 'Combined hectares of all restoration sites',
            },
          ].map(({ label, value, icon: Icon, color, bg, border, tip }) => (
            <div key={label} className={cn('card reveal', border, bg)} title={tip}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={cn('text-2xl font-extrabold tabular-nums', color)}>{value}</p>
                  <p className="text-xs text-gray-600 mt-0.5 font-medium">{label}</p>
                </div>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
                  <Icon className={cn('w-5 h-5', color)} />
                </div>
              </div>
              {needsAttention > 0 && label === 'Avg. Survival' && (
                <p className="text-[10px] text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {needsAttention} site{needsAttention !== 1 ? 's' : ''} need attention
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── Status pills ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border',
              !statusFilter ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            All sites <span className={cn('ml-1.5 tabular-nums', !statusFilter ? 'text-white/80' : 'text-gray-400')}>{sites.length}</span>
          </button>
          {STATUS_ORDER.filter(st => counts[st] > 0).map(st => {
            const cfg = STATUS_CONFIG[st] ?? STATUS_CONFIG.active
            const active = statusFilter === st
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(active ? '' : st)}
                className={cn('px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5')}
                style={active ? { background: cfg.color, color: '#fff', borderColor: cfg.color } : { background: cfg.bg, color: cfg.text, borderColor: cfg.color + '60' }}
              >
                <cfg.Icon className="w-3 h-3" />
                {cfg.label}
                <span className="tabular-nums opacity-70">{counts[st]}</span>
              </button>
            )
          })}
        </div>

        {/* ── Search + filters + sort ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-10 pr-9"
              placeholder="Search by site name or barangay…"
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
          {barangays.length > 0 && (
            <select
              className="input py-2 text-xs min-w-[140px]"
              value={barangayFilter}
              onChange={e => setBarangayFilter(e.target.value)}
            >
              <option value="">All barangays</option>
              {barangays.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}

          {/* Sort */}
          <select
            className="input py-2 text-xs min-w-[140px]"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
          >
            <option value="name">Sort: Name</option>
            <option value="survival">Sort: Survival rate</option>
            <option value="area">Sort: Area (ha)</option>
            <option value="trees">Sort: Trees planted</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setBarangayFilter('') }}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}

          <p className="text-xs text-gray-400 ml-auto">
            {filtered.length} of {sites.length} site{sites.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* ── Empty states ────────────────────────────────────────────────────── */}
        {sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center">
              <BarChart2 className="w-8 h-8 text-gray-300" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-600 mb-1">No sites available</p>
              <p className="text-sm text-gray-400">Create restoration sites first to view analytics.</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Search className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-600">No sites match your search</p>
            <p className="text-xs text-gray-400">Try adjusting your filters or search term.</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setBarangayFilter('') }}
              className="btn-secondary text-xs px-4 py-2 mt-1"
            >
              Clear filters
            </button>
          </div>
        ) : (

          // ── Site cards grid ────────────────────────────────────────────────
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {filtered.map(site => {
              const cfg  = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active
              const tier = site.survival_rate != null ? survivalTier(site.survival_rate) : null
              const needsAttn = site.survival_rate != null && site.survival_rate < 40
              const accent = siteAccent(site.id ?? site.name)

              return (
                <Link
                  key={site.id}
                  href={`/analytics/${site.id}`}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:-translate-y-1 hover:border-gray-200 transition-all duration-200 flex flex-col overflow-hidden"
                >
                  {/* Unique per-site accent bar */}
                  <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Card header: unique site avatar + status badge + attention flag */}
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Unique site avatar */}
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
                          aria-hidden="true"
                        >
                          {siteInitials(site.name)}
                        </div>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.text }}
                        >
                          <cfg.Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                        {needsAttn && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                            <AlertTriangle className="w-2.5 h-2.5" /> Critical
                          </span>
                        )}
                        {!needsAttn && tier?.badge && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                            <AlertTriangle className="w-2.5 h-2.5" /> {tier.badge}
                          </span>
                        )}
                      </div>
                      {/* Survival ring — replaces the identical chart icon */}
                      {site.survival_rate != null
                        ? <SurvivalRing rate={site.survival_rate} />
                        : (
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gray-50">
                            <BarChart2 className="w-5 h-5 text-gray-300" />
                          </div>
                        )
                      }
                    </div>

                    {/* Site name */}
                    <h3 className="font-semibold text-gray-900 text-sm mb-3 group-hover:text-primary-700 transition-colors leading-snug">
                      {site.name}
                    </h3>

                    {/* Meta rows — darkened for readability */}
                    <div className="space-y-1.5 mb-4 flex-1">
                      {site.barangay && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
                          Brgy. {site.barangay}
                        </div>
                      )}
                      {site.area_hectares != null && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Leaf className="w-3 h-3 shrink-0 text-gray-400" />
                          {site.area_hectares} ha
                          <span className="text-gray-400 text-[10px]" title="Total area of this restoration site">area</span>
                        </div>
                      )}
                      {site.plantation_count != null && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <TreePine className="w-3 h-3 shrink-0 text-gray-400" />
                          {site.plantation_count.toLocaleString()} trees planted
                        </div>
                      )}
                      {site.survival_rate != null && tier && (
                        <div className="flex items-center gap-1.5 text-xs" title="Trees still alive out of those planted">
                          <TrendingUp className={cn('w-3 h-3 shrink-0', tier.color)} />
                          <span className={cn('font-semibold', tier.color)}>{site.survival_rate}%</span>
                          <span className="text-gray-400">survival rate</span>
                        </div>
                      )}
                    </div>

                    {/* Survival progress bar */}
                    {site.survival_rate != null && tier && (
                      <div className="mb-4">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-700', tier.bar)}
                            style={{ width: `${Math.min(site.survival_rate, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[10px] text-gray-400">0%</span>
                          <span className="text-[10px] text-gray-400">100%</span>
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <div className="flex items-center gap-1 text-xs font-semibold text-primary-600 group-hover:text-primary-700 group-hover:gap-2 transition-all duration-150 mt-auto">
                      View analytics
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
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
