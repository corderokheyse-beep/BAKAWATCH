'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, CheckCheck, X, FileText, Calendar, Building2,
  CheckCircle, XCircle, Megaphone, TreePine, Volume2, UserCheck, PenLine, AlertTriangle,
} from 'lucide-react'
import { useNotifications } from '@/lib/useNotifications'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import type { Notification } from '@/lib/types'

// ─── Icon + colour per notification type ─────────────────────────────────────
const TYPE_CONFIG: Record<string, {
  icon: React.ReactNode
  bg: string
  text: string
  label: string
}> = {
  report_status: {
    icon: <FileText className="w-4 h-4" />,
    bg: 'bg-blue-100', text: 'text-blue-600',
    label: 'Report Update',
  },
  new_threat_report: {
    icon: <AlertTriangle className="w-4 h-4" />,
    bg: 'bg-orange-100', text: 'text-orange-600',
    label: 'New Threat Report',
  },
  event_cancelled: {
    icon: <XCircle className="w-4 h-4" />,
    bg: 'bg-red-100', text: 'text-red-600',
    label: 'Event Cancelled',
  },
  event_deleted: {
    icon: <XCircle className="w-4 h-4" />,
    bg: 'bg-red-100', text: 'text-red-600',
    label: 'Event Deleted',
  },
  new_event: {
    icon: <Calendar className="w-4 h-4" />,
    bg: 'bg-green-100', text: 'text-green-600',
    label: 'New Event',
  },
  event_request_submitted: {
    icon: <Building2 className="w-4 h-4" />,
    bg: 'bg-amber-100', text: 'text-amber-600',
    label: 'Event Request',
  },
  event_request_updated: {
    icon: <PenLine className="w-4 h-4" />,
    bg: 'bg-sky-100', text: 'text-sky-600',
    label: 'Event Request Updated',
  },
  event_request_cancelled: {
    icon: <XCircle className="w-4 h-4" />,
    bg: 'bg-red-100', text: 'text-red-600',
    label: 'Event Request Cancelled',
  },
  event_request_reviewed: {
    icon: <CheckCircle className="w-4 h-4" />,
    bg: 'bg-violet-100', text: 'text-violet-600',
    label: 'Request Reviewed',
  },
  event_registration: {
    icon: <UserCheck className="w-4 h-4" />,
    bg: 'bg-teal-100', text: 'text-teal-600',
    label: 'Registration',
  },
  event_registration_submitted: {
    icon: <UserCheck className="w-4 h-4" />,
    bg: 'bg-teal-100', text: 'text-teal-600',
    label: 'Event Registration',
  },
  event_updated: {
    icon: <PenLine className="w-4 h-4" />,
    bg: 'bg-sky-100', text: 'text-sky-600',
    label: 'Event Updated',
  },
}

const DEFAULT_CONFIG = {
  icon: <Megaphone className="w-4 h-4" />,
  bg: 'bg-gray-100', text: 'text-gray-600',
  label: 'Notification',
}

