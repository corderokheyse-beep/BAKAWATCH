'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { cn, timeAgo } from '@/lib/utils'
import type { User } from '@/lib/types'
import {
  Search, UserPlus, X, SlidersHorizontal, MoreHorizontal,
  Pencil, Eye, UserX, UserCheck, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Roles display labels (read-only — roles are set at registration/invitation)
const ROLE_DISPLAY: Record<string, string> = {
  admin:        'Super Admin',
  staff:        'MENRO Admin (Staff)',
  menro:        'MENRO Admin',
  field_worker: 'Volunteer / Bantay Bakawan',
  volunteer:    'Participant',
  user:         'Community Member',
  public:       'Community Member (Public)',
  denr:         'DENR Evaluator',
  evaluator:    'Research Evaluator',
}

// Role options available in the Filters dropdown.
const ROLE_FILTERS: { value: string; label: string }[] = [
  { value: '',             label: 'All roles' },
  { value: 'admin',        label: 'Super Admin' },
  { value: 'menro',        label: 'MENRO Admin' },
  { value: 'staff',        label: 'MENRO Admin (Staff)' },
  { value: 'field_worker', label: 'Volunteer / Bantay Bakawan' },
  { value: 'volunteer',    label: 'Participant' },
  { value: 'denr',         label: 'DENR Evaluator' },
  { value: 'evaluator',    label: 'Research Evaluator' },
  { value: 'user',         label: 'Community Member' },
]

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '',         label: 'All statuses' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

// Assignable roles for new user creation
const CREATE_ROLES = ['field_worker', 'volunteer'] as const

// Roles assignable when editing an existing user. "Super Admin", "MENRO Admin
// (Staff)", and "Community Member" are intentionally excluded here.
const EDIT_ROLES = ['menro', 'field_worker', 'volunteer'] as const

type UserForm = { name: string; email: string; password: string; role: string }
const emptyUserForm = (): UserForm => ({ name: '', email: '', password: '', role: 'field_worker' })

type EditForm = { name: string; role: string; phone: string; organization: string }

type Summary = { total: number; active: number; inactive: number; menro_admins: number }
type UserRow = User & { reports_count: number; last_active_at: string | null }

export default function AdminUsersPage() {
  const { isStaff, loading: authLoading, user } = useAuth()
  const router = useRouter()

  const [users, setUsers] = useState<any>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)

  // Filters
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Create user modal
  const [userModal, setUserModal] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm())
  const [userSubmitting, setUserSubmitting] = useState(false)

  // Edit modal
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', role: '', phone: '', organization: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)

  // View modal
  const [viewTarget, setViewTarget] = useState<UserRow | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const activeFilterCount = (roleFilter ? 1 : 0) + (statusFilter ? 1 : 0)

  useEffect(() => {
    if (authLoading) return
    if (user !== null && !isStaff) router.replace('/login')
  }, [authLoading, user, isStaff]) // eslint-disable-line

  useEffect(() => {
    if (authLoading || !isStaff) { if (!isStaff) setLoading(false); return }
    loadUsers()
  }, [authLoading, isStaff, userPage, userSearch, roleFilter, statusFilter]) // eslint-disable-line

  async function loadUsers() {
    try {
      const { data } = await api.get('/admin/users', {
        params: {
          page: userPage,
          search: userSearch || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        },
      })
      // New response shape: { users: <paginator>, summary: {...} }
      setUsers(data.users ?? data)
      if (data.summary) setSummary(data.summary)
    } catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }

  async function handleUserUpdate(id: number, updates: any) {
    try {
      await api.patch(`/admin/users/${id}`, updates)
      toast.success('User updated')
      loadUsers()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to update user')
    }
  }

  function openEdit(u: UserRow) {
    setEditTarget(u)
    setEditForm({
      name: u.name ?? '',
      role: u.role ?? '',
      phone: u.phone ?? '',
      organization: u.organization ?? '',
    })
  }

  async function submitEdit() {
    if (!editTarget) return
    if (!editForm.name.trim()) { toast.error('Name is required'); return }
    setEditSubmitting(true)
    try {
      await api.patch(`/admin/users/${editTarget.id}`, {
        name: editForm.name,
        role: editForm.role,
        phone: editForm.phone || null,
        organization: editForm.organization || null,
      })
      toast.success('User updated')
      setEditTarget(null)
      loadUsers()
    } catch (e: any) {
      const errors = e?.response?.data?.errors
      const msg = errors
        ? Object.values(errors).flat().join(' ')
        : e?.response?.data?.message ?? 'Failed to update user'
      toast.error(msg)
    } finally { setEditSubmitting(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`)
      toast.success('User deleted')
      setDeleteTarget(null)
      loadUsers()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to delete user')
    } finally { setDeleting(false) }
  }

  async function submitCreateUser() {
    if (!userForm.name || !userForm.email || !userForm.password) {
      toast.error('Name, email and password are required'); return
    }
    setUserSubmitting(true)
    try {
      await api.post('/admin/users', {
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
      })
      toast.success('User created')
      setUserModal(false)
      setUserForm(emptyUserForm())
      loadUsers()
    } catch (e: any) {
      const errors = e?.response?.data?.errors
      const msg = errors
        ? Object.values(errors).flat().join(' ')
        : e?.response?.data?.message ?? 'Failed to create user'
      toast.error(msg)
    } finally { setUserSubmitting(false) }
  }

  const rows: UserRow[] = users?.data ?? []
  const total = users?.total ?? 0
  const from = users?.from ?? 0
  const to = users?.to ?? 0

  if (authLoading || loading) return (
    <SidebarLayout title="User Management">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  return (
    <SidebarLayout title="User Management" subtitle="Manage accounts and access">
      <div className="page-container space-y-6">

        {/* Header: title + Create User */}
        <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-in">
          <div>
            <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest">Access Control</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">User management</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage platform accounts, roles, and permissions.</p>
          </div>
          <button onClick={() => { setUserForm(emptyUserForm()); setUserModal(true) }} className="btn-primary">
            <UserPlus className="w-4 h-4" /> Create User
          </button>
        </div>

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <SummaryStat value={summary.total}        label="Total users" />
            <SummaryStat value={summary.active}       label="Active" />
            <SummaryStat value={summary.inactive}     label="Inactive" />
            <SummaryStat value={summary.menro_admins} label="MENRO admins" />
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
          {/* Search + Filters toolbar */}
          <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100 flex-wrap">
            <div className="relative flex-1 min-w-[16rem] max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="input pl-10 w-full" placeholder="Search users…" value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setUserPage(1) }} />
            </div>

            <div className="relative">
              <button
                onClick={() => setFiltersOpen(o => !o)}
                className={cn(
                  'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors',
                  filtersOpen || activeFilterCount > 0
                    ? 'border-primary-300 text-primary-700 bg-primary-50'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                )}>
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold',
                  activeFilterCount > 0 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'
                )}>{activeFilterCount}</span>
              </button>

              {filtersOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFiltersOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-20 animate-scale-in origin-top-right">
                    <div className="space-y-4">
                      <div>
                        <label className="label">Role</label>
                        <select className="input" value={roleFilter}
                          onChange={e => { setRoleFilter(e.target.value); setUserPage(1) }}>
                          {ROLE_FILTERS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Status</label>
                        <select className="input" value={statusFilter}
                          onChange={e => { setStatusFilter(e.target.value); setUserPage(1) }}>
                          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={() => { setRoleFilter(''); setStatusFilter(''); setUserPage(1) }}
                        disabled={activeFilterCount === 0}
                        className="w-full text-xs font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40 py-1.5">
                        Clear all filters
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['User', 'Role', 'Status', 'Last Active', ''].map((h, i) => (
                    <th key={i} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(u => (
                  <UserTableRow
                    key={u.id}
                    u={u}
                    onToggleActive={() => handleUserUpdate(u.id, { is_active: !u.is_active })}
                    onEdit={() => openEdit(u)}
                    onView={() => setViewTarget(u)}
                    onDelete={() => setDeleteTarget(u)}
                  />
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="text-center text-gray-400 text-sm py-10">No users found</p>}
          </div>

          {/* Footer: showing X of Y + pagination */}
          <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100 flex-wrap">
            <p className="text-xs text-gray-400">
              {total > 0 ? `Showing ${from}–${to} of ${total} users` : 'No users'}
            </p>
            {users && users.last_page > 1 && (
              <Pagination currentPage={users.current_page} lastPage={users.last_page} onPageChange={setUserPage} />
            )}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {userModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Create User</h2>
              <button onClick={() => setUserModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Name *</label>
                <input className="input" placeholder="Full name" value={userForm.name}
                  onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" placeholder="email@example.com" value={userForm.email}
                  onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Password *</label>
                <input className="input" type="password" placeholder="Min 8 characters" value={userForm.password}
                  onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={userForm.role}
                  onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                  {CREATE_ROLES.map(r => <option key={r} value={r}>{ROLE_DISPLAY[r] ?? r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setUserModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitCreateUser} disabled={userSubmitting} className="btn-primary flex-1">
                {userSubmitting ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Edit User</h2>
              <button onClick={() => setEditTarget(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Name *</label>
                <input className="input" placeholder="Full name" value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input bg-gray-50 text-gray-500" value={editTarget.email} disabled readOnly />
                <p className="text-[11px] text-gray-400 mt-1">Email cannot be changed here.</p>
              </div>
              <div>
                <label className="label">Role</label>
                {editTarget.role === 'admin' ? (
                  // The Super Admin's role is fixed — show it read-only rather
                  // than offering it as a reassignable option.
                  <input className="input bg-gray-50 text-gray-500" value={ROLE_DISPLAY.admin} disabled readOnly />
                ) : (
                  <select className="input" value={editForm.role}
                    onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                    {/* Keep the user's current role visible even if it is no
                        longer in the assignable list (e.g. staff/community member). */}
                    {!(EDIT_ROLES as readonly string[]).includes(editForm.role) && (
                      <option value={editForm.role}>{ROLE_DISPLAY[editForm.role] ?? editForm.role}</option>
                    )}
                    {EDIT_ROLES.map(r => <option key={r} value={r}>{ROLE_DISPLAY[r] ?? r}</option>)}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <input className="input" placeholder="Optional" value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Organization</label>
                  <input className="input" placeholder="Optional" value={editForm.organization}
                    onChange={e => setEditForm(f => ({ ...f, organization: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submitEdit} disabled={editSubmitting} className="btn-primary flex-1">
                {editSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">User Details</h2>
              <button onClick={() => setViewTarget(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-forest-600 text-white flex items-center justify-center text-base font-bold shrink-0">
                  {viewTarget.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{viewTarget.name}</p>
                  <p className="text-xs text-gray-400 truncate">{viewTarget.email}</p>
                </div>
                <div className="ml-auto"><StatusPill active={viewTarget.is_active} /></div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <DetailItem label="Role" value={ROLE_DISPLAY[viewTarget.role] ?? viewTarget.role} />
                <DetailItem label="Last active" value={viewTarget.last_active_at ? timeAgo(viewTarget.last_active_at) : 'Never'} />
                <DetailItem label="Phone" value={viewTarget.phone || '—'} />
                <DetailItem label="Organization" value={viewTarget.organization || '—'} />
                <DetailItem label="Reports submitted" value={String(viewTarget.reports_count ?? 0)} />
                <DetailItem label="Joined" value={viewTarget.created_at ? timeAgo(viewTarget.created_at) : '—'} />
              </dl>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setViewTarget(null)} className="btn-secondary flex-1">Close</button>
              <button onClick={() => { const t = viewTarget; setViewTarget(null); if (t) openEdit(t) }} className="btn-primary flex-1">
                <Pencil className="w-4 h-4" /> Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-red-50 shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-base font-bold text-gray-900">Delete user</h2>
              </div>
              <p className="text-sm text-gray-500">
                Delete <span className="font-semibold text-gray-700">{deleteTarget.name}</span>? Their access is revoked
                immediately. This can be restored by a developer if needed.
              </p>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}

// ── Read-only detail item (View modal) ────────────────────────────────────────
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-800 mt-0.5 truncate">{value}</dd>
    </div>
  )
}

// ── Summary stat (top of page) ────────────────────────────────────────────────
function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
      active ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-green-500' : 'bg-amber-500')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ── Table row with "..." actions menu ─────────────────────────────────────────
interface RowProps {
  u: UserRow
  onToggleActive: () => void
  onEdit: () => void
  onView: () => void
  onDelete: () => void
}

function UserTableRow({ u, onToggleActive, onEdit, onView, onDelete }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const close = () => setMenuOpen(false)

  return (
    <tr className="hover:bg-gray-50/70 transition-colors">
      <td className="table-cell">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-forest-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {u.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{u.name}</p>
            <p className="text-xs text-gray-400 truncate">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="table-cell">
        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
          {ROLE_DISPLAY[u.role] ?? u.role}
        </span>
      </td>
      <td className="table-cell">
        <StatusPill active={u.is_active} />
      </td>
      <td className="table-cell text-gray-500 text-xs">
        {u.last_active_at ? timeAgo(u.last_active_at) : 'Never'}
      </td>
      <td className="table-cell text-right">
        <div className="relative inline-block">
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Row actions"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={close} />
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-20 animate-scale-in origin-top-right">
                <button onClick={() => { close(); onEdit() }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <Pencil className="w-4 h-4 text-gray-400" /> Edit
                </button>
                <button onClick={() => { close(); onView() }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <Eye className="w-4 h-4 text-gray-400" /> View
                </button>
                <button onClick={() => { close(); onToggleActive() }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  {u.is_active
                    ? <><UserX className="w-4 h-4 text-gray-400" /> Deactivate</>
                    : <><UserCheck className="w-4 h-4 text-gray-400" /> Reactivate</>}
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button onClick={() => { close(); onDelete() }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
