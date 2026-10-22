import { cn } from '@/lib/utils'

const STATUS_MAP: Record<string, { dot: string; bg: string; text: string; label?: string }> = {
  // Report statuses
  pending:       { dot: 'bg-amber-400',  bg: 'bg-amber-50',   text: 'text-amber-700' },
  approved:      { dot: 'bg-green-500',  bg: 'bg-green-50',   text: 'text-green-700', label: 'Resolved' },
  rejected:      { dot: 'bg-red-500',    bg: 'bg-red-50',     text: 'text-red-700' },
  investigating: { dot: 'bg-blue-500',   bg: 'bg-blue-50',    text: 'text-blue-700', label: 'Under Review' },
  resolved:      { dot: 'bg-teal-500',   bg: 'bg-teal-50',    text: 'text-teal-700' },
  // Threat-monitoring workflow statuses
  submitted:         { dot: 'bg-amber-400', bg: 'bg-amber-50',  text: 'text-amber-700', label: 'Submitted' },
  under_review:      { dot: 'bg-blue-500',  bg: 'bg-blue-50',   text: 'text-blue-700',  label: 'Under Review' },
  under_observation: { dot: 'bg-indigo-500',bg: 'bg-indigo-50', text: 'text-indigo-700',label: 'Under Observation' },
  action_taken:      { dot: 'bg-cyan-500',  bg: 'bg-cyan-50',   text: 'text-cyan-700',  label: 'Action Taken' },
  recovering:        { dot: 'bg-lime-500',  bg: 'bg-lime-50',   text: 'text-lime-700',  label: 'Recovering' },
  // Site statuses (active / inactive / in progress)
  active:       { dot: 'bg-green-500',  bg: 'bg-green-50',   text: 'text-green-700' },
  inactive:     { dot: 'bg-gray-400',   bg: 'bg-gray-100',   text: 'text-gray-600' },
  in_progress:  { dot: 'bg-amber-400',  bg: 'bg-amber-50',   text: 'text-amber-700', label: 'In Progress' },
  // Legacy project statuses (restoration_projects module)
  planned:      { dot: 'bg-violet-400', bg: 'bg-violet-50',  text: 'text-violet-700' },
  completed:    { dot: 'bg-teal-500',   bg: 'bg-teal-50',    text: 'text-teal-700' },
  suspended:    { dot: 'bg-gray-400',   bg: 'bg-gray-100',   text: 'text-gray-600' },
  cancelled:    { dot: 'bg-red-400',    bg: 'bg-red-50',     text: 'text-red-600' },
  // Plantation statuses
  flagged:      { dot: 'bg-orange-400', bg: 'bg-orange-50',  text: 'text-orange-700' },
  dead:         { dot: 'bg-red-400',    bg: 'bg-red-50',     text: 'text-red-600' },
  // Event statuses
  open:         { dot: 'bg-green-500',  bg: 'bg-green-50',   text: 'text-green-700' },
  upcoming:     { dot: 'bg-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-700' },
  'on-going':   { dot: 'bg-amber-500',  bg: 'bg-amber-50',   text: 'text-amber-700', label: 'On-Going' },
  closed:       { dot: 'bg-gray-400',   bg: 'bg-gray-100',   text: 'text-gray-600' },
  // Photo types
  before:       { dot: 'bg-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-700' },
  after:        { dot: 'bg-green-400',  bg: 'bg-green-50',   text: 'text-green-700' },
  // Categories
  damage:       { dot: 'bg-red-400',    bg: 'bg-red-50',     text: 'text-red-700' },
  restoration:  { dot: 'bg-green-500',  bg: 'bg-green-50',   text: 'text-green-700' },
  event_accomplishment: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Accomplishment Reports' },
  wildlife:     { dot: 'bg-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-700' },
  pollution:    { dot: 'bg-orange-400', bg: 'bg-orange-50',  text: 'text-orange-700' },
  other:        { dot: 'bg-gray-400',   bg: 'bg-gray-100',   text: 'text-gray-600' },
}

interface BadgeProps {
  label: string
  type?: 'status' | 'category' | 'custom'
  className?: string
  dot?: boolean
}

export default function Badge({ label, type = 'custom', className, dot = true }: BadgeProps) {
  const style = STATUS_MAP[label] ?? { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' }
  // Use an explicit label override from STATUS_MAP when defined (e.g. 'approved' → 'Resolved'),
  // otherwise fall back to the capitalised key value.
  const display = style.label ?? label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <span className={cn('badge', style.bg, style.text, className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />}
      {display}
    </span>
  )
}
