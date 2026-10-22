'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import SidebarLayout from '@/components/layout/SidebarLayout'
import StatCard from '@/components/ui/StatCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/lib/auth-context'
import { fetchOpenEvents, fetchMyRegistrations } from '@/lib/mangrove-api'
import api from '@/lib/api'
import type { PlantingEvent } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  CalendarDays, TreePine, ArrowRight, Clock,
  CheckCircle2, Building2, CalendarCheck, FileText,
  CheckCircle, XCircle, AlertCircle,
} from 'lucide-react'

interface EventRequest {
  id: number
  event_name: string
  preferred_date: string
  status: 'pending' | 'approved' | 'rejected'
  organization_name?: string
  created_at: string
}

export default function VolunteerDashboardPage() {
  const { user, isVolunteer, loading: authLoading } = useAuth()
  const router = useRouter()

  const [events, setEvents]               = useState<PlantingEvent[]>([])
  const [registrations, setRegistrations] = useState<{ planting_event_id: number; registration_status: string; event?: { status?: string } }[]>([])
  const [myRequests, setMyRequests]       = useState<EventRequest[]>([])
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/login')
    else if (!isVolunteer) router.replace('/login')
  }, [authLoading, user, isVolunteer]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isVolunteer) return
    Promise.all([
      fetchOpenEvents(),
      fetchMyRegistrations(),
      api.get('/event-requests/mine').then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    ])
      .then(([evts, regs, reqs]) => {
        setEvents(evts)
        setRegistrations(regs)
        setMyRequests(reqs)
      })
      .finally(() => setLoading(false))
  }, [authLoading, isVolunteer]) // eslint-disable-line

  const firstName = user?.name?.split(' ')[0] ?? 'Participant'

  if (authLoading || loading) return (
    <SidebarLayout title={`Welcome, ${firstName}!`} subtitle="Participant Dashboard">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const confirmedRegs = registrations.filter(r => r.registration_status === 'confirmed' && r.event?.status !== 'cancelled')
  const pendingRequests = myRequests.filter(r => r.status === 'pending')

  const registeredEventIds = new Set(registrations.map(r => r.planting_event_id))
  const myEvents       = events.filter(e => registeredEventIds.has(e.id))
  const upcomingEvents = events.filter(e => !registeredEventIds.has(e.id))

  const REQUEST_STATUS_CONFIG = {
    pending:  { icon: Clock,         color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Pending Review' },
    approved: { icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200',  label: 'Approved' },
    rejected: { icon: XCircle,       color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    label: 'Rejected' },
  }

  return (
    <SidebarLayout title={`Welcome, ${firstName}!`} subtitle="Participant Dashboard">
      <div className="page-container space-y-8">

        {/* Date */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest animate-slide-up">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <StatCard
            title="Events Joined"
            value={confirmedRegs.length}
            icon={CalendarCheck}
            color="text-green-600"
            bgColor="bg-green-50"
            accentClass="border-l-4 border-green-500 reveal"
          />
          <StatCard
            title="Pending Requests"
            value={pendingRequests.length}
            icon={Clock}
            color="text-amber-600"
            bgColor="bg-amber-50"
            accentClass="border-l-4 border-amber-500 reveal"
          />
          <StatCard
            title="My Joined Events"
            value={confirmedRegs.length}
            icon={CalendarDays}
            color="text-blue-600"
            bgColor="bg-blue-50"
            accentClass="border-l-4 border-blue-500 reveal"
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 reveal">
          <Link href="/events" className="btn-primary group">
            <CalendarDays className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
            View Planting Events
          </Link>
          <Link href="/events/request" className="group inline-flex items-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-500 hover:bg-amber-100 hover:shadow-md">
            <Building2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
            Request Event
          </Link>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 reveal">

          {/* My Registered Events */}
          <div className="card transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.09)] hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-5">
              <p className="section-title">My Joined Events</p>
              <Link href="/volunteer/joined-events" className="group text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                All joined events <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {myEvents.length === 0 ? (
              <div className="text-center py-10">
                <CalendarCheck className="w-8 h-8 text-gray-300 mx-auto mb-2 animate-float" />
                <p className="text-sm text-gray-500">No joined events yet</p>
                <p className="text-xs text-gray-400 mt-1">Browse upcoming events and join one</p>
                <Link href="/events" className="btn-primary mt-4 inline-flex text-xs px-4 py-2">
                  Browse Events
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {myEvents.slice(0, 5).map(event => {
                  const reg = registrations.find(r => r.planting_event_id === event.id)
                  const isPending = reg?.registration_status === 'pending_approval'
                  return (
                    <div key={event.id}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                      <div className={`w-10 h-12 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm
                        ${isPending ? 'bg-gradient-to-b from-amber-400 to-amber-600' : 'bg-gradient-to-b from-primary-500 to-primary-700'}`}>
                        <span className="text-[9px] font-bold uppercase opacity-80 leading-none">
                          {format(parseISO(event.scheduled_at.replace(' ', 'T')), 'MMM')}
                        </span>
                        <span className="text-lg font-extrabold leading-tight">
                          {format(parseISO(event.scheduled_at.replace(' ', 'T')), 'd')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{event.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(event.scheduled_at)}</p>
                      </div>
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                          <Clock className="w-2.5 h-2.5" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Confirmed
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Upcoming Events to Join */}
          <div className="card transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.09)] hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-5">
              <p className="section-title">Upcoming Events</p>
              <Link href="/events" className="group text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                See all <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="text-center py-10">
                <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2 animate-float" />
                <p className="text-sm text-gray-500">
                  {events.length === 0 ? 'No open events right now' : 'You\'ve joined all available events!'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Check back soon for new activities</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.slice(0, 5).map(event => (
                  <Link key={event.id} href="/events"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm group">
                    <div className="w-10 h-12 bg-gradient-to-b from-primary-500 to-primary-700 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm">
                      <span className="text-[9px] font-bold uppercase opacity-80 leading-none">
                        {format(parseISO(event.scheduled_at.replace(' ', 'T')), 'MMM')}
                      </span>
                      <span className="text-lg font-extrabold leading-tight">
                        {format(parseISO(event.scheduled_at.replace(' ', 'T')), 'd')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-700 transition-colors">{event.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{event.remaining_capacity ?? 0} spots left</span>
                        {event.is_from_request && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                            Community
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge label={event.status} type="status" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* My Event Requests */}
        {myRequests.length > 0 && (
          <div className="card reveal transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.09)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <p className="section-title">My Event Requests</p>
              </div>
              <Link href="/volunteer/requests" className="group text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                New request <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="space-y-2">
              {myRequests.slice(0, 5).map(req => {
                const cfg = REQUEST_STATUS_CONFIG[req.status] ?? REQUEST_STATUS_CONFIG.pending
                const Icon = cfg.icon
                return (
                  <Link key={req.id} href="/volunteer/requests"
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-50 hover:bg-gray-50 transition-all duration-200">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.border} border`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{req.event_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Preferred: {req.preferred_date ? formatDate(req.preferred_date) : '—'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                      {cfg.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </SidebarLayout>
  )
}




