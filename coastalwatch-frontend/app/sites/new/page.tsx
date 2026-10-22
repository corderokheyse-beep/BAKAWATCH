'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /sites/new — redirect to the sites list. This prevents the [id] dynamic
 * route from catching "new" as a site ID.
 */
export default function NewSiteRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/sites')
  }, [router])

  return null
}
