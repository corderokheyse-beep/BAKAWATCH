'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'

/**
 * If a user is already logged in and visits the landing page,
 * redirect them straight to their role-specific dashboard.
 */
export default function LandingRedirect() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading || !user) return

    const dest =
      user.role === 'admin'        ? '/admin' :
      user.role === 'staff'        ? '/staff/dashboard' :
      user.role === 'menro'        ? '/menro/dashboard' :
      user.role === 'field_worker' ? '/field/dashboard' :
      user.role === 'volunteer'    ? '/volunteer/dashboard' :
      '/dashboard'

    window.location.replace(dest)
  }, [loading, user])

  return null
}
