import { cn } from '@/lib/utils'
import { TreePine } from 'lucide-react'

interface Props {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

export default function LoadingSpinner({ className, size = 'md', label }: Props) {
  const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
      <div className="relative">
        <div className={cn('border-4 border-gray-100 border-t-primary-500 rounded-full animate-spin', sizes[size])} />
        <div className="absolute inset-0 flex items-center justify-center">
          <TreePine className={cn('text-primary-400', size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-3 h-3' : 'w-5 h-5')} />
        </div>
      </div>
      {label && <p className="text-xs text-gray-400 font-medium">{label}</p>}
    </div>
  )
}
