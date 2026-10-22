'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchSites } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PlantationForm from '@/components/forms/PlantationForm'
import type { RestorationSite } from '@/lib/types'

// Only field workers and MENRO officers can submit plantation records â€” admin is view-only
const ALLOWED_ROLES = ['field_worker', 'menro', 'staff'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

function isAllowed(role?: string): role is AllowedRole {
  return ALLOWED_ROLES.includes(role as AllowedRole)
}

export default function NewPlantationPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites]     = useState<RestorationSite[]>([])
  const [loading, setLoading] = useState(true)

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

    fetchSites()
      .then(setSites)
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
            Only Volunteer / Bantay Bakawan and MENRO Admin can submit plantation records.
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
            <h1 className="page-title">New Plantation Record</h1>
            <p className="page-subtitle">Log a mangrove planting with GPS, species, and source.</p>
          </div>
          <button onClick={() => router.push('/plantation')} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Form — spans two of three columns on desktop */}
          <div className="lg:col-span-2 card">
            <PlantationForm
              sites={sites}
              onSuccess={() => router.push('/plantation')}
            />
          </div>

          {/* Helper side panel — fills the previously-wasted whitespace */}
          <aside className="card bg-primary-50/40 border-primary-100 lg:sticky lg:top-6 space-y-4">
            <div>
              <p className="section-title mb-1">Recording tips</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Stand at the planting spot before capturing GPS for the most accurate location.
              </p>
            </div>
            <ul className="space-y-2.5 text-sm text-gray-600">
              <li className="flex gap-2"><span className="text-primary-600 font-bold">1.</span> Pick the correct restoration site and species.</li>
              <li className="flex gap-2"><span className="text-primary-600 font-bold">2.</span> Capture GPS on-site; manual coordinates are flagged for review.</li>
              <li className="flex gap-2"><span className="text-primary-600 font-bold">3.</span> Select the seedling source (Provincial, PENRO, or Nursery).</li>
              <li className="flex gap-2"><span className="text-primary-600 font-bold">4.</span> Add a photo and notes if you have them.</li>
            </ul>
            <p className="text-xs text-gray-400 border-t border-primary-100 pt-3">
              Off-boundary records are never rejected — they are accepted and flagged for a reviewer.
            </p>
          </aside>
        </div>
      </div>
    </SidebarLayout>
  )
}
