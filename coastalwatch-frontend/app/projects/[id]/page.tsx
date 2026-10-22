'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { RestorationProject, ProjectUpdate } from '@/lib/types'
import { formatDate, timeAgo } from '@/lib/utils'
import { ArrowLeft, MapPin, Calendar, Users, TreePine, UserPlus, UserMinus } from 'lucide-react'
import toast from 'react-hot-toast'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

export default function ProjectDetailPage() {
  const { id }    = useParams()
  const router    = useRouter()
  const { user }  = useAuth()
  const [project, setProject]   = useState<RestorationProject & { updates?: ProjectUpdate[]; volunteer_users?: any[] } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [isVolunteer, setIsVolunteer] = useState(false)
  const [joining, setJoining]   = useState(false)

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then(r => {
        setProject(r.data)
        if (user) {
          setIsVolunteer(r.data.volunteer_users?.some((v: any) => v.id === user.id) ?? false)
        }
      })
      .catch(() => router.push('/projects'))
      .finally(() => setLoading(false))
  }, [id]) // eslint-disable-line

  async function toggleVolunteer() {
    if (!project) return
    setJoining(true)
    try {
      if (isVolunteer) {
        await api.delete(`/projects/${project.id}/leave`)
        toast.success('Left the project')
        setIsVolunteer(false)
      } else {
        await api.post(`/projects/${project.id}/join`)
        toast.success('Joined as volunteer!')
        setIsVolunteer(true)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Action failed')
    } finally {
      setJoining(false)
    }
  }

  if (loading) return <SidebarLayout><LoadingSpinner /></SidebarLayout>
  if (!project) return null

  return (
    <SidebarLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to projects
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {project.image_url && (
              <img src={project.image_url} alt={project.name} className="w-full h-64 object-cover rounded-xl" />
            )}

            <div className="card">
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge label={project.status} type="status" />
                {project.area_hectares && (
                  <span className="badge bg-teal-100 text-teal-800">{project.area_hectares} ha</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">{project.name}</h1>
              <p className="text-gray-600 leading-relaxed mb-6">{project.description}</p>

              {/* Progress */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                  <span>Planting Progress</span>
                  <span>{project.progress_percent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                  <div className="bg-primary-500 h-3 rounded-full transition-all" style={{ width: `${project.progress_percent}%` }} />
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{project.trees_planted.toLocaleString()} trees planted</span>
                  <span>Goal: {project.trees_target.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="card p-0 overflow-hidden">
              <MapView
                projects={[project]}
                height="260px"
                center={[project.latitude, project.longitude]}
                zoom={13}
              />
            </div>

            {/* Updates */}
            {project.updates && project.updates.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-4">Project Updates</h3>
                <div className="space-y-4">
                  {project.updates.map(update => (
                    <div key={update.id} className="border-l-2 border-primary-200 pl-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm text-gray-900">{update.title}</p>
                        <span className="text-xs text-gray-400">{timeAgo(update.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-600">{update.content}</p>
                      {update.trees_planted_update > 0 && (
                        <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
                          <TreePine className="w-3 h-3" /> +{update.trees_planted_update} trees planted
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-800">Project Info</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                  <span>{project.location_name}</span>
                </div>
                {project.start_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{formatDate(project.start_date)} {project.end_date ? `→ ${formatDate(project.end_date)}` : ''}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span>{project.volunteer_users?.length ?? 0} volunteers</span>
                </div>
                <div className="flex items-center gap-2">
                  <TreePine className="w-4 h-4 text-gray-400" />
                  <span>{project.trees_planted.toLocaleString()} / {project.trees_target.toLocaleString()} trees</span>
                </div>
              </div>
            </div>

            {user && (
              <button
                onClick={toggleVolunteer}
                disabled={joining}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                  isVolunteer
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    : 'btn-primary'
                }`}
              >
                {isVolunteer ? <><UserMinus className="w-4 h-4" /> Leave Project</> : <><UserPlus className="w-4 h-4" /> Join as Volunteer</>}
              </button>
            )}

            {/* Volunteers list */}
            {project.volunteer_users && project.volunteer_users.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">Volunteers</h3>
                <div className="space-y-2">
                  {project.volunteer_users.slice(0, 8).map((v: any) => (
                    <div key={v.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                        {v.name[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-700">{v.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
