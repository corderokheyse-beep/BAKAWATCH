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

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim()
  let apiRoot = ''
  try {
    if (apiBase) {
      const parsedApi = new URL(apiBase, typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1:8000')
      apiRoot = `${parsedApi.origin}${parsedApi.pathname}`.replace(/\/api\/?$/, '').replace(/\/+$/, '')
    } else if (typeof window !== 'undefined') {
      apiRoot = window.location.origin
    }
  } catch {
    apiRoot = ''
  }

  const normalizeUploadSubpath = (rawPath: string): string | null => {
    const clean = rawPath.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '')
    for (const prefix of ['api/uploads/', 'storage/app/public/', 'storage/']) {
      const idx = clean.indexOf(prefix)
      if (idx !== -1) {
        return clean.substring(idx + prefix.length).replace(/^\/+/, '')
      }
    }
    for (const folder of ['reports/', 'report-updates/', 'event-accomplishments/', 'plantation-records/', 'monitoring-records/', 'site-photos/', 'coastalwatch/']) {
      if (clean.startsWith(folder)) {
        return clean
      }
    }
    return null
  }

  // Already absolute or protocol-relative or data/blob
  if (/^(https?:|\/\/|data:|blob:)/i.test(trimmed)) {
    if (/^(data:|blob:)/i.test(trimmed)) return trimmed
    try {
      const parsedImg = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : 'https://localhost')
      const uploadSubpath = normalizeUploadSubpath(parsedImg.pathname)
      if (uploadSubpath) {
        return apiRoot
          ? `${apiRoot}/api/uploads/${uploadSubpath}${parsedImg.search}`
          : `/api/uploads/${uploadSubpath}${parsedImg.search}`
      }
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && parsedImg.protocol === 'http:') {
        parsedImg.protocol = 'https:'
        return parsedImg.toString()
      }
    } catch {
      // pass through if URL parsing fails
    }
    return trimmed
  }

  // Normalized relative path
  const uploadSubpath = normalizeUploadSubpath(trimmed) ?? trimmed.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '')
  return apiRoot ? `${apiRoot}/api/uploads/${uploadSubpath}` : `/api/uploads/${uploadSubpath}`
}

/**
 * Extracts and resolves all photo URLs from a Report object, including photos array,
 * image_url, event_accomplishment photos, and monitoring update photos.
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

  // 3. Check event_accomplishment photos (snake_case or camelCase)
  const accomplishment = report.event_accomplishment ?? report.eventAccomplishment
  if (accomplishment && Array.isArray(accomplishment.photos)) {
    for (const p of accomplishment.photos) {
      if (typeof p === 'string') add(p)
      else if (p && typeof p.url === 'string') add(p.url)
    }
  }

  // 4. If no initial photos exist, fall back to monitoring update photos
  if (urls.length === 0 && Array.isArray(report.updates)) {
    for (const u of report.updates) {
      if (Array.isArray(u?.photos)) {
        for (const p of u.photos) {
          if (typeof p === 'string') add(p)
          else if (p && typeof p.url === 'string') add(p.url)
        }
      }
      if (u?.image_url) {
        add(u.image_url)
      }
    }
  }

  return urls
}
