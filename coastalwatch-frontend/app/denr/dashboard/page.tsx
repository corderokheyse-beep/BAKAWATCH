'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/lib/auth-context'
import { fetchSites } from '@/lib/mangrove-api'
import type { RestorationSite } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  MapPin, Leaf, TreePine, TrendingUp, BarChart2, ChevronRight, ShieldCheck, Eye,
} from 'lucide-react'

const SitePolygonMap = nextDynamic(() => import('@/components/map/SitePolygonMap'), { ssr: false })

export default function DenrDashboardPage() {
  const { user, isDenr, loading: authLoading } = useAuth()
  const router = useRouter()
  const [sites, setSites]     = useState<RestorationSite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
    else if (!isDenr) router.replace('/login')
  }, [authLoading, user, isDenr]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isDenr) return
    fetchSites().then(setSites).catch(() => {}).finally(() => setLoading(false))
  }, [authLoading, isDenr]) // eslint-disable-line

  if (authLoading || loading) return (
    <SidebarLayout title="DENR Dashboard" subtitle="Authorized Agency Review">
      <div className="page-container flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const activeSites  = sites.filter(s => s.status === 'active').length
  const totalPlanted = sites.reduce((s, site) => s + (site.plantation_count ?? 0), 0)
  const avgSurvival  = sites.length
    ? Math.round(sites.reduce((s, site) => s + (site.survival_rate ?? 0), 0) / sites.length)
    : 0

  return (
    <SidebarLayout title={`Welcome, ${user?.name?.split(' ')[0]}`} subtitle="DENR Evaluator — Authorized Review">
      <div className="page-container space-y-8">

        {/* Read-only access banner */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 p-5">
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-blue-900">DENR Authorized Review Access</p>
                <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Eye className="w-2.5 h-2.5" /> Read-only
                </span>
              </div>
              <p className="text-xs text-blue-700">
                Review authorized monitoring data, analytics, and generated reports. This role does not submit or edit field records.
              </p>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          {[
            { title: 'Total Sites',   value: sites.length,      icon: MapPin,     color: 'text-blue-600',   bgColor: 'bg-blue-50',   accentClass: 'border-l-4 border-blue-500 reveal' },
            { title: 'Active Sites',  value: activeSites,       icon: Leaf,       color: 'text-green-600',  bgColor: 'bg-green-50',  accentClass: 'border-l-4 border-green-500 reveal' },
            { title: 'Trees Planted', value: totalPlanted,      icon: TreePine,   color: 'text-teal-600',   bgColor: 'bg-teal-50',   accentClass: 'border-l-4 border-teal-500 reveal' },
            { title: 'Avg. Survival', value: `${avgSurvival}%`, icon: TrendingUp, color: 'text-purple-600', bgColor: 'bg-purple-50', accentClass: 'border-l-4 border-purple-500 reveal' },
          ].map(card => <StatCard key={card.title} {...card} />)}
        </div>

        {/* Map + sites list */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="reveal lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="text-sm font-bold text-gray-900">Restoration Sites Map</p>
                <p className="text-xs text-gray-400 mt-0.5">All sites in Gloria, Oriental Mindoro</p>
              </div>
              <Link href="/sites" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                All sites <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex-1 min-h-[320px]">
              <SitePolygonMap sites={sites} height="100%" />
            </div>
          </div>

          <div className="reveal lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">Sites & Survival</p>
              <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                <BarChart2 className="w-3.5 h-3.5" /> Analytics
              </Link>
            </div>
            <div className="p-3 space-y-1 stagger">
              {sites.map(site => (
                <Link key={site.id} href={`/analytics/${site.id}`}
                  className="group flex items-center gap-2.5 p-2.5 rounded-xl transition-all duration-200 hover:bg-blue-50/50 hover:-translate-y-0.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Leaf className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-blue-700">{site.name}</p>
                    {site.barangay && <p className="text-[10px] text-gray-400">{site.barangay}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {site.survival_rate != null && (
                      <span className="text-[10px] font-bold text-blue-600 tabular-nums">{site.survival_rate}%</span>
                    )}
                    <Badge label={site.status} type="status" />
                  </div>
                </Link>
              ))}
              {sites.length === 0 && <p className="text-center text-sm text-gray-400 py-6">No sites available.</p>}
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
