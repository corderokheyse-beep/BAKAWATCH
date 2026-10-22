'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  lastPage: number
  onPageChange: (page: number) => void
}

export default function Pagination({ currentPage, lastPage, onPageChange }: PaginationProps) {
  if (lastPage <= 1) return null

  const pages: (number | '…')[] = []
  if (lastPage <= 7) {
    for (let i = 1; i <= lastPage; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('…')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(lastPage - 1, currentPage + 1); i++) pages.push(i)
    if (currentPage < lastPage - 2) pages.push('…')
    pages.push(lastPage)
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        <ChevronLeft className="w-4 h-4 text-gray-600" />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-sm text-gray-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            className={cn(
              'w-9 h-9 rounded-xl text-sm font-semibold transition-all duration-150',
              p === currentPage
                ? 'bg-primary-600 text-white shadow-button'
                : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === lastPage}
        className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        <ChevronRight className="w-4 h-4 text-gray-600" />
      </button>
    </div>
  )
}
