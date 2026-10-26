import { clsx, type ClassValue } from 'clsx'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  // Normalize space-separated datetime to ISO 8601 (e.g. "2026-04-16 07:57:26" → "2026-04-16T07:57:26")
  const normalized = date.replace(' ', 'T')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return '—'
  return format(d, 'MMM d, yyyy')
}

export function timeAgo(date: string | null | undefined): string {
  if (!date) return '—'
  const normalized = date.replace(' ', 'T')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

export const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-red-100 text-red-800',
  active:      'bg-green-100 text-green-800',
  inactive:    'bg-gray-100 text-gray-800',
  in_progress: 'bg-amber-100 text-amber-800',
  planned:     'bg-purple-100 text-purple-800',
  completed:   'bg-green-100 text-green-800',
  suspended:   'bg-gray-100 text-gray-800',
}

export const CATEGORY_COLORS: Record<string, string> = {
  damage:      'bg-red-100 text-red-800',
  restoration: 'bg-green-100 text-green-800',
  wildlife:    'bg-blue-100 text-blue-800',
  pollution:   'bg-orange-100 text-orange-800',
  other:       'bg-gray-100 text-gray-800',
}

export const CATEGORY_ICONS: Record<string, string> = {
  damage:      '⚠️',
  restoration: '🌱',
  wildlife:    '🦅',
  pollution:   '🚯',
  other:       '📍',
}

/**
 * Resolves an image URL (from report, site, or user upload) to a fully qualified,
 * loadable URL in the browser. Handles:
 * - Full remote URLs (Cloudinary, Unsplash, etc.)
 * - Local storage paths (e.g. "reports/...", "report-updates/...", "/storage/...")
 * - Relative paths (e.g. "/api/uploads/...")
 * - Mismatched API origins between stored DB URLs and active NEXT_PUBLIC_API_URL
 * - Prevention of Mixed Content (http -> https upgrade when running on https)
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''

  const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
  let apiOrigin = ''
  try {
    if (apiBase) {
      const parsedApi = new URL(apiBase, typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1:8000')
      apiOrigin = parsedApi.origin
    } else if (typeof window !== 'undefined') {
      apiOrigin = window.location.origin
    }
  } catch {
    apiOrigin = ''
  }

  // Already absolute or protocol-relative or data/blob
  if (/^(https?:|\/\/|data:|blob:)/i.test(trimmed)) {
    try {
      const parsedImg = new URL(trimmed)
      const isUpload = parsedImg.pathname.includes('/api/uploads/') || parsedImg.pathname.includes('/storage/')

      if (isUpload && apiOrigin) {
        // Upgrade insecure http to https if the page is served over https
        if (typeof window !== 'undefined' && window.location.protocol === 'https:' && parsedImg.protocol === 'http:') {
          return `${apiOrigin}${parsedImg.pathname}${parsedImg.search}`
        }

        // If the URL is bound to localhost or 127.0.0.1 and the current API host differs:
        if ((parsedImg.hostname === 'localhost' || parsedImg.hostname === '127.0.0.1') && apiOrigin) {
          const parsedApi = new URL(apiBase, 'http://127.0.0.1:8000')
          if (parsedApi.hostname !== parsedImg.hostname) {
            return `${apiOrigin}${parsedImg.pathname}${parsedImg.search}`
          }
        }
      }
    } catch {
      // pass through if URL parsing fails
    }
    return trimmed
  }

  // Normalized relative path
  let path = trimmed.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '')

  if (path.startsWith('storage/')) {
    path = path.substring('storage/'.length).replace(/^app\/public\//, '')
    path = `api/uploads/${path}`
  } else if (!path.startsWith('api/uploads/')) {
    path = `api/uploads/${path}`
  }

  return apiOrigin ? `${apiOrigin}/${path}` : `/${path}`
}

/**
 * Extracts and resolves all photo URLs from a Report object, including photos array,
 * image_url, and event_accomplishment photos.
 */
export function getReportPhotoUrls(report?: any | null): string[] {
  if (!report) return []
  const urls: string[] = []

  const add = (raw?: string | null) => {
    if (!raw || typeof raw !== 'string') return
    const resolved = resolveImageUrl(raw)
    if (resolved && !urls.includes(resolved)) {
      urls.push(resolved)
    }
  }

  // 1. Check photos array (can be array of { url } or array of strings)
  if (Array.isArray(report.photos)) {
    for (const p of report.photos) {
      if (typeof p === 'string') add(p)
      else if (p && typeof p.url === 'string') add(p.url)
    }
  }

  // 2. Check main image_url
  if (report.image_url) {
    add(report.image_url)
  }

  // 3. Check event_accomplishment photos
  if (report.event_accomplishment && Array.isArray(report.event_accomplishment.photos)) {
    for (const p of report.event_accomplishment.photos) {
      if (typeof p === 'string') add(p)
      else if (p && typeof p.url === 'string') add(p.url)
    }
  }

  return urls
}
