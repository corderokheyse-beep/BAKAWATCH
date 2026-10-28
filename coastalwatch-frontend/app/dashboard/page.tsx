'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { format } from 'date-fns'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import WeatherForecastCard from '@/components/dashboard/WeatherForecastCard'
import MonitoringTimeline from '@/components/reports/MonitoringTimeline'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Report, RestorationSite } from '@/lib/types'
import { formatDate, CATEGORY_ICONS, getReportPhotoUrls, cn } from '@/lib/utils'
import {
  FileText, Leaf, TreePine, Plus, ArrowRight, MapPin,
  Activity, ChevronRight, Radio, RefreshCw, X, Clock,
  ShieldAlert, Sprout, CheckCircle, Maximize2,
} from 'lucide-react'

const CoastalMapView = nextDynamic(
  () => import('@/components/map/CoastalMapView'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-[420px] bg-gray-50"><LoadingSpinner /></div> }
)

const SEVERITY_UI: Record<string, { bg: string; border: string; text: string; radius: number }> = {
  low:      { bg: '#fefce8', border: '#fde68a', text: '#a16207', radius: 25 },
  medium:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', radius: 60 },
  high:     { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', radius: 120 },
  critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', radius: 200 },
}

function affectedRadiusMeters(r: Report): number {
  if (r.affected_radius_m != null && r.affected_radius_m > 0) return r.affected_radius_m
  return SEVERITY_UI[r.severity ?? 'medium']?.radius ?? SEVERITY_UI.medium.radius
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [myReports, setMyReports]     = useState<Report[]>([])
  const [sites, setSites]             = useState<RestorationSite[]>([])
  const [mapReports, setMapReports]   = useState<Report[]>([])
  const [publicStats, setPublicStats] = useState<{ total_reports?: number; active_projects?: number; trees_planted?: number } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [selectedSite, setSelectedSite]     = useState<RestorationSite | null>(null)
  const [showTimeline, setShowTimeline]     = useState(false)
  const [lightboxUrl, setLightboxUrl]       = useState<string | null>(null)
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Record<string, boolean>>({})
  const [layers, setLayers] = useState({
    showSites: true,
    showBarangays: true,
    showMangroveZones: false,
  })

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
  }, [authLoading, user]) // eslint-disable-line

  const loadDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [mapR, sitesR, statsR, myR] = await Promise.all([
        api.get('/reports/map').catch(() => ({ data: [] })),
        api.get('/sites').catch(() => ({ data: [] })),
        api.get('/public/stats').catch(() => ({ data: null })),
        user ? api.get('/my-reports').catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
      ])
      setMapReports(Array.isArray(mapR.data) ? mapR.data : [])
      setSites(Array.isArray(sitesR.data) ? sitesR.data : [])
      if (statsR?.data) setPublicStats(statsR.data)
      if (myR?.data) setMyReports(myR.data.data ?? [])
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading || !user) return
    loadDashboardData(false)
    const interval = setInterval(() => loadDashboardData(true), 30_000)
    return () => clearInterval(interval)
  }, [authLoading, user, loadDashboardData])

  async function handleReportClick(r: Report) {
    setSelectedReport(r)
    setSelectedSite(null)
    setShowTimeline(false)
    try {
      const { data } = await api.get(`/reports/${r.id}`)
      setSelectedReport(prev => {
        if (!prev || prev.id !== r.id) return prev
        return {
          ...prev,
          ...(data ?? {}),
          photos: data?.photos ?? prev.photos,
          image_url: data?.image_url ?? prev.image_url,
        }
      })
    } catch {
      // keep existing report payload
    }
  }

  async function handleSiteClick(s: RestorationSite) {
    setSelectedSite(s)
    setSelectedReport(null)
    try {
      const { data } = await api.get(`/sites/${s.id}`)
      setSelectedSite(prev => {
        if (!prev || prev.id !== s.id) return prev
        return {
          ...prev,
          ...(data.site ?? {}),
          plantation_count: data.plantation_count ?? prev.plantation_count,
          survival_rate: data.survival?.survival_rate ?? prev.survival_rate,
          species: data.species ?? [],
          site_species: data.site_species ?? prev.site_species ?? [],
          species_list_count: data.site_species_count ?? prev.species_list_count,
        }
      })
    } catch {
      // keep list site payload
    }
  }

  function closePanel() {
    setSelectedReport(null)
    setSelectedSite(null)
    setShowTimeline(false)
  }

  if (loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>

  const activeSitesCount = sites.filter(s => s.status === 'active').length
  const totalTreesPlanted = publicStats?.trees_planted ?? sites.reduce((sum, s) => sum + (s.plantation_count ?? 0), 0)
  const selectedReportPhotoUrls = getReportPhotoUrls(selectedReport).filter(url => !failedPhotoUrls[url])

  return (
    <SidebarLayout>
      <div className="page-container">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
            <h1 className="page-title">
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="page-subtitle">Gloria, Oriental Mindoro — Mangrove Monitoring Overview</p>
          </div>
          {user && (
            <Link href="/reports/new" className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Report Threat
            </Link>
          )}
        </div>

        <div className="mb-8">
          <WeatherForecastCard />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Total Reports"     value={mapReports.length}                     icon={FileText} color="text-blue-600"   bgColor="bg-blue-50"   accentClass="border-l-4 border-blue-500" />
          <StatCard title="Active Projects"   value={activeSitesCount}                      icon={Leaf}     color="text-green-600"  bgColor="bg-green-50"  accentClass="border-l-4 border-green-500" />
          <StatCard title="Trees Planted"     value={totalTreesPlanted.toLocaleString()}    icon={TreePine} color="text-teal-600"   bgColor="bg-teal-50"   accentClass="border-l-4 border-teal-500" />
          <StatCard title="Restoration Sites" value={sites.length}                          icon={MapPin}   color="text-purple-600" bgColor="bg-purple-50" accentClass="border-l-4 border-purple-500" />
        </div>

        {/* Interactive Live Map */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-green-500 animate-pulse" />
                <p className="section-title">Live Map</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                  Live
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Active restoration sites and field reports · {mapReports.length} reports · {sites.length} sites
                {lastUpdated && (
                  <span className="ml-1 text-gray-300">
                    · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={layers.showSites}
                  onChange={e => setLayers(l => ({ ...l, showSites: e.target.checked }))}
                  className="rounded text-primary-600 w-3 h-3"
                />
                Sites
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={layers.showBarangays}
                  onChange={e => setLayers(l => ({ ...l, showBarangays: e.target.checked }))}
                  className="rounded text-primary-600 w-3 h-3"
                />
                Barangays
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={layers.showMangroveZones}
                  onChange={e => setLayers(l => ({ ...l, showMangroveZones: e.target.checked }))}
                  className="rounded text-primary-600 w-3 h-3"
                />
                Mangrove Zones
              </label>
              <button
                type="button"
                onClick={() => loadDashboardData(true)}
                disabled={refreshing}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
                Refresh
              </button>
              <Link href="/map" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors ml-1">
                Full map <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 min-w-0 relative">
              <CoastalMapView
                reports={mapReports}
                sites={sites}
                height="440px"
                showBarangays={layers.showBarangays}
                showSites={layers.showSites}
                showMangroveZones={layers.showMangroveZones}
                onReportClick={handleReportClick}
                onSiteClick={handleSiteClick}
                selectedReportId={selectedReport?.id}
                selectedSiteId={selectedSite?.id}
                lastUpdated={lastUpdated}
              />
            </div>

            {(selectedReport || selectedSite) && (
              <div className="w-full lg:w-80 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-gray-100 max-h-[440px] overflow-y-auto">
                {selectedReport && (
                  <div className="animate-fade-in">
                    <div className="flex items-start justify-between px-4 pt-4 pb-3 gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-2xl shrink-0 mt-0.5">{CATEGORY_ICONS[selectedReport.category]}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{selectedReport.title}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge label={selectedReport.status} type="status" />
                            <Badge label={selectedReport.category} type="category" />
                          </div>
                        </div>
                      </div>
                      <button onClick={closePanel} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>

                    {selectedReportPhotoUrls.length > 0 && (
                      <div className={`grid gap-1 ${selectedReportPhotoUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {selectedReportPhotoUrls.map((url, index) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setLightboxUrl(url)}
                            className="relative aspect-[4/3] w-full bg-gray-100 overflow-hidden group cursor-zoom-in"
                          >
                            <img
                              src={url}
                              alt={`${selectedReport.title} photo ${index + 1}`}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={() => setFailedPhotoUrls(prev => ({ ...prev, [url]: true }))}
                            />
                            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-white bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                              <Maximize2 className="w-2.5 h-2.5" /> Zoom
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="px-4 py-3 space-y-2.5">
                      <p className="text-sm text-gray-600 leading-relaxed">{selectedReport.description}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl p-2.5 border" style={{
                          background: SEVERITY_UI[selectedReport.severity ?? 'medium'].bg,
                          borderColor: SEVERITY_UI[selectedReport.severity ?? 'medium'].border,
                        }}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <ShieldAlert className="w-3 h-3" style={{ color: SEVERITY_UI[selectedReport.severity ?? 'medium'].text }} />
                            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SEVERITY_UI[selectedReport.severity ?? 'medium'].text }}>Severity</p>
                          </div>
                          <p className="text-sm font-extrabold capitalize" style={{ color: SEVERITY_UI[selectedReport.severity ?? 'medium'].text }}>
                            {selectedReport.severity ?? 'medium'}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Radio className="w-3 h-3 text-gray-500" />
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Affected Area</p>
                          </div>
                          <p className="text-sm font-extrabold text-gray-800">~{affectedRadiusMeters(selectedReport)} m radius</p>
                        </div>
                      </div>

                      {selectedReport.location_name && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                          {selectedReport.location_name}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {formatDate(selectedReport.created_at)}
                      </div>
                      {selectedReport.admin_notes && (
                        <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100 text-xs text-blue-700">
                          <span className="font-semibold">Admin note: </span>{selectedReport.admin_notes}
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowTimeline(v => !v)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-100"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          {showTimeline ? 'Hide history' : 'Monitoring history'}
                        </button>
                        <Link
                          href={`/reports/${selectedReport.id}`}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-primary-50 border border-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-100"
                        >
                          Details <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>

                      {showTimeline && (
                        <div className="pt-2 border-t border-gray-100">
                          <MonitoringTimeline
                            reportId={selectedReport.id}
                            reportStatus={selectedReport.status}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedSite && (
                  <div className="animate-fade-in">
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2 border-b border-green-100 bg-green-50/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
                          <Sprout className="w-5 h-5 text-white" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{selectedSite.name}</p>
                          {selectedSite.barangay && (
                            <p className="text-xs text-gray-500 mt-0.5">Brgy. {selectedSite.barangay}, Gloria</p>
                          )}
                        </div>
                      </div>
                      <button onClick={closePanel} className="p-1 rounded-lg hover:bg-black/10 transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {selectedSite.area_hectares != null && (
                          <div className="bg-green-50 rounded-xl p-2.5 border border-green-100">
                            <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Area</p>
                            <p className="text-sm font-extrabold text-green-800">{selectedSite.area_hectares} ha</p>
                          </div>
                        )}
                        <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Species</p>
                          <p className="text-sm font-extrabold text-blue-800">
                            {selectedSite.site_species?.length ?? selectedSite.species_list_count ?? selectedSite.species_list?.length ?? 0}
                          </p>
                        </div>
                        {selectedSite.plantation_count != null && (
                          <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Planted</p>
                            <p className="text-sm font-extrabold text-emerald-800">{selectedSite.plantation_count}</p>
                          </div>
                        )}
                        {selectedSite.survival_rate != null && (
                          <div className="bg-teal-50 rounded-xl p-2.5 border border-teal-100">
                            <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Survival</p>
                            <p className="text-sm font-extrabold text-teal-800">{selectedSite.survival_rate}%</p>
                          </div>
                        )}
                      </div>
                      {selectedSite.description && (
                        <p className="text-xs text-gray-500 leading-relaxed">{selectedSite.description}</p>
                      )}
                      <Link
                        href={`/sites/${selectedSite.id}`}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary-50 border border-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-100"
                      >
                        View site details <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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

          {/* Restoration Sites */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <p className="section-title">Restoration Sites</p>
              <Link href="/sites" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {sites.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <TreePine className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700">No restoration sites yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sites.slice(0, 5).map(s => (
                  <Link key={s.id} href={`/sites/${s.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-700 transition-colors">
                        {s.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.barangay ? `Brgy. ${s.barangay}` : 'Gloria'}
                        {s.area_hectares != null ? ` · ${s.area_hectares} ha` : ''}
                      </p>
                    </div>
                    <Badge label={s.status} type="status" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lightbox modal */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Close photo preview"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxUrl}
              alt="Full size report photo"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
