'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import Cookies from 'js-cookie'
import api from './api'
import type { User } from './types'
import { firebaseSignIn, firebaseRegister, firebaseSignOut } from './firebase-auth'

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  isAdmin: boolean
  isStaff: boolean
  isMenro: boolean
  isFieldWorker: boolean
  isVolunteer: boolean
  isDenr: boolean
  isEvaluator: boolean
  homePath: string
}

interface RegisterData {
  name: string
  email: string
  password: string
  password_confirmation: string
  phone?: string
  organization?: string
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<User | null>(null)
  const [token, setToken]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
      // Cache the user so the next cold load can hydrate instantly instead of
      // blocking first paint on this round-trip.
      try { localStorage.setItem('cw_user', JSON.stringify(data)) } catch {}
    } catch (error) {
      // A timeout or temporary backend outage must not sign the user out.
      // Keep the optimistically hydrated session and clear it only when the
      // API confirms that the token is no longer valid.
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setUser(null)
        setToken(null)
        Cookies.remove('token')
        try { localStorage.removeItem('cw_user') } catch {}
      }
    }
  }, [])

  useEffect(() => {
    const saved = Cookies.get('token')
    if (!saved) {
      setLoading(false)
      return
    }
    setToken(saved)

    // Optimistic hydration: if we have a cached user from a previous session,
    // render the app immediately with it and revalidate /auth/me in the
    // background. This removes the network round-trip from first paint.
    let hydrated = false
    try {
      const cached = localStorage.getItem('cw_user')
      if (cached) {
        setUser(JSON.parse(cached))
        setLoading(false)
        hydrated = true
      }
    } catch { /* ignore corrupt cache */ }

    if (hydrated) {
      // Revalidate silently; don't toggle loading (page is already shown).
      refreshUser()
    } else {
      // No cache — must wait for the first /auth/me before we know the role.
      refreshUser().finally(() => setLoading(false))
    }
  }, [refreshUser])

  // Login via Firebase, then exchange the verified ID token for a Sanctum session.
  const login = async (email: string, password: string) => {
    const idToken = await firebaseSignIn(email, password)
    const { data } = await api.post('/auth/firebase', { id_token: idToken })
    Cookies.set('token', data.token, { expires: 7, sameSite: 'lax' })
    setToken(data.token)
    setUser(data.user)
    try { localStorage.setItem('cw_user', JSON.stringify(data.user)) } catch {}
  }

  // Register the account in Firebase, then provision/link it in the app.
  const register = async (formData: RegisterData) => {
    let idToken: string
    try {
      idToken = await firebaseRegister(formData.email, formData.password)
    } catch (err: any) {
      // If a previous registration attempt created the Firebase user but failed
      // before backend provisioning completed, sign in with the same credentials
      // so the user can finish account provisioning seamlessly.
      if (err?.code === 'auth/email-already-in-use') {
        try {
          idToken = await firebaseSignIn(formData.email, formData.password)
        } catch {
          throw err
        }
      } else {
        throw err
      }
    }

    const payload = {
      id_token: idToken,
      name: formData.name,
      phone: formData.phone || undefined,
      organization: formData.organization || undefined,
    }

    let data: any
    try {
      const res = await api.post('/auth/firebase', payload)
      data = res.data
    } catch (err: any) {
      // Guard against older backend deployments where User::create() did not
      // hydrate the DB default `is_active = true` in memory on the first call,
      // returning 403 even though the DB row was created with is_active = true.
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        const retryRes = await api.post('/auth/firebase', payload)
        data = retryRes.data
      } else {
        throw err
      }
    }

    // Set token cookie BEFORE any authenticated follow-up requests (such as /auth/profile)
    Cookies.set('token', data.token, { expires: 7, sameSite: 'lax' })
    setToken(data.token)

    let finalUser: User = data.user
    // Attach the extra profile fields that Firebase doesn't hold.
    if (
      (formData.phone && !data.user?.phone) ||
      (formData.organization && !data.user?.organization)
    ) {
      try {
        const profileRes = await api.put('/auth/profile', {
          name: formData.name,
          phone: formData.phone,
          organization: formData.organization,
        })
        if (profileRes.data?.user) {
          finalUser = profileRes.data.user
        }
      } catch { /* non-blocking: profile extras can be set later */ }
    }

    setUser(finalUser)
    try { localStorage.setItem('cw_user', JSON.stringify(finalUser)) } catch {}
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    await firebaseSignOut()
    Cookies.remove('token')
    setToken(null)
    setUser(null)
    try { localStorage.removeItem('cw_user') } catch {}
    // Hard redirect to landing page so the Navbar disappears immediately
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, register, logout, refreshUser,
      isAdmin:       user?.role === 'admin',
      isStaff:       user?.role === 'admin' || user?.role === 'staff',
      isMenro:       user?.role === 'menro',
      isFieldWorker: user?.role === 'field_worker',
      isVolunteer:   user?.role === 'volunteer',
      isDenr:        user?.role === 'denr',
      isEvaluator:   user?.role === 'evaluator',
      homePath:
        user?.role === 'admin'        ? '/admin' :
        user?.role === 'staff'        ? '/staff/dashboard' :
        user?.role === 'menro'        ? '/menro/dashboard' :
        user?.role === 'field_worker' ? '/field/dashboard' :
        user?.role === 'volunteer'    ? '/volunteer/dashboard' :
        user?.role === 'denr'         ? '/denr/dashboard' :
        user?.role === 'evaluator'    ? '/evaluator/dashboard' :
        '/dashboard',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
