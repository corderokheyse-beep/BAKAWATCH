'use client'

import { useEffect } from 'react'

/**
 * Route-level error boundary. Next.js routes render/navigation errors here —
 * including ChunkLoadErrors that fire when a <Link> navigation tries to fetch a
 * chunk hash that no longer exists (common after a dev-server restart or a new
 * deploy while a tab is still open).
 *
 * For chunk errors we auto-reload once to pull the fresh chunks, so users never
 * see an error screen. A sessionStorage guard prevents a reload loop if the
 * problem is genuinely persistent (e.g. the server is down).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isChunkError = (() => {
    const text = `${error?.name ?? ''} ${error?.message ?? ''}`
    return (
      text.includes('ChunkLoadError') ||
      text.includes('Failed to load chunk') ||
      text.includes('Loading chunk') ||
      text.includes('error loading dynamically imported module')
    )
  })()

  useEffect(() => {
    if (!isChunkError) return
    const GUARD_KEY = 'cw_chunk_reload_at'
    let last = 0
    try { last = Number(sessionStorage.getItem(GUARD_KEY) ?? '0') } catch {}
    if (Date.now() - last < 10_000) return // already tried recently — avoid a loop
    try { sessionStorage.setItem(GUARD_KEY, String(Date.now())) } catch {}
    window.location.reload()
  }, [isChunkError])

  // While a chunk error is auto-reloading, show nothing (prevents a flash).
  if (isChunkError) return null

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          An unexpected error occurred. You can try again, or reload the page.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => reset()} className="btn-primary text-sm">
          Try again
        </button>
        <button onClick={() => window.location.reload()} className="btn-secondary text-sm">
          Reload page
        </button>
      </div>
    </div>
  )
}
