'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { Settings as Cog, ShieldCheck, Bell, Database, Save, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

type SettingsMap = Record<string, string | number | boolean>

// Field metadata: label, help text, input kind, and which group it belongs to.
interface FieldDef {
  key: string
  label: string
  help?: string
  kind: 'text' | 'email' | 'number' | 'toggle'
  min?: number
  max?: number
  suffix?: string
}

const GROUPS: { id: string; title: string; subtitle: string; icon: typeof Cog; fields: FieldDef[] }[] = [
  {
    id: 'general', title: 'General', subtitle: 'Platform identity and locale', icon: Cog,
    fields: [
      { key: 'app_name',          label: 'Application name',  kind: 'text',  help: 'Shown across the platform and in emails.' },
      { key: 'organization_name', label: 'Organization',      kind: 'text',  help: 'The managing office or workspace name.' },
      { key: 'support_email',     label: 'Support email',     kind: 'email', help: 'Address shown to users for help requests.' },
      { key: 'timezone',          label: 'Timezone',          kind: 'text',  help: 'IANA timezone, e.g. Asia/Manila.' },
    ],
  },
  {
    id: 'security', title: 'Security', subtitle: 'Authentication and access controls', icon: ShieldCheck,
    fields: [
      { key: 'session_lifetime_minutes', label: 'Session lifetime', kind: 'number', min: 5, max: 43200, suffix: 'minutes', help: 'How long a signed-in session stays valid.' },
      { key: 'max_login_attempts',       label: 'Max login attempts', kind: 'number', min: 1, max: 100, suffix: 'attempts', help: 'Failed attempts before a temporary lockout.' },
      { key: 'lockout_minutes',          label: 'Lockout duration', kind: 'number', min: 1, max: 1440, suffix: 'minutes', help: 'How long an account is locked after too many failures.' },
    ],
  },
  {
    id: 'notifications', title: 'Notifications', subtitle: 'How the platform notifies users', icon: Bell,
    fields: [
      { key: 'email_notifications_enabled', label: 'Email notifications', kind: 'toggle', help: 'Send email notifications (requires a configured mailer).' },
      { key: 'push_notifications_enabled',  label: 'Push notifications',  kind: 'toggle', help: 'Send push notifications via Firebase Cloud Messaging.' },
    ],
  },
  {
    id: 'backups', title: 'Backups', subtitle: 'Data protection policy', icon: Database,
    fields: [
      { key: 'backup_retention_days', label: 'Backup retention', kind: 'number', min: 1, max: 365, suffix: 'days', help: 'How long verified snapshots are kept before pruning.' },
    ],
  },
]

export default function AdminSettingsPage() {
  const { isStaff, loading: authLoading, user } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SettingsMap>({})
  const [original, setOriginal] = useState<SettingsMap>({})

  useEffect(() => {
    if (authLoading) return
    if (user !== null && !isStaff) router.replace('/login')
  }, [authLoading, user, isStaff]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isStaff) { if (!isStaff) setLoading(false); return }
    loadSettings().finally(() => setLoading(false))
  }, [authLoading, isStaff]) // eslint-disable-line

  async function loadSettings() {
    try {
      const { data } = await api.get('/admin/settings')
      setSettings(data.settings ?? {})
      setOriginal(data.settings ?? {})
    } catch { toast.error('Failed to load settings') }
  }

  const dirty = JSON.stringify(settings) !== JSON.stringify(original)

  function setValue(key: string, value: string | number | boolean) {
    setSettings(s => ({ ...s, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const { data } = await api.patch('/admin/settings', settings)
      setSettings(data.settings ?? settings)
      setOriginal(data.settings ?? settings)
      toast.success('Settings saved')
    } catch (e: any) {
      const errors = e?.response?.data?.errors
      toast.error(errors ? Object.values(errors).flat().join(' ') : 'Failed to save settings')
    } finally { setSaving(false) }
  }

  function reset() { setSettings(original) }

  if (authLoading || loading) return (
    <SidebarLayout title="System Settings">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="System Settings" subtitle="Configure the platform">
      <div className="page-container space-y-6 max-w-3xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-in">
          <div>
            <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest">Configuration</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">System settings</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage platform-wide configuration and policies.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} disabled={!dirty || saving}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            <button onClick={save} disabled={!dirty || saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Groups */}
        {GROUPS.map(group => {
          const GroupIcon = group.icon
          return (
            <div key={group.id} className="card">
              <div className="flex items-center gap-3 mb-5">
                <span className="p-2.5 rounded-xl bg-primary-50 text-primary-600 shrink-0">
                  <GroupIcon className="w-5 h-5" />
                </span>
                <div>
                  <p className="section-title">{group.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{group.subtitle}</p>
                </div>
              </div>

              <div className="space-y-5">
                {group.fields.map(f => (
                  <div key={f.key} className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <label className="text-sm font-semibold text-gray-800">{f.label}</label>
                      {f.help && <p className="text-xs text-gray-400 mt-0.5">{f.help}</p>}
                    </div>

                    <div className="w-56 shrink-0">
                      {f.kind === 'toggle' ? (
                        <Toggle
                          checked={!!settings[f.key]}
                          onChange={v => setValue(f.key, v)}
                        />
                      ) : f.kind === 'number' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={f.min} max={f.max}
                            className="input w-full"
                            value={settings[f.key] as number ?? ''}
                            onChange={e => setValue(f.key, e.target.value === '' ? '' as any : Number(e.target.value))}
                          />
                          {f.suffix && <span className="text-xs text-gray-400 whitespace-nowrap">{f.suffix}</span>}
                        </div>
                      ) : (
                        <input
                          type={f.kind === 'email' ? 'email' : 'text'}
                          className="input w-full"
                          value={(settings[f.key] as string) ?? ''}
                          onChange={e => setValue(f.key, e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {dirty && (
          <p className="text-xs text-amber-600 text-right">You have unsaved changes.</p>
        )}
      </div>
    </SidebarLayout>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-primary-600' : 'bg-gray-300'
      )}>
      <span className={cn(
        'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0.5'
      )} />
    </button>
  )
}
