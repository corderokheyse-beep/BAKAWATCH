'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { format } from 'date-fns'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Report, RestorationProject } from '@/lib/types'
import { formatDate, CATEGORY_ICONS } from '@/lib/utils'
import { FileText, Leaf, TreePine, Plus, ArrowRight, MapPin, Activity, ChevronRight } from 'lucide-react'

const MapView = nextDynamic(() => import('@/components/map/MapView'), { ssr: false })

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [myReports, setMyReports]   = useState<Report[]>([])
  const [projects, setProjects]     = useState<RestorationProject[]>([])
  const [mapReports, setMapReports] = useState<Report[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
  }, [authLoading, user]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !user) return
    const requests: Promise<any>[] = [api.get('/reports/map'), api.get('/projects/map')]
    if (user) requests.push(api.get('/my-reports'))
    Promise.all(requests).then(([mapR, projR, myR]) => {
      setMapReports(mapR.data)
      setProjects(projR.data)
      if (myR) setMyReports(myR.data.data ?? [])
    }).finally(() => setLoading(false))
  }, [authLoading, user]) // eslint-disable-line

  if (loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>

  const activeProjects = projects.filter(p => p.status === 'active').length
  const totalTrees     = projects.reduce((s, p) => s + p.trees_planted, 0)

  return (
    <SidebarLayout>
      <div className="page-container">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
            <h1 className="page-title">
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="page-subtitle">Gloria, Oriental Mindoro â€” Mangrove Monitoring Overview</p>
          </div>
          {user && (
            <Link href="/reports/new" className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Report Threat
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Total Reports"    value={mapReports.length}  icon={FileText}  color="text-blue-600"   bgColor="bg-blue-50"   accentClass="border-l-4 border-blue-500" />
          <StatCard title="Active Projects"  value={activeProjects}     icon={Leaf}      color="text-green-600"  bgColor="bg-green-50"  accentClass="border-l-4 border-green-500" />
          <StatCard title="Trees Planted"    value={totalTrees}         icon={TreePine}  color="text-teal-600"   bgColor="bg-teal-50"   accentClass="border-l-4 border-teal-500" />
          <StatCard title="Restoration Sites" value={projects.length}   icon={MapPin}    color="text-purple-600" bgColor="bg-purple-50" accentClass="border-l-4 border-purple-500" />
        </div>

        {/* Map */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="section-title">Live Map</p>
              <p className="text-xs text-gray-400 mt-0.5">Active restoration sites and field reports</p>
            </div>
            <Link href="/map" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
              Full map <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <MapView reports={mapReports} projects={projects} height="360px" />
        </div>

        {/* Bottom grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* My reports */}
          {user && (
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <p className="section-title">My Reports</p>
                <Link href="/reports" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {myReports.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">No reports yet</p>
                  <p className="text-xs text-gray-400 mb-4">Report a threat or follow up on an existing report</p>
                  <Link href="/reports/new" className="btn-primary text-xs px-4 py-2">Report Threat</Link>
                </div>
              ) : (
                <div className="space-y-1">
                  {myReports.slice(0, 5).map(r => (
                    <Link key={r.id} href={`/reports/${r.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                      <span className="text-xl w-8 text-center shrink-0">{CATEGORY_ICONS[r.category]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-700 transition-colors">{r.title}</p>
                        <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                      </div>
                      <Badge label={r.status} type="status" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Projects */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <p className="section-title">Restoration Projects</p>
              <Link href="/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <TreePine className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700">No projects yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map(p => (
                  <Link key={p.id} href={`/projects/${p.id}`}
                    className="block p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900 truncate flex-1 group-hover:text-primary-700 transition-colors">{p.name}</p>
                      <span className="text-xs font-bold text-gray-500 ml-2 tabular-nums">{p.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary-500 to-forest-600 h-1.5 rounded-full transition-all duration-700"
                        style={{ width: `${p.progress_percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 tabular-nums">
                      {p.trees_planted.toLocaleString()} / {p.trees_target.toLocaleString()} trees
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
