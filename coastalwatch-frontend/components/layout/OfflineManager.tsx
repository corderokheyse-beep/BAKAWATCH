'use client'

/*
 * Registers the service worker (enabling PWA install + offline shell) and shows
 * a small status pill when the device is offline or has unsynced field drafts.
 * Automatically flushes the offline draft queue when connectivity returns.
 */

import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { countDrafts, flushDrafts, onOfflineChange, isOffline } from '@/lib/offline-queue'
import toast from 'react-hot-toast'

export default function OfflineManager() {
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  // Register the service worker once.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {/* non-fatal */})
  }, [])

  // Track offline state + pending draft count, and auto-sync on reconnect.
  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      if (!mounted) return
      setOffline(isOffline())
      setPending(await countDrafts())
    }

    const sync = async () => {
      if (isOffline()) return
      const before = await countDrafts()
      if (before === 0) return
      setSyncing(true)
      const synced = await flushDrafts()
      setSyncing(false)
      await refresh()
      if (synced > 0) toast.success(`${synced} offline record${synced > 1 ? 's' : ''} synced.`)
    }

    refresh()
    const unsub = onOfflineChange(refresh)
    const onOnline = () => { refresh(); sync() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', refresh)
    // Attempt an initial sync in case drafts are left over from a prior session.
    sync()

    return () => {
      mounted = false
      unsub()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  if (!offline && pending === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-[9998]">
      <div className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-lg border ${
        offline
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-white border-gray-200 text-gray-700'
      }`}>
        {offline ? (
          <><CloudOff className="w-4 h-4" /> Offline{pending > 0 && ` · ${pending} draft${pending > 1 ? 's' : ''} saved`}</>
        ) : syncing ? (
          <><RefreshCw className="w-4 h-4 animate-spin text-primary-600" /> Syncing {pending} draft{pending > 1 ? 's' : ''}…</>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 text-primary-600" /> {pending} unsynced draft{pending > 1 ? 's' : ''}
            <button onClick={() => flushDrafts()} className="ml-1 underline hover:no-underline">Sync now</button>
          </>
        )}
      </div>
    </div>
  )
}
