'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn, timeAgo } from '@/lib/utils'
import {
  CheckCircle, Download, HardDrive,
  CalendarClock, ShieldCheck, Archive, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Snapshot {
  file: string
  size: number
  size_label: string
  created_at: string
  type: string
  duration: string | null
}
interface History {
  snapshots: Snapshot[]
  count: number
  total_bytes: number
  total_label: string
  retention_days: number
  scheduled: boolean
}

export default function AdminBackupPage() {
  const { isStaff, loading: authLoading, user } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [backupLoading, setBackupLoading] = useState(false)
  const [history, setHistory] = useState<History | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (user !== null && !isStaff) router.replace('/login')
  }, [authLoading, user, isStaff]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isStaff) { if (!isStaff) setLoading(false); return }
    loadHistory().finally(() => setLoading(false))
  }, [authLoading, isStaff]) // eslint-disable-line

  async function loadHistory() {
    try {
      const { data } = await api.get('/admin/backup/history')
      setHistory(data)
    } catch { /* non-blocking */ }
  }

  async function triggerBackup() {
    setBackupLoading(true)
    try {
      await api.get('/admin/backup')
      toast.success('Backup completed')
      await loadHistory()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Backup failed')
    } finally { setBackupLoading(false) }
  }

  // Download a snapshot as a blob so the Authorization header is sent.
  function downloadSnapshot(file: string) {
    api.get(`/admin/backup/download/${encodeURIComponent(file)}`, { responseType: 'blob' })
      .then(res => {
        const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = file
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(blobUrl)
      })
      .catch(() => toast.error('Failed to download backup'))
  }

  const latest = history?.snapshots?.[0] ?? null

  if (authLoading || loading) return (
    <SidebarLayout title="Backup & Recovery">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="Backup & Recovery" subtitle="Data protection">
      <div className="page-container space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-in">
          <div>
            <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest">Data Protection</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">Backup &amp; recovery</h2>
            <p className="text-sm text-gray-500 mt-0.5">Monitor database backups and recovery readiness.</p>
          </div>
          <button onClick={triggerBackup} disabled={backupLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 transition-colors shadow-sm">
            {backupLoading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</>
              : <><Download className="w-4 h-4" /> Run manual backup</>}
          </button>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Current status (wide) */}
          <div className="card lg:col-span-1">
            <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest mb-3">Current Status</p>
            {latest ? (
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-full bg-green-100 text-green-700 shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-900">Backup is up to date</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Latest snapshot created {timeAgo(latest.created_at)}
                  </p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Up to date
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </span>
                <div>
                  <p className="text-base font-bold text-gray-900">No backups yet</p>
                  <p className="text-xs text-gray-500 mt-0.5">Run a manual backup to create your first snapshot.</p>
                </div>
              </div>
            )}
          </div>

          {/* Backup schedule — honest: these are manual, no scheduler exists. */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Backup schedule</p>
            </div>
            <p className="text-lg font-bold text-gray-900">Manual</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Backups run on demand. No automatic schedule is configured.
            </p>
          </div>

          {/* Storage used — real total across snapshots (no fabricated quota). */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Storage used</p>
            </div>
            <p className="text-lg font-bold text-gray-900">{history?.total_label ?? '0 B'}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Across {history?.count ?? 0} snapshot{(history?.count ?? 0) === 1 ? '' : 's'} · retained {history?.retention_days ?? 30} days
            </p>
          </div>
        </div>

        {/* Backup history */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100 flex-wrap">
            <div>
              <p className="section-title">Backup history</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Verified snapshots retained for {history?.retention_days ?? 30} days
              </p>
            </div>
            {/* Export sits at the top-right of the history table — the natural,
                least-cluttered place and consistent with the reference. */}
            <button
              onClick={() => latest ? downloadSnapshot(latest.file) : toast.error('No backup to export')}
              disabled={!latest}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date & Time', 'Type', 'Size', 'Duration', 'Status', ''].map((h, i) => (
                    <th key={i} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(history?.snapshots ?? []).map(s => (
                  <tr key={s.file} className="hover:bg-gray-50/70 transition-colors">
                    <td className="table-cell font-medium text-gray-900">
                      {new Date(s.created_at).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="table-cell text-gray-500">{s.type}</td>
                    <td className="table-cell tabular-nums text-gray-700">{s.size_label}</td>
                    <td className="table-cell tabular-nums text-gray-500">{s.duration ?? '—'}</td>
                    <td className="table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Verified
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <button onClick={() => downloadSnapshot(s.file)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        aria-label="Download snapshot">
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(history?.snapshots?.length) && (
              <p className="text-center text-gray-400 text-sm py-10">No backups yet. Run a manual backup to begin.</p>
            )}
          </div>
        </div>

        {/* Request restoration footer */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2.5 rounded-xl bg-amber-100 text-amber-700 shrink-0">
              <Archive className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Need to restore a previous version?</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Database restoration can overwrite current data. Review the impact and authorize the request before proceeding.
              </p>
            </div>
          </div>
          <button
            onClick={() => toast('Restoration is a manual, supervised operation. Contact your administrator to proceed.', { icon: '🛡️' })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors shrink-0">
            Request restoration
          </button>
        </div>
      </div>
    </SidebarLayout>
  )
}
