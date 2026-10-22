'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import SidebarLayout from '@/components/layout/SidebarLayout'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { User, Mail, Phone, Building2, Lock } from 'lucide-react'

const schema = z.object({
  name:                  z.string().min(2),
  phone:                 z.string().optional(),
  organization:          z.string().optional(),
  password:              z.string().optional(),
  password_confirmation: z.string().optional(),
}).refine(d => !d.password || d.password === d.password_confirmation, {
  message: 'Passwords do not match',
  path: ['password_confirmation'],
})
type FormData = z.infer<typeof schema>

export default function ProfilePage() {
  const { user, refreshUser, loading } = useAuth()
  const router = useRouter()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (user) reset({ name: user.name, phone: user.phone, organization: user.organization })
  }, [user, loading]) // eslint-disable-line

  async function onSubmit(data: FormData) {
    const payload: any = { name: data.name, phone: data.phone, organization: data.organization }
    if (data.password) {
      payload.password = data.password
      payload.password_confirmation = data.password_confirmation
    }
    try {
      await api.put('/auth/profile', payload)
      await refreshUser()
      toast.success('Profile updated!')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Update failed')
    }
  }

  if (!user) return null

  return (
    <SidebarLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">My Profile</h1>

        <div className="card mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary-600 text-white flex items-center justify-center text-2xl font-bold">
              {user.name[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-lg">{user.name}</p>
              <p className="text-gray-500 text-sm">{user.email}</p>
              <span className="badge bg-primary-100 text-primary-700 mt-1">{user.role}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Full name</label>
              <input {...register('name')} className="input" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</label>
                <input {...register('phone')} className="input" placeholder="+63 9XX XXX XXXX" />
              </div>
              <div>
                <label className="label flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Organization</label>
                <input {...register('organization')} className="input" placeholder="MENRO, NGO…" />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Change password (leave blank to keep current)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">New password</label>
                  <input {...register('password')} type="password" className="input" placeholder="Min. 8 characters" />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input {...register('password_confirmation')} type="password" className="input" />
                  {errors.password_confirmation && <p className="text-red-500 text-xs mt-1">{errors.password_confirmation.message}</p>}
                </div>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>

        <div className="card bg-gray-50">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Account Info</h3>
          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center gap-2"><Mail className="w-4 h-4" /> {user.email}</div>
            <div>Email verified: {user.email_verified_at ? 'âœ… Yes' : 'âŒ Not yet'}</div>
            <div>Account status: {user.is_active ? 'âœ… Active' : 'âŒ Inactive'}</div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
