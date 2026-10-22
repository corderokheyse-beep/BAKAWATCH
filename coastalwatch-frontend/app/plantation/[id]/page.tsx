'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/lib/auth-context'
import { fetchMyPlantationRecords } from '@/lib/mangrove-api'
import api from '@/lib/api'
import type { PlantationRecord, MonitoringRecord } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  TreePine, MapPin, CalendarDays, Leaf, Activity,
  ChevronLeft, AlertTriangle, CheckCircle2, ImageOff,
} from 'lucide-react'

export default function PlantationRecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [record, setRecord]         = useState<PlantationRecord | null>(null)
  const [monitoring, setMonitoring] = useState<MonitoringRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
  }, [authLoading, user, router])

  useEffect(() => {
    if (authLoading || !user) return

    const recordId = Number(id)

    // Step 1: find the plantation record from the user's own list
    fetchMyPlantationRecords()
      .then(list => {
        const rec = list.find(r => r.id === recordId) ?? null
        if (!rec) { setNotFound(true); setLoading(false); return }
        setRecord(rec)

        // Step 2: fetch all monitoring records for the site, then filter to this plantation record
        api.get(`/sites/${rec.restoration_site_id}/monitoring-records`)
          .then(res => {
            const all: MonitoringRecord[] = res.data?.data ?? res.data ?? []
            // Filter to only records that belong to this plantation record
            const mine = all.filter(m => m.plantation_record_id === recordId)
            setMonitoring(mine)
          })
          .catch(() => setMonitoring([]))
          .finally(() => setLoading(false))
      })
      .catch(() => {
        setNotFound(true)
        setLoading(false)
      })
  }, [authLoading, user, id]) // eslint-disable-line

  if (authLoading || loading) return (
    <SidebarLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    </SidebarLayout>
  )

  if (notFound || !record) {
    return (
      <SidebarLayout>
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-3">
          <TreePine className="w-12 h-12 text-gray-300 mx-auto" />
          <h2 className="text-lg font-bold text-gray-900">Record not found</h2>
          <p className="text-sm text-gray-500">
            This plantation record doesn't exist or you don't have access to it.
          </p>
          <button onClick={() => router.back()} className="btn-secondary mt-2">Go back</button>
        </div>
      </SidebarLayout>
    )
  }

  const sortedMonitoring = [...monitoring].sort(
    (a, b) => new Date(b.monitoring_date).getTime() - new Date(a.monitoring_date).getTime()
  )

  return (
    <SidebarLayout>
      <div className="page-container space-y-5">

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title italic">{record.species_name}</h1>
            {record.site && (
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                {record.site.name}
              </p>
            )}
          </div>
          <Badge label={record.status} type="status" />
        </div>

        {/* Two-column layout: summary (left) + monitoring history (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Left column: photo + details */}
        <div className="space-y-5 lg:sticky lg:top-6">

        {/* Photo */}
        {record.image_url ? (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
            <img
              src={record.image_url}
              alt={record.species_name}
              className="w-full max-h-72 object-cover"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center h-36 text-gray-300 gap-2">
            <ImageOff className="w-8 h-8" />
            <p className="text-xs text-gray-400">No photo attached</p>
          </div>
        )}

        {/* Details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Planting Details</p>
          </div>
          <div className="divide-y divide-gray-50">

            <div className="px-5 py-3.5 flex items-center gap-3">
              <CalendarDays className="w-4 h-4 text-primary-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date Planted</p>
                <p className="text-sm font-semibold text-gray-800">{formatDate(record.date_planted)}</p>
              </div>
            </div>

            <div className="px-5 py-3.5 flex items-center gap-3">
              <MapPin className="w-4 h-4 text-primary-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">GPS Coordinates</p>
                <p className="text-sm font-semibold text-gray-800 font-mono">
                  {record.latitude?.toFixed(6)}, {record.longitude?.toFixed(6)}
                </p>
                {record.geo_mismatch && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3" /> Outside site boundary — flagged for review
                  </p>
                )}
              </div>
            </div>

            {record.seedling_source && (
              <div className="px-5 py-3.5 flex items-center gap-3">
                <Leaf className="w-4 h-4 text-green-500 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Seedling Source</p>
                  <p className="text-sm font-semibold text-gray-800">{record.seedling_source}</p>
                </div>
              </div>
            )}

            {record.mortality_date && (
              <div className="px-5 py-3.5 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Mortality Date</p>
                  <p className="text-sm font-semibold text-red-700">{formatDate(record.mortality_date)}</p>
                </div>
              </div>
            )}

          </div>
        </div>

        </div>{/* === end left column === */}

        {/* Right column: monitoring history */}
        <div className="space-y-5">

        {/* Monitoring history */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-500" />
              <p className="text-sm font-bold text-gray-900">Monitoring History</p>
            </div>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {monitoring.length} check{monitoring.length !== 1 ? 's' : ''}
            </span>
          </div>

          {sortedMonitoring.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-600 mb-1">No monitoring checks yet</p>
              <p className="text-xs text-gray-400 mb-4">
                Record a survival check to start tracking this tree's growth
              </p>
              <Link href={`/monitoring/new?plantationId=${record.id}`} className="btn-primary text-sm inline-flex gap-2">
                <Activity className="w-4 h-4" /> Log First Check
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {sortedMonitoring.map((m, idx) => (
                <div key={m.id} className="px-5 py-4 flex items-start gap-3">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center
                      ${m.survival_status === 'alive' ? 'bg-green-50' : 'bg-red-50'}`}>
                      {m.survival_status === 'alive'
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : <AlertTriangle className="w-4 h-4 text-red-500" />}
                    </div>
                    {idx < sortedMonitoring.length - 1 && (
                      <div className="w-0.5 h-full min-h-[16px] bg-gray-100 mt-1" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold capitalize px-2 py-0.5 rounded-full
                        ${m.survival_status === 'alive'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'}`}>
                        {m.survival_status}
                      </span>
                      <span className="text-xs text-gray-500 capitalize bg-gray-100 px-2 py-0.5 rounded-full">
                        {m.growth_stage}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-1">
                      {m.height_cm != null && (
                        <span>Height: <strong className="text-gray-700">{m.height_cm} cm</strong></span>
                      )}
                      {m.diameter_cm != null && (
                        <span>Diameter: <strong className="text-gray-700">{m.diameter_cm} cm</strong></span>
                      )}
                    </div>

                    {m.disease_observation && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mb-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {m.disease_observation}
                      </p>
                    )}

                    <p className="text-xs text-gray-400">{formatDate(m.monitoring_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Link
            href={`/monitoring/new?plantationId=${record.id}`}
            className="btn-primary flex-1 justify-center gap-2 text-sm"
          >
            <Activity className="w-4 h-4" /> Log Monitoring Check
          </Link>
          <Link
            href="/field/dashboard"
            className="btn-secondary text-sm"
          >
            Back to Dashboard
          </Link>
        </div>

        </div>{/* === end right column === */}
        </div>{/* === end grid === */}

      </div>
    </SidebarLayout>
  )
}
