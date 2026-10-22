'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/lib/auth-context'
import { fetchMyMonitoringRecords } from '@/lib/mangrove-api'
import type { MonitoringRecord } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  Activity, Plus, Search, X, ChevronRight,
  CheckCircle2, AlertTriangle, TreePine, Leaf,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MyMonitoringPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [records, setRecords]           = useState<MonitoringRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
  }, [authLoading, user, router])

  useEffect(() => {
    if (authLoading || !user) return
    fetchMyMonitoringRecords()
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [authLoading, user]) // eslint-disable-line

  const filtered = records.filter(r => {
    if (statusFilter && r.survival_status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const species = (r as any).plantation_record?.species_name?.toLowerCase() ?? ''
      if (!species.includes(q)) return false
    }
    return true
  })

  const aliveCount = records.filter(r => r.survival_status === 'alive').length
  const deadCount  = records.filter(r => r.survival_status === 'dead').length

  if (authLoading || loading) return (
    <SidebarLayout title="My Monitoring Records">
      <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="My Monitoring Records" subtitle="Your submitted monitoring checks">
      <div className="page-container space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="page-title">My Monitoring Records</h1>
            <p className="page-subtitle">
              {records.length} check{records.length !== 1 ? 's' : ''} submitted
            </p>
          </div>
          <Link href="/monitoring/new" className="btn-primary text-sm group shrink-0">
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
            New Check
          </Link>
        </div>

        {/* Compact summary row — most important number first */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: records.length, cls: 'text-gray-900' },
            { label: 'Alive', value: aliveCount,     cls: 'text-green-600' },
            { label: 'Dead',  value: deadCount,      cls: 'text-red-500' },
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
              { key: '',      label: `All (${records.length})`,  color: '' },
              { key: 'alive', label: `Alive (${aliveCount})`,    color: 'text-green-700 bg-green-50 border-green-200' },
              { key: 'dead',  label: `Dead (${deadCount})`,      color: 'text-red-700 bg-red-50 border-red-200' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150',
                  statusFilter === key
                    ? key === '' ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                    : color + ' shadow-sm scale-[1.02]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9 pr-9"
              placeholder="Search by species name…"
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

        {/* Records grid */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16">
            <div className="w-14 h-14 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Activity className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">
              {records.length === 0 ? 'No monitoring checks yet' : 'No records match your filters'}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {records.length === 0
                ? 'Start by logging a survival check for a planted tree'
                : 'Try adjusting your search or filters'}
            </p>
            {records.length === 0 && (
              <Link href="/monitoring/new" className="btn-primary text-sm inline-flex gap-2">
                <Plus className="w-4 h-4" /> Log a Check
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(r => {
                const plantationRecord = (r as any).plantation_record
                const isAlive = r.survival_status === 'alive'
                return (
                  <Link
                    key={r.id}
                    href={`/plantation/${r.plantation_record_id}`}
                    className="flex items-start gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
                  >
                    {/* Status icon */}
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                      isAlive ? 'bg-green-50' : 'bg-red-50'
                    )}>
                      {isAlive
                        ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                        : <AlertTriangle className="w-5 h-5 text-red-500" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Species */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Leaf className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <p className="text-sm font-semibold text-gray-900 italic truncate group-hover:text-primary-700 transition-colors">
                          {plantationRecord?.species_name ?? `Plantation #${r.plantation_record_id}`}
                        </p>
                      </div>

                      {/* Metrics row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-1">
                        <span className={cn(
                          'font-semibold capitalize',
                          isAlive ? 'text-green-600' : 'text-red-600'
                        )}>
                          {r.survival_status}
                        </span>
                        <span className="capitalize text-gray-400">{r.growth_stage}</span>
                        {r.height_cm != null && (
                          <span>Height: <strong className="text-gray-700">{r.height_cm} cm</strong></span>
                        )}
                        {r.diameter_cm != null && (
                          <span>Diameter: <strong className="text-gray-700">{r.diameter_cm} cm</strong></span>
                        )}
                      </div>

                      {/* Disease */}
                      {r.disease_observation && (
                        <p className="text-xs text-amber-600 flex items-center gap-1 mb-0.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          {r.disease_observation}
                        </p>
                      )}

                      <p className="text-xs text-gray-400">{formatDate(r.monitoring_date)}</p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-3" />
                  </Link>
                )
              })}
          </div>
        )}

      </div>
    </SidebarLayout>
  )
}
