'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchSites } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EcosystemForm from '@/components/forms/EcosystemForm'
import type { RestorationSite } from '@/lib/types'

const ALLOWED_ROLES = ['field_worker', 'menro'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

function isAllowed(role?: string): role is AllowedRole {
  return ALLOWED_ROLES.includes(role as AllowedRole)
}

export default function NewEcosystemPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites]   = useState<RestorationSite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (!isAllowed(user.role)) return

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
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-gray-500 text-lg">Access denied.</p>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">New Ecosystem Record</h1>
        <div className="card">
          <EcosystemForm
            sites={sites}
            onSuccess={() => router.push('/dashboard')}
          />
        </div>
      </div>
    </SidebarLayout>
  )
}
