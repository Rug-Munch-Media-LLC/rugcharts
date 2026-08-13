import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ComparePaginationProps {
  page: number
  totalPages: number
  count: number
  onPrev: () => void
  onNext: () => void
}

export default function ComparePagination({ page, totalPages, count, onPrev, onNext }: ComparePaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-2 text-[10px]">
      <span className="text-[#5C6080]">
        Page {page + 1} of {totalPages} · {count} tokens
      </span>
      <div className="flex gap-1">
        <button
          onClick={onPrev}
          disabled={page === 0}
          className="p-1 bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.2)] disabled:opacity-30 rounded"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages - 1}
          className="p-1 bg-[rgba(139,92,246,0.08)] hover:bg-[rgba(139,92,246,0.2)] disabled:opacity-30 rounded"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
