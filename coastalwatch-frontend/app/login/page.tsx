'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2, Lock, Mail, ArrowLeft, Leaf, BarChart2, ClipboardList, AlertCircle, ShieldAlert } from 'lucide-react'
import BakawatchLogo from '@/components/ui/BakawatchLogo'
import { useAuth } from '@/lib/auth-context'
import { firebaseSignIn, firebaseErrorMessage } from '@/lib/firebase-auth'

// Dev quick-fill panel ships ONLY in development builds — never in production,
// so seeded test credentials are not exposed to real users.
const IS_DEV = process.env.NODE_ENV !== 'production'

export default function LoginPage() {
  const router = useRouter()
  const { login: authLogin } = useAuth()
  const [loading, setLoading]               = useState(false)
  const [email, setEmail]                   = useState('')
  const [password, setPassword]             = useState('')
  const [showPw, setShowPw]                 = useState(false)
  const [error, setError]                   = useState('')
  const [lockedOut, setLockedOut]           = useState(false)
  const [attemptsLeft, setAttemptsLeft]     = useState<number | null>(null)

  // Shared completion: role-based client-side redirect (no hard reload so the
  // auth context's in-memory user state carries over to the destination page).
  function redirectByRole(role: string) {
    toast.success('Welcome back!')
    const dest =
      role === 'admin'        ? '/admin' :
      role === 'staff'        ? '/staff/dashboard' :
      role === 'menro'        ? '/menro/dashboard' :
      role === 'field_worker' ? '/field/dashboard' :
      role === 'volunteer'    ? '/volunteer/dashboard' :
      '/dashboard'
    router.push(dest)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLockedOut(false)
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    try {
      // authLogin calls Firebase, exchanges the ID token for a Sanctum session,
      // AND sets user in the auth context — so the destination page receives a
      // populated user without needing a /auth/me round-trip.
      await authLogin(email, password)
      // Read the role from the auth context synchronously by re-reading
      // localStorage (authLogin has already written it).
      let role = 'user'
      try { role = JSON.parse(localStorage.getItem('cw_user') ?? '{}')?.role ?? 'user' } catch {}
      redirectByRole(role)
    } catch (err: any) {
      const resp = err.response?.data
      if (err?.response) {
        const lockData = resp?.locked_out ? { lockedOut: true, attemptsLeft: 0 } : null
        if (lockData) { setLockedOut(true); setAttemptsLeft(0) }
        setError(resp?.message ?? 'Login failed.')
      } else {
        setError(firebaseErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f5f7f5]">

      {/* ── Left panel — branding ──────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0">
          <Image src="/images/mangroove.jpg" alt="" fill sizes="45vw" className="object-cover object-center" priority />
          {/* Dark overlay — inline style guarantees the opacity regardless of
              Tailwind config (the original non-standard /88,/78,/82 values
              were silently dropped, leaving white text on a bright photo). */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(10,46,26,0.94) 0%, rgba(13,58,33,0.90) 60%, rgba(18,72,42,0.88) 100%)' }} />
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        </div>
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-xs font-medium mb-10 transition-colors group">
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to Home
          </Link>
          <div className="flex items-center gap-3 mb-8">
            <BakawatchLogo size={44} />
            <div>
              <p className="text-white font-black text-lg leading-none tracking-wide">BAKAWATCH</p>
              <p className="text-primary-200 text-xs leading-none mt-1">MENRO Gloria · Oriental Mindoro</p>
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Mangrove<br />Monitoring &<br />
            <span className="text-primary-300">Restoration System</span>
          </h1>
          <p className="text-primary-200 text-sm leading-relaxed max-w-xs">
            The official cross-platform mangrove monitoring and restoration management system of MENRO Gloria, Oriental Mindoro.
          </p>
        </div>
        <div className="relative space-y-3">
          {[
            { icon: Leaf,          label: 'Plantation Recording',   desc: 'GPS-tagged planting data with species tracking' },
            { icon: BarChart2,     label: 'Survival & Analytics',   desc: 'Growth trends, predictive forecasting, survival rates' },
            { icon: ClipboardList, label: 'MENRO & DENR Reporting', desc: 'Generate compliance documentation instantly' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3 bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/10">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-none">{label}</p>
                <p className="text-primary-300 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { value: '16.8 ha', label: 'Protected Area' },
              { value: '15',      label: 'Species' },
              { value: '2,750+',  label: 'Trees Planted' },
            ].map(s => (
              <div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
                <p className="text-white font-extrabold text-base leading-none">{s.value}</p>
                <p className="text-primary-300 text-[10px] mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative" id="main-content">
        <div className="w-full max-w-sm">

          {/* Mobile header */}
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-primary-600 text-xs font-medium mb-6 transition-colors group" aria-label="Back to home page">
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to Home
            </Link>
            <div className="flex items-center gap-3">
              <BakawatchLogo size={36} />
              <div>
                <p className="text-sm font-black text-gray-900 leading-none tracking-wide">BAKAWATCH</p>
                <p className="text-xs text-gray-400 leading-none mt-0.5">MENRO Gloria · Oriental Mindoro</p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Welcome back</h1>
            <p className="text-sm text-gray-500">Sign in to continue to BAKAWATCH</p>
          </div>

          {/* Lockout alert */}
          {lockedOut && (
            <div role="alert" className="mb-5 flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-800">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
              <div>
                <p className="font-bold">Account temporarily locked</p>
                <p className="mt-0.5 text-xs text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* General error */}
          {error && !lockedOut && (
            <div role="alert" aria-live="assertive" className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
              <div>
                <span>{error}</span>
                {attemptsLeft !== null && attemptsLeft > 0 && (
                  <p className="text-xs text-red-500 mt-0.5">{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before lockout.</p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate method="post" action="#">
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
                    autoComplete="email" required disabled={lockedOut}
                    aria-describedby={error && !lockedOut ? 'login-error' : undefined}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="password" type={showPw ? 'text' : 'password'}
                    className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" required disabled={lockedOut}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <Link href="/forgot-password"
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <button type="submit" disabled={loading || lockedOut}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-forest-600 hover:from-primary-700 hover:to-forest-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-sm transition-all duration-200 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:-translate-y-0.5 mt-2"
                aria-busy={loading}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Signing in…</> : 'Sign in to BAKAWATCH'}
              </button>
            </form>

          {/* Dev quick-fill — only shown in development */}
          {IS_DEV && (
            <div className="mt-7 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-400 text-center mb-3 flex items-center justify-center gap-1.5">
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase tracking-wide">Dev Only</span>
                Quick fill
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Super Admin',    email: 'admin@menrogloria.gov.ph',       pw: 'Admin@1234' },
                  { label: 'MENRO Admin',    email: 'menro@menrogloria.gov.ph',       pw: 'Menro@1234' },
                  { label: 'Bantay Bakawan', email: 'fieldworker@menrogloria.gov.ph', pw: 'Field@1234' },
                  { label: 'Participant',    email: 'volunteer@menrogloria.gov.ph',   pw: 'Volunteer@1234' },
                ].map(u => (
                  <button key={u.label} type="button"
                    disabled={loading}
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setError('')
                      setLockedOut(false)
                      setEmail(u.email)
                      setPassword(u.pw)
                      setLoading(true)
                      try {
                        await authLogin(u.email, u.pw)
                        let role = 'user'
                        try { role = JSON.parse(localStorage.getItem('cw_user') ?? '{}')?.role ?? 'user' } catch {}
                        redirectByRole(role)
                      } catch (err: any) {
                        setError(err?.response ? (err.response.data?.message ?? 'Login failed.') : firebaseErrorMessage(err))
                        setLoading(false)
                      }
                    }}
                    className="text-xs py-2 px-3 rounded-xl border border-gray-200 bg-white hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 text-gray-600 font-medium transition-all duration-150 disabled:opacity-50">
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-gray-400 mt-6">
            Need an account?{' '}
            <Link href="/register" className="text-primary-600 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded">
              Register here
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
