'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import api from './api'
import type { Notification } from './types'

// Synthesise a soft notification chime using the Web Audio API
function playNotificationSound() {
  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)

    // Two-tone chime: C5 then E5
    const tones = [523.25, 659.25]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.35)
    })

    // Auto-close context after sound finishes
    setTimeout(() => ctx.close(), 1000)
  } catch {
    // AudioContext not available (SSR or blocked) — silently ignore
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [loading, setLoading]             = useState(false)
  const prevCountRef = useRef<number | null>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count')
      const newCount: number = data.count ?? 0

      // Play sound only when count increases (new notification arrived)
      if (prevCountRef.current !== null && newCount > prevCountRef.current) {
        playNotificationSound()
      }
      prevCountRef.current = newCount
      setUnreadCount(newCount)
    } catch {}
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data.data ?? data)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  const markRead = useCallback(async (id: string) => {
    await api.post(`/notifications/${id}/read`)
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all')
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnreadCount(0)
  }, [])

  // Poll every 20 s — fast enough to feel real-time without hammering the
  // server. Skip the request while the tab is hidden so backgrounded tabs
  // don't keep hitting the API, and refresh immediately when it regains focus.
  useEffect(() => {
    const tick = () => { if (!document.hidden) fetchUnreadCount() }
    tick()
    const interval = setInterval(tick, 20_000)
    const onVisible = () => { if (!document.hidden) fetchUnreadCount() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchUnreadCount])

  return { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead, playNotificationSound }
}
