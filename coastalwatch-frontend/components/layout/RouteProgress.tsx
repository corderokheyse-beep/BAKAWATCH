'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * A slim top-of-page progress bar that animates on every route change, giving
 * instant visual feedback the moment a navigation starts — so clicking a link
 * never feels "dead" while the next page's chunk/data loads.
 *
 * Pure CSS/JS, no dependency. It starts when the user clicks any internal
 * <a>/Link, creeps forward, and completes when the pathname actually changes.
 */
export default function RouteProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (creepRef.current) { clearInterval(creepRef.current); creepRef.current = null }
  }

  // Start the bar when a navigation is initiated (click on an internal link).
  useEffect(() => {
    const start = () => {
      clearTimers()
      setVisible(true)
      setWidth(8)
      // Creep forward but never reach 100% until the route actually settles.
      creepRef.current = setInterval(() => {
        setWidth(w => (w < 90 ? w + Math.max(0.5, (90 - w) * 0.08) : w))
      }, 120)
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement)?.closest?.('a')
      if (!a) return
      const href = a.getAttribute('href')
      const target = a.getAttribute('target')
      if (!href || href.startsWith('#') || href.startsWith('http') || target === '_blank') return
      // Same-URL clicks won't trigger a pathname change — skip.
      if (href === pathname) return
      start()
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname])

  // When the route (path or query) actually changes, finish the bar.
  useEffect(() => {
    if (!visible) return
    clearTimers()
    setWidth(100)
    const t1 = setTimeout(() => setVisible(false), 250)
    const t2 = setTimeout(() => setWidth(0), 500)
    timers.current.push(t1, t2)
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  if (!visible && width === 0) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 9999,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 250ms ease',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: 'linear-gradient(90deg, #16a34a, #22c55e)',
          boxShadow: '0 0 8px rgba(34,197,94,0.6)',
          borderRadius: '0 2px 2px 0',
          transition: 'width 200ms ease',
        }}
      />
    </div>
  )
}
