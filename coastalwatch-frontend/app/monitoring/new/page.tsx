'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchMyPlantationRecords } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MonitoringForm from '@/components/forms/MonitoringForm'
import type { PlantationRecord } from '@/lib/types'

// Only field workers and MENRO officers can submit monitoring records â€” admin is view-only
const ALLOWED_ROLES = ['field_worker', 'menro', 'staff'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

function isAllowed(role?: string): role is AllowedRole {
  return ALLOWED_ROLES.includes(role as AllowedRole)
}

export default function NewMonitoringPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [records, setRecords] = useState<PlantationRecord[]>([])
  const [loading, setLoading] = useState(true)
  // Pre-select a plantation record if passed via URL query param
  const [preselectedId, setPreselectedId] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const pid = params.get('plantationId')
      if (pid) setPreselectedId(Number(pid))
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (!isAllowed(user.role)) {
      setLoading(false)
      return
    }

    fetchMyPlantationRecords()
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user, authLoading, router])

  if (authLoading || loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>
  if (!user) return null

  if (!isAllowed(user.role)) {
    return (
      <SidebarLayout>
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <span className="text-2xl">🚫</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">Access Restricted</h2>
          <p className="text-sm text-gray-500">
            Only Volunteer / Bantay Bakawan can submit monitoring and survival check-in records.
            Participants can join planting events instead.
          </p>
          <button
            onClick={() => router.push('/events')}
            className="btn-primary mt-2"
          >
            View Planting Events
          </button>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="page-container">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="page-title">New Monitoring Record</h1>
            <p className="page-subtitle">Submit a survival check-in for a planted cohort.</p>
          </div>
          <button onClick={() => router.push('/field/dashboard')} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 card">
            <MonitoringForm
              plantationRecords={records}
              preselectedId={preselectedId}
              onSuccess={(plantationRecordId) =>
                plantationRecordId
                  ? router.push(`/plantation/${plantationRecordId}`)
                  : router.push('/field/dashboard')
              }
            />
          </div>

          <aside className="card bg-primary-50/40 border-primary-100 lg:sticky lg:top-6 space-y-4">
            <div>
              <p className="section-title mb-1">Monitoring tips</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Count seedlings carefully — survival rates feed directly into site progress reports.
              </p>
            </div>
            <ul className="space-y-2.5 text-sm text-gray-600">
              <li className="flex gap-2"><span className="text-primary-600 font-bold">1.</span> Select the plantation cohort you are checking.</li>
              <li className="flex gap-2"><span className="text-primary-600 font-bold">2.</span> Record how many seedlings survived vs. the original count.</li>
              <li className="flex gap-2"><span className="text-primary-600 font-bold">3.</span> Note any threats or damage you observed.</li>
              <li className="flex gap-2"><span className="text-primary-600 font-bold">4.</span> Add a photo of the current condition if possible.</li>
            </ul>
          </aside>
        </div>
      </div>
    </SidebarLayout>
  )
}
