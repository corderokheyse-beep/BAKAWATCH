'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Badge from '@/components/ui/Badge'
import Pagination from '@/components/ui/Pagination'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Report, PaginatedResponse, ReportCategory } from '@/lib/types'
import { formatDate, CATEGORY_ICONS } from '@/lib/utils'
import { Search, MapPin, Calendar, Leaf } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ReportsPage() {
  const { user, isFieldWorker } = useAuth()
  const isBantayBakawan = isFieldWorker || user?.role === 'volunteer'
  const canReviewReports = ['admin', 'staff', 'menro'].includes(user?.role ?? '')
  const [mounted, setMounted]   = useState(false)
  const [data, setData]         = useState<PaginatedResponse<Report> | null>(null)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  // Initialized lazily after mount so SSR/client text matches,
  // then overridden to mine:true for field workers once auth resolves.
  const [filters, setFilters]   = useState({ search: '', status: '', category: '', mine: false })
  const [mineInitialized, setMineInitialized] = useState(false)

  // Prevent SSR/client mismatch
  useEffect(() => { setMounted(true) }, [])

  // Once auth resolves, set mine:true for field workers — do this exactly once
  useEffect(() => {
    if (mineInitialized || !mounted) return
    if (user === null) return          // still loading auth
    setMineInitialized(true)
    if (isBantayBakawan) {
      setFilters(f => ({ ...f, mine: true }))
    }
  }, [mounted, user, isBantayBakawan, mineInitialized])

  useEffect(() => {
    if (!mounted) return
    // Wait until the mine default has been applied for field workers
    if (isBantayBakawan && !mineInitialized) return
    fetchReports()
  }, [page, filters, mounted, mineInitialized]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchReports() {
    setLoading(true)
    try {
      const params: any = { page, ...filters }
      delete params.mine
      const endpoint = filters.mine ? '/my-reports' : '/reports'
      const { data: res } = await api.get(endpoint, { params })
      setData(res)
    } catch (err) {
      console.error('Failed to fetch reports:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleFilter(key: string, value: string | boolean) {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Field Reports</h1>
            <p className="text-gray-500 text-sm mt-1">
              {data?.total ?? 0} report{(data?.total ?? 0) !== 1 ? 's' : ''}{' '}
              {filters.mine ? 'submitted by you' : 'submitted by the community'}
            </p>
          </div>
        </div>

        {/* Filters — only rendered client-side to avoid hydration mismatch */}
        {mounted && (
          <div className="card mb-6 reveal">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  className="input pl-9"
                  placeholder="Search reports..."
                  value={filters.search}
                  onChange={e => handleFilter('search', e.target.value)}
                />
              </div>
              <select
                className="input sm:w-40"
                value={filters.status}
                onChange={e => handleFilter('status', e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                className="input sm:w-44"
                value={filters.category}
                onChange={e => handleFilter('category', e.target.value)}
              >
                <option value="">All categories</option>
                <option value="event_accomplishment">Accomplishment Reports</option>
                {(['damage', 'restoration', 'wildlife', 'pollution', 'other'] as ReportCategory[]).map(c => (
                  <option key={c} value={c}>
                    {CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {user && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleFilter('mine', !filters.mine)}
                  className={cn(
                    'w-full sm:w-auto text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all duration-150',
                    filters.mine
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50'
                  )}
                >
                  {filters.mine ? 'Showing My Reports Only' : 'Show My Reports Only'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-0 overflow-hidden animate-pulse">
                <div className="h-44 w-full bg-gray-100" />
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="h-4 w-16 rounded-full bg-gray-100" />
                    <div className="h-4 w-16 rounded-full bg-gray-100" />
                  </div>
                  <div className="h-4 w-3/4 rounded bg-gray-100" />
                  <div className="h-3 w-full rounded bg-gray-100" />
                  <div className="h-3 w-5/6 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 reveal stagger">
              {data?.data.map(report => (
                <article key={report.id}
                  className="group card p-0 overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] transition-all duration-300"
                >
                <Link
                  href={`/reports/${report.id}`}
                  className="block"
                >
                  {report.photos?.[0]?.url || report.image_url ? (
                    <div className="relative h-44 w-full overflow-hidden bg-gray-100">
                      {/* Plain <img> (not next/image) so locally-served API image URLs
                          load directly instead of 400ing through the Next optimizer. */}
                      <img
                        src={report.photos?.[0]?.url ?? report.image_url}
                        alt={report.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="h-44 bg-gradient-to-br from-primary-50 to-ocean-50 flex items-center justify-center text-5xl">
                      {CATEGORY_ICONS[report.category]}
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex gap-2 mb-2 flex-wrap">
                      <Badge label={report.status} type="status" />
                      <Badge label={report.report_type === 'event_accomplishment' ? 'Accomplishment Reports' : report.category} type="category" />
                      {report.ml_analyzed && report.ml_species && report.ml_species !== 'Unknown' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                          <Leaf className="w-3 h-3" /> {report.ml_species}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-primary-700 transition-colors">
                      {report.title}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{report.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {report.location_name ?? 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(report.created_at)}
                      </span>
                    </div>
                  </div>
                </Link>
                {(canReviewReports || (isBantayBakawan && report.user_id === user?.id)) && <Link href={`/reports/${report.id}#timeline`} className="m-4 mt-0 min-h-10 inline-flex items-center justify-center rounded-xl border border-primary-200 px-4 text-sm font-semibold text-primary-700 hover:bg-primary-50">Add Update</Link>}
                </article>
              ))}
            </div>

            {data?.data.length === 0 && (
              <div className="text-center py-16 text-gray-400 reveal">
                <p className="text-lg font-semibold text-gray-600 mb-1">
                  {filters.mine ? 'No reports submitted yet' : 'No reports found'}
                </p>
                <p className="text-sm mt-1">{filters.mine ? 'Use Report Threat, Report Accomplishment, or Add Update to create field reports.' : 'Try adjusting your filters'}</p>
              </div>
            )}

            {data && (
              <Pagination
                currentPage={data.current_page}
                lastPage={data.last_page}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </SidebarLayout>
  )
}
