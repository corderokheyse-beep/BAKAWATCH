'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { RestorationProject, PaginatedResponse } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Plus, Search, MapPin, Users, TreePine } from 'lucide-react'

export default function ProjectsPage() {
  const { isStaff } = useAuth()
  const [data, setData]       = useState<PaginatedResponse<RestorationProject> | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')

  useEffect(() => { fetchProjects() }, [page, search]) // eslint-disable-line

  async function fetchProjects() {
    setLoading(true)
    try {
      const { data: res } = await api.get('/projects', { params: { page, search } })
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Restoration Projects</h1>
            <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} active and planned projects</p>
          </div>
          {isStaff && (
            <Link href="/projects/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Project
            </Link>
          )}
        </div>

        <div className="card mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Search projects…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data?.data.map(project => (
                <Link key={project.id} href={`/projects/${project.id}`} className="card hover:shadow-md transition-shadow group p-0 overflow-hidden">
                  {project.image_url ? (
                    <div className="h-44 relative">
                      <img src={project.image_url} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ) : (
                    <div className="h-44 bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center text-5xl">ðŸŒ¿</div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <Badge label={project.status} type="status" />
                      <span className="text-xs text-gray-400">{formatDate(project.created_at)}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{project.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-4">{project.description}</p>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Progress</span>
                        <span>{project.progress_percent}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-primary-500 h-2 rounded-full transition-all" style={{ width: `${project.progress_percent}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1"><TreePine className="w-3 h-3" />{project.trees_planted.toLocaleString()} / {project.trees_target.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{project.volunteers_count ?? 0} volunteers</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                      <MapPin className="w-3 h-3" />{project.location_name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {data?.data.length === 0 && (
              <div className="text-center py-16 text-gray-400">No projects found</div>
            )}

            {data && <Pagination currentPage={data.current_page} lastPage={data.last_page} onPageChange={setPage} />}
          </>
        )}
      </div>
    </SidebarLayout>
  )
}
