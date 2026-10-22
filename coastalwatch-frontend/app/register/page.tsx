'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import BakawatchLogo from '@/components/ui/BakawatchLogo'
import PasswordStrength from '@/components/ui/PasswordStrength'
import { firebaseErrorMessage } from '@/lib/firebase-auth'

const schema = z.object({
  name:                  z.string().min(2, 'Name must be at least 2 characters').max(255),
  email:                 z.string().email('Invalid email address').max(255),
  password:              z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one symbol'),
  password_confirmation: z.string(),
  phone:                 z.string().max(20).optional(),
  organization:          z.string().max(255).optional(),
}).refine(d => d.password === d.password_confirmation, {
  message: 'Passwords do not match',
  path: ['password_confirmation'],
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const { register: registerUser } = useAuth()
  const router = useRouter()
  const [showPw, setShowPw]     = useState(false)
  const [showCfm, setShowCfm]   = useState(false)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const passwordValue = watch('password') ?? ''

  async function onSubmit(data: FormData) {
    try {
      await registerUser(data)
      toast.success('Account created! Welcome to BAKAWATCH.')
      router.push('/dashboard')
    } catch (err: any) {
      // Account creation happens in Firebase first, so most failures are
      // Firebase errors (err.code); backend provisioning errors are axios
      // (err.response). Surface the specific reason, not a generic message.
      if (err?.code === 'auth/email-already-in-use') {
        toast.error('An account with this email already exists. Please sign in instead.')
      } else if (err?.response) {
        toast.error(err.response.data?.message ?? 'Registration failed. Please try again.')
      } else {
        toast.error(firebaseErrorMessage(err))
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-forest-900 flex items-center justify-center p-4">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} aria-hidden="true" />

      <main id="main-content" className="relative w-full max-w-md">

        {/* Back link */}
        <Link href="/login" className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-medium mb-6 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded" aria-label="Back to sign in">
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" /> Back to Sign in
        </Link>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <BakawatchLogo size={44} />
          <div>
            <p className="text-white font-black text-lg leading-none tracking-wide">BAKAWATCH</p>
            <p className="text-primary-300 text-xs leading-none mt-1">MENRO Gloria · Oriental Mindoro</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h1 className="text-xl font-extrabold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">Join the BAKAWATCH mangrove monitoring system</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate aria-label="Registration form" method="post" action="#">

            {/* Full name */}
            <div>
              <label className="label" htmlFor="reg-name">Full Name</label>
              <input id="reg-name" {...register('name')} className="input" placeholder="Juan dela Cruz"
                autoComplete="name" aria-required="true"
                aria-describedby={errors.name ? 'reg-name-error' : undefined} />
              {errors.name && <p id="reg-name-error" role="alert" className="err-msg">{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="label" htmlFor="reg-email">Email Address</label>
              <input id="reg-email" {...register('email')} type="email" className="input"
                placeholder="you@menrogloria.gov.ph" autoComplete="email" aria-required="true"
                aria-describedby={errors.email ? 'reg-email-error' : undefined} />
              {errors.email && <p id="reg-email-error" role="alert" className="err-msg">{errors.email.message}</p>}
            </div>

            {/* Phone + Organization */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="reg-phone">Phone</label>
                <input id="reg-phone" {...register('phone')} className="input" placeholder="+63 9XX XXX XXXX" autoComplete="tel" />
              </div>
              <div>
                <label className="label" htmlFor="reg-org">Organization</label>
                <input id="reg-org" {...register('organization')} className="input" placeholder="MENRO, LGU…" autoComplete="organization" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label" htmlFor="reg-password">Password</label>
              <div className="relative">
                <input id="reg-password" {...register('password')} type={showPw ? 'text' : 'password'}
                  className="input pr-10" placeholder="Min. 8 characters" autoComplete="new-password"
                  aria-required="true"
                  aria-describedby="reg-pw-reqs" />
                <button type="button" onClick={() => setShowPw(p => !p)} tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              <div id="reg-pw-reqs"><PasswordStrength password={passwordValue} /></div>
              {errors.password && <p role="alert" className="err-msg">{errors.password.message}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <label className="label" htmlFor="reg-confirm">Confirm Password</label>
              <div className="relative">
                <input id="reg-confirm" {...register('password_confirmation')} type={showCfm ? 'text' : 'password'}
                  className="input pr-10" placeholder="Repeat password" autoComplete="new-password"
                  aria-required="true"
                  aria-describedby={errors.password_confirmation ? 'reg-confirm-error' : undefined} />
                <button type="button" onClick={() => setShowCfm(p => !p)} tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showCfm ? 'Hide confirm password' : 'Show confirm password'}>
                  {showCfm ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              {errors.password_confirmation && <p id="reg-confirm-error" role="alert" className="err-msg">{errors.password_confirmation.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting}
              className="btn-primary w-full py-3 mt-2 justify-center"
              aria-busy={isSubmitting}>
              {isSubmitting
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Creating account…</>
                : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link href="/login" className="text-primary-600 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
