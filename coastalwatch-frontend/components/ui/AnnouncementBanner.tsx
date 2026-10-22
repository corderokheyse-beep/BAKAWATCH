'use client'

import { useEffect, useState } from 'react'
import { fetchAnnouncements } from '@/lib/mangrove-api'
import type { Announcement } from '@/lib/types'
import { X, Info, AlertTriangle, CheckCircle2, Bell } from 'lucide-react'

const TYPE_STYLES = {
  info:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   icon: Info },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  icon: AlertTriangle },
  success: { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  icon: CheckCircle2 },
  urgent:  { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800',    icon: Bell },
}

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissed, setDismissed]         = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchAnnouncements().then(setAnnouncements).catch(() => {})
  }, [])

  const visible = announcements.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2 px-6 pt-4">
      {visible.map(a => {
        const style  = TYPE_STYLES[a.type] ?? TYPE_STYLES.info
        const IconEl = style.icon
        return (
          <div key={a.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${style.bg} ${style.border}`}
            role="alert">
            <IconEl className={`w-4 h-4 mt-0.5 shrink-0 ${style.text}`} />
            <div className="flex-1 min-w-0">
              <span className={`font-bold ${style.text}`}>{a.title}: </span>
              <span className={`${style.text} opacity-90`}>{a.content}</span>
            </div>
            <button
              onClick={() => setDismissed(prev => new Set([...prev, a.id]))}
              className={`p-1 rounded-lg hover:bg-black/5 transition-colors shrink-0 ${style.text}`}
              aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
