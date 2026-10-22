'use client'

/*
 * PWA install banner. Captures the browser's `beforeinstallprompt` event and
 * shows a dismissible "Install BAKAWATCH" card so mobile users (especially
 * Bantay Bakawan volunteers and participants) can add the app to their home
 * screen and use it like a native app — including offline draft queuing.
 *
 * On iOS (Safari), where `beforeinstallprompt` is not fired, an instructions
 * banner (Share → Add to Home Screen) is shown instead. Dismissals are stored
 * in localStorage so returning users are not nagged.
 */

import { useEffect, useState } from 'react'
import { Download, Share2, Plus, X } from 'lucide-react'

const DISMISS_KEY = 'pwa-install-dismissed'
const VISIBLE_KEY = 'pwa-install-visible'

// Minimal typing for the non-standard BeforeInstallPromptEvent.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Already installed as an app? Never show the banner.
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Respect a previous dismissal.
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
      setVisible(localStorage.getItem(VISIBLE_KEY) !== '0')
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS Safari: no beforeinstallprompt — detect iPhone/iPad Safari instead.
    const ua = window.navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
    if (isIOS && isSafari) setShowIOSHint(true)

    const onInstalled = () => setVisible(false)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!visible || (!installEvent && !showIOSHint)) return null

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') localStorage.setItem(VISIBLE_KEY, '0')
    setVisible(false)
  }

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-[9997] animate-slide-up">
      <div className="rounded-2xl bg-white border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.14)] p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-forest-600 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">Install BAKAWATCH</p>
          {installEvent ? (
            <>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Add the app to your home screen for faster access and offline reporting in the field.
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={install}
                  className="btn-primary text-xs px-3.5 py-2"
                >
                  Install app
                </button>
                <button
                  onClick={dismiss}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-600 px-2 py-2"
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                To install on iPhone/iPad, tap the Share button, then choose <span className="font-semibold text-gray-700">Add to Home Screen</span>.
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-gray-500">
                <Share2 className="w-4 h-4" /> → <Plus className="w-4 h-4" /> → Add to Home Screen
              </div>
              <button
                onClick={dismiss}
                className="mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                Got it
              </button>
            </>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
