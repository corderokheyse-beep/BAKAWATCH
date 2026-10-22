'use client'

import { useEffect } from 'react'

/**
 * Recovers automatically from Turbopack/webpack ChunkLoadErrors.
 *
 * These happen when the dev server restarts (or a new deploy ships) while a tab
 * is still open: the page holds references to old chunk hashes that no longer
 * exist, so a lazy import or route transition throws "ChunkLoadError: Failed to
 * load chunk ...". Instead of showing the user an error overlay, we reload the
 * page once to pull the fresh chunks.
 *
 * A sessionStorage guard prevents a reload loop if the error somehow persists
 * (e.g. the server is genuinely down): we only auto-reload once per ~10s window.
 */
export default function ChunkErrorReloader() {
  useEffect(() => {
    const GUARD_KEY = 'cw_chunk_reload_at'

    const isChunkError = (msg: unknown): boolean => {
      const text = String(msg ?? '')
      return (
        text.includes('ChunkLoadError') ||
        text.includes('Failed to load chunk') ||
        text.includes('Loading chunk') ||
        // Dynamic import() failures surface with this message in some browsers.
        text.includes('error loading dynamically imported module')
      )
    }

    const recoverOnce = () => {
      let last = 0
      try { last = Number(sessionStorage.getItem(GUARD_KEY) ?? '0') } catch {}
      // Don't reload again if we already tried within the last 10 seconds.
      if (Date.now() - last < 10_000) return
      try { sessionStorage.setItem(GUARD_KEY, String(Date.now())) } catch {}
      window.location.reload()
    }

    const onError = (e: ErrorEvent) => {
      if (isChunkError(e.message) || isChunkError(e.error?.message) || isChunkError(e.error?.name)) {
        recoverOnce()
      }
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason
      if (isChunkError(reason?.message) || isChunkError(reason?.name) || isChunkError(reason)) {
        recoverOnce()
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
