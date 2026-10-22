'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/lib/auth-context'
import {
  fetchAdminAnnouncements, createAnnouncement,
  updateAnnouncement, deleteAnnouncement,
} from '@/lib/mangrove-api'
import type { Announcement, AnnouncementType } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Megaphone, X, Loader2, CheckCircle2, AlertTriangle, Info, Bell } from 'lucide-react'
import toast from 'react-hot-toast'

const TYPE_STYLES: Record<AnnouncementType, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  info:    { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200',   icon: Info },
  warning: { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200',  icon: AlertTriangle },
  success: { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200',  icon: CheckCircle2 },
  urgent:  { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200',    icon: Bell },
}

interface FormState {
  title: string
  content: string
  type: AnnouncementType
  is_active: boolean
  expires_at: string
  target_roles: string
}

const emptyForm = (): FormState => ({
  title: '', content: '', type: 'info', is_active: true, expires_at: '', target_roles: '',
})

export default function AnnouncementsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const isManager = user?.role === 'admin' || user?.role === 'staff' || user?.role === 'menro'

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (!isManager) { router.replace('/login'); return }
    load()
  }, [authLoading, user]) // eslint-disable-line

  const load = () => {
    setLoading(true)
    fetchAdminAnnouncements()
      .then(setAnnouncements)
      .catch(() => toast.error('Failed to load announcements'))
      .finally(() => setLoading(false))
  }

  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowForm(true) }
  const openEdit = (a: Announcement) => {
    setEditing(a)
    setForm({
      title: a.title, content: a.content, type: a.type,
      is_active: a.is_active,
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
      target_roles: a.target_roles ?? '',
    })
    setShowForm(true)
  }

  const handleDelete = async (a: Announcement) => {
    if (!confirm(`Delete "${a.title}"?`)) return
    try {
      await deleteAnnouncement(a.id)
      toast.success('Deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Title and content required'); return }
    setSaving(true)
    try {
      const payload: Partial<Announcement> = {
        title:        form.title,
        content:      form.content,
        type:         form.type,
        is_active:    form.is_active,
        expires_at:   form.expires_at || undefined,
        target_roles: form.target_roles || undefined,
      }
      if (editing) {
        await updateAnnouncement(editing.id, payload)
        toast.success('Announcement updated!')
      } else {
        await createAnnouncement(payload)
        toast.success('Announcement created!')
      }
      setShowForm(false)
      load()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) return (
    <SidebarLayout title="Announcements" subtitle="System announcements for BAKAWATCH users">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="Announcements" subtitle="Post system-wide announcements to BAKAWATCH users">
      <div className="page-container space-y-6">

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
          <button onClick={openNew} className="btn-primary gap-1.5">
            <Plus className="w-4 h-4" /> New Announcement
          </button>
        </div>

        {announcements.length === 0 ? (
          <div className="text-center py-20">
            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No announcements yet</p>
            <button onClick={openNew} className="btn-primary mt-4 text-sm">Create First Announcement</button>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => {
              const style  = TYPE_STYLES[a.type]
              const IconEl = style.icon
              return (
                <div key={a.id} className={`rounded-2xl border p-4 ${style.bg} ${style.border}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${style.text} bg-white/60`}>
                      <IconEl className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className={`font-bold text-sm ${style.text}`}>{a.title}</p>
                        {!a.is_active && (
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Inactive</span>
                        )}
                        {a.expires_at && (
                          <span className="text-[10px] bg-white/60 text-gray-600 px-2 py-0.5 rounded-full">
                            Expires {formatDate(a.expires_at)}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs leading-relaxed ${style.text} opacity-80`}>{a.content}</p>
                      {a.target_roles && (
                        <p className="text-[10px] text-gray-500 mt-1">Targets: {a.target_roles}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">{formatDate(a.created_at)} · by {a.author?.name}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-white/60 transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                      <button onClick={() => handleDelete(a)} className="p-1.5 rounded-lg hover:bg-red-100 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Announcement' : 'New Announcement'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input className="input" placeholder="Announcement title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Content *</label>
                <textarea className="input" rows={4} placeholder="Announcement message..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AnnouncementType }))}>
                    <option value="info">ℹ️ Info</option>
                    <option value="success">✅ Success</option>
                    <option value="warning">⚠️ Warning</option>
                    <option value="urgent">🔔 Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="label">Expires At (optional)</label>
                  <input type="datetime-local" className="input" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Target Roles (comma-separated, blank = all)</label>
                <input className="input" placeholder="e.g. field_worker,volunteer" value={form.target_roles} onChange={e => setForm(f => ({ ...f, target_roles: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Leave blank to show to all users. Roles: admin, staff, menro, field_worker, volunteer</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-primary-600 rounded" />
                <span className="text-sm text-gray-700 font-medium">Active (visible to users)</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> {editing ? 'Update' : 'Post'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
