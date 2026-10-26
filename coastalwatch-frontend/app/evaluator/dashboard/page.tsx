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
import WeatherForecastCard from '@/components/dashboard/WeatherForecastCard'
import { useAuth } from '@/lib/auth-context'
import { fetchSites, fetchSpecies } from '@/lib/mangrove-api'
import type { RestorationSite, MangroveSpecies } from '@/lib/types'
import {
  MapPin, Leaf, TreePine, TrendingUp, BarChart2, ChevronRight, Microscope, Eye, Brain,
} from 'lucide-react'

const SitePolygonMap = nextDynamic(() => import('@/components/map/SitePolygonMap'), { ssr: false })

export default function EvaluatorDashboardPage() {
  const { user, isEvaluator, loading: authLoading } = useAuth()
  const router = useRouter()
  const [sites, setSites]       = useState<RestorationSite[]>([])
  const [species, setSpecies]   = useState<MangroveSpecies[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
    else if (!isEvaluator) router.replace('/login')
  }, [authLoading, user, isEvaluator]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isEvaluator) return
    Promise.all([fetchSites(), fetchSpecies()])
      .then(([s, sp]) => { setSites(s); setSpecies(sp) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [authLoading, isEvaluator]) // eslint-disable-line

  if (authLoading || loading) return (
    <SidebarLayout title="Evaluator Dashboard" subtitle="Scientific Review">
      <div className="page-container flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const totalPlanted = sites.reduce((s, site) => s + (site.plantation_count ?? 0), 0)
  const avgSurvival  = sites.length
    ? Math.round(sites.reduce((s, site) => s + (site.survival_rate ?? 0), 0) / sites.length)
    : 0
  const mlSpecies = species.filter(s => s.ml_supported).length

  return (
    <SidebarLayout title={`Welcome, ${user?.name?.split(' ')[0]}`} subtitle="Research Evaluator — Scientific Review">
      <div className="page-container space-y-8">

        <WeatherForecastCard />

        {/* Evaluator access banner */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50 via-fuchsia-50 to-indigo-50 p-5">
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
              <Microscope className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-purple-900">Research Evaluator Access</p>
                <span className="inline-flex items-center gap-1 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Eye className="w-2.5 h-2.5" /> Review & validate
                </span>
              </div>
              <p className="text-xs text-purple-700">
                Review monitoring data and analytics, and validate AI species classifications. Field data submission and administration are out of scope.
              </p>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          {[
            { title: 'Total Sites',    value: sites.length,      icon: MapPin,     color: 'text-blue-600',   bgColor: 'bg-blue-50',    accentClass: 'border-l-4 border-blue-500 reveal' },
            { title: 'Trees Planted',  value: totalPlanted,      icon: TreePine,   color: 'text-teal-600',   bgColor: 'bg-teal-50',    accentClass: 'border-l-4 border-teal-500 reveal' },
            { title: 'Avg. Survival',  value: `${avgSurvival}%`, icon: TrendingUp, color: 'text-purple-600', bgColor: 'bg-purple-50',  accentClass: 'border-l-4 border-purple-500 reveal' },
            { title: 'ML Species',     value: mlSpecies,         icon: Brain,      color: 'text-fuchsia-600',bgColor: 'bg-fuchsia-50', accentClass: 'border-l-4 border-fuchsia-500 reveal' },
          ].map(card => <StatCard key={card.title} {...card} />)}
        </div>

        {/* Map + species review */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="reveal lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="text-sm font-bold text-gray-900">Restoration Sites Map</p>
                <p className="text-xs text-gray-400 mt-0.5">Select a site to review its analytics</p>
              </div>
              <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                <BarChart2 className="w-3.5 h-3.5" /> Analytics
              </Link>
            </div>
            <div className="flex-1 min-h-[320px]">
              <SitePolygonMap sites={sites} height="100%" />
            </div>
          </div>

          <div className="reveal lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-600" />
              <p className="text-sm font-bold text-gray-900">Species Reference</p>
            </div>
            <div className="p-3 space-y-1 stagger">
              {species.map(sp => (
                <div key={sp.id} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-purple-50/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold italic text-gray-800 truncate">{sp.scientific_name}</p>
                    {sp.local_name && <p className="text-[10px] text-gray-400">{sp.local_name}</p>}
                  </div>
                  {sp.ml_supported && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">AI</span>
                  )}
                </div>
              ))}
              {species.length === 0 && <p className="text-center text-sm text-gray-400 py-6">No species reference available.</p>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">
                AI species classifications on threat reports can be confirmed, corrected, or rejected during review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
