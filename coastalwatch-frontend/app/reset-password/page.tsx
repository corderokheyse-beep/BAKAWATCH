'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
import BakawatchLogo from '@/components/ui/BakawatchLogo'
import PasswordStrength, { isStrongPassword } from '@/components/ui/PasswordStrength'
import api from '@/lib/api'

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''

  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [done, setDone]               = useState(false)

  const linkValid = !!token && !!email

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!isStrongPassword(password)) { setError('Password does not meet all the requirements below.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        token, email,
        password,
        password_confirmation: confirm,
      })
      setDone(true)
      toast.success('Password reset successfully.')
      // Give the success screen a beat, then send to login.
      setTimeout(() => router.push('/login'), 2200)
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
        (err?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Make sure the API is running.' : 'Could not reset your password.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7f5] px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-primary-600 text-xs font-medium mb-6 transition-colors group">
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to sign in
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <BakawatchLogo size={36} />
          <div>
            <p className="text-sm font-black text-gray-900 leading-none tracking-wide">BAKAWATCH</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">MENRO Gloria · Oriental Mindoro</p>
          </div>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Password reset</h1>
            <p className="text-sm text-gray-500">Your password has been updated. Redirecting you to sign in…</p>
            <Link href="/login" className="btn-primary w-full justify-center text-sm mt-2">Sign in now</Link>
          </div>
        ) : !linkValid ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7 text-red-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Invalid reset link</h1>
            <p className="text-sm text-gray-500">
              This link is missing information or malformed. Please request a new password reset link.
            </p>
            <Link href="/forgot-password" className="btn-primary w-full justify-center text-sm mt-2">
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Set a new password</h1>
              <p className="text-sm text-gray-500">
                Resetting the password for <span className="font-semibold text-gray-700">{email}</span>.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide" htmlFor="password">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="password" type={showPw ? 'text' : 'password'}
                    className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password" required autoFocus
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide" htmlFor="confirm">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="confirm" type={showPw ? 'text' : 'password'}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password" required
                  />
                </div>
                {confirm && confirm !== password && (
                  <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                )}
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-forest-600 hover:from-primary-700 hover:to-forest-700 disabled:opacity-60 text-white font-bold py-3 rounded-2xl text-sm transition-all duration-200 shadow-lg shadow-primary-500/25 hover:-translate-y-0.5">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</> : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}
