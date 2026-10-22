'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react'
import BakawatchLogo from '@/components/ui/BakawatchLogo'
import { firebaseSendReset, firebaseErrorMessage } from '@/lib/firebase-auth'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email) { setError('Please enter your email address.'); return }
    setLoading(true)
    try {
      // Firebase sends and handles the entire password-reset flow (email +
      // reset page). We always show the generic confirmation screen.
      await firebaseSendReset(email)
      setSent(true)
    } catch (err: any) {
      // Don't reveal whether the email exists — treat "user-not-found" as success.
      if (err?.code === 'auth/user-not-found') {
        setSent(true)
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Too many requests. Please wait a few minutes and try again.')
      } else {
        setError(firebaseErrorMessage(err))
      }
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

        {sent ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Check your email</h1>
            <p className="text-sm text-gray-500">
              If an account exists for <span className="font-semibold text-gray-700">{email}</span>, we&rsquo;ve sent a
              password reset link. The link expires in 60 minutes.
            </p>
            <p className="text-xs text-gray-400">
              Didn&rsquo;t get it? Check your spam folder, or{' '}
              <button onClick={() => { setSent(false); setError('') }} className="text-primary-600 font-semibold hover:underline">
                try again
              </button>.
            </p>
            <Link href="/login" className="btn-primary w-full justify-center text-sm mt-2">
              Return to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Forgot password?</h1>
              <p className="text-sm text-gray-500">
                Enter your account email and we&rsquo;ll send you a link to reset your password.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="email" type="email"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    placeholder="you@menrogloria.gov.ph"
                    value={email} onChange={e => setEmail(e.target.value)}
                    autoComplete="email" required autoFocus
                  />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-forest-600 hover:from-primary-700 hover:to-forest-700 disabled:opacity-60 text-white font-bold py-3 rounded-2xl text-sm transition-all duration-200 shadow-lg shadow-primary-500/25 hover:-translate-y-0.5">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send reset link'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-6">
              Remembered it?{' '}
              <Link href="/login" className="text-primary-600 font-semibold hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