// ─── Navigation target per notification type ──────────────────────────────────
function getNotificationUrl(n: Notification): string | null {
  const d = n.data
  switch (d.type) {
    // Admin/staff: go to Events → Requests tab, expand the specific request
    case 'event_request_submitted':
      return d.request_id ? `/events?tab=requests&request_id=${d.request_id}` : '/events?tab=requests'

    case 'event_request_updated':
    case 'event_request_cancelled':
      return d.request_id ? `/events?tab=requests&request_id=${d.request_id}` : '/events?tab=requests'

    // Admin/staff: same — a request was reviewed
    case 'event_request_reviewed':
      return d.request_id ? `/events?tab=requests&request_id=${d.request_id}` : '/events?tab=requests'

    // Participant/volunteer: go to the specific event
    case 'new_event':
      return d.event_id ? `/events?event_id=${d.event_id}` : '/events'

    case 'event_cancelled':
    case 'event_deleted':
      return '/events'

    case 'event_registration':
      return d.event_id ? `/events?event_id=${d.event_id}` : '/events'

    case 'event_registration_submitted':
      return d.event_id
        ? `/events?event_id=${d.event_id}${d.registration_id ? `&registration_id=${d.registration_id}` : ''}`
        : '/events'

    case 'event_updated':
      return d.event_id ? `/events?event_id=${d.event_id}` : '/events'

    // Field reports
    case 'report_status':
      return d.report_id ? `/reports/${d.report_id}` : '/reports'

    case 'new_threat_report':
      return d.report_id ? `/reports/${d.report_id}` : '/reports'

    default:
      return null
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function NotificationItem({
  n,
  onRead,
  onNavigate,
}: {
  n: Notification
  onRead: (id: string) => void
  onNavigate: (url: string) => void
}) {
  const isRead = !!n.read_at
  const cfg    = TYPE_CONFIG[n.data.type] ?? DEFAULT_CONFIG
  const url    = getNotificationUrl(n)

  function handleClick() {
    if (!isRead) onRead(n.id)
    if (url) onNavigate(url)
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
        url ? 'hover:bg-primary-50/60' : 'hover:bg-gray-50',
        !isRead && 'bg-primary-50/50 border-l-2 border-primary-400'
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className={cn('mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0', cfg.bg, cfg.text)}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-bold uppercase tracking-wide mb-0.5', cfg.text)}>
          {cfg.label}
        </p>
        <p className={cn(
          'text-sm text-gray-700 leading-snug',
          !isRead && 'font-medium',
          url && 'group-hover:text-primary-700 transition-colors',
        )}>
          {n.data.message}
        </p>
        {n.data.admin_notes && (
          <p className="text-xs text-gray-400 mt-0.5 italic line-clamp-1">
            Note: {n.data.admin_notes}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-gray-400">{timeAgo(n.created_at)}</p>
          {url && (
            <span className="text-[10px] font-semibold text-primary-500 group-hover:text-primary-700 transition-colors">
              View →
            </span>
          )}
        </div>
      </div>

      {/* Unread dot */}
      {!isRead && (
        <span className="mt-2 w-2 h-2 rounded-full bg-primary-500 shrink-0 animate-pulse" />
      )}
    </div>
  )
}

export default function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead, playNotificationSound } = useNotifications()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    if (!open) fetchNotifications()
    setOpen(o => !o)
  }

  function handleNavigate(url: string) {
    setOpen(false)
    router.push(url)
  }

  // Group: unread first, then read
  const sorted = [...notifications].sort((a, b) => {
    if (!a.read_at && b.read_at) return -1
    if (a.read_at && !b.read_at) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={cn(
          'relative p-2 rounded-xl transition-all duration-150 text-gray-600',
          open ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-100',
          unreadCount > 0 && user?.role !== 'volunteer' && 'animate-[wiggle_0.4s_ease-in-out]'
        )}
        aria-label="Notifications"
      >
        <Bell className={cn('w-5 h-5 transition-transform', unreadCount > 0 && 'text-primary-600')} />
        {unreadCount > 0 && user?.role !== 'volunteer' && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none px-1 shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-[340px] bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-gray-100 z-50 animate-scale-in overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-bold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Test sound button */}
              <button
                onClick={() => playNotificationSound()}
                title="Test notification sound"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors font-semibold"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="py-10 text-center">
                <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-400">Loading…</p>
              </div>
            ) : sorted.length === 0 ? (
              <div className="py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <TreePine className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">All caught up!</p>
                <p className="text-xs text-gray-400 mt-0.5">No notifications yet.</p>
              </div>
            ) : (
              sorted.map(n => (
                <NotificationItem key={n.id} n={n} onRead={markRead} onNavigate={handleNavigate} />
              ))
            )}
          </div>

          {/* Footer */}
          {sorted.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-center">
              <p className="text-xs text-gray-400">
                {sorted.length} notification{sorted.length !== 1 ? 's' : ''} · click to mark as read
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
