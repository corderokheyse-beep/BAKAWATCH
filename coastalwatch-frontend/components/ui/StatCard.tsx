import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color?: string
  bgColor?: string
  accentClass?: string
  subtitle?: string
  trend?: { value: number; label: string }
}

export default function StatCard({
  title, value, icon: Icon,
  color = 'text-primary-600',
  bgColor = 'bg-primary-50',
  accentClass = '',
  subtitle,
  trend,
}: StatCardProps) {
  return (
    <div className={cn(
      'stat-card stat-card-glow group',
      'transition-all duration-300 ease-out',
      'hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:border-gray-200',
      'cursor-default select-none',
      accentClass,
    )}>
      {/* Icon — floats gently on hover */}
      <div className={cn(
        'p-2.5 rounded-xl shrink-0 transition-transform duration-300',
        'group-hover:scale-110',
        bgColor,
      )}>
        <Icon className={cn('w-5 h-5 transition-transform duration-300', color)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
          {title}
        </p>
        <p className={cn(
          'text-2xl font-bold text-gray-900 tabular-nums mt-0.5',
          'animate-count-up',
        )}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
        {trend && (
          <p className={cn(
            'text-xs font-semibold mt-1 flex items-center gap-0.5',
            trend.value >= 0 ? 'text-green-600' : 'text-red-500',
          )}>
            <span className="text-sm leading-none">
              {trend.value >= 0 ? '↑' : '↓'}
            </span>
            {Math.abs(trend.value)} {trend.label}
          </p>
        )}
      </div>
    </div>
  )
}
