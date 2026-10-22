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
