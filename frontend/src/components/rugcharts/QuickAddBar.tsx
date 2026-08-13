interface QuickAddBarProps {
  value: string
  onChange: (value: string) => void
  loading: boolean
  onAdd: () => void
}

export default function QuickAddBar({ value, onChange, loading, onAdd }: QuickAddBarProps) {
  return (
    <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.08)]">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd()
          }}
          placeholder="chain:address (e.g. solana:So1111... or just 0x...)"
          className="flex-1 px-3 py-1.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(139,92,246,0.08)] rounded-lg text-xs text-[#F1F1F6] placeholder:text-[#5C6080] focus:border-[#8B5CF6]/30 focus:outline-none font-mono"
        />
        <button
          onClick={onAdd}
          disabled={loading || !value.trim()}
          className="px-3 py-1.5 bg-[#8B5CF6] hover:bg-[#A78BFA] disabled:opacity-50 rounded-lg text-xs font-semibold uppercase tracking-wider text-white transition-colors"
        >
          {loading ? '...' : '+ Add'}
        </button>
      </div>
    </div>
  )
}
