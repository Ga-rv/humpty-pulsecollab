import { Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PulseCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <article className={cn('flex flex-col gap-2 rounded-lg border border-border bg-panel-2 p-3', className)}>
      {children}
    </article>
  )
}

type Tone = 'danger' | 'pulse'

const TONE_STYLES: Record<Tone, string> = {
  danger: 'border-danger/30 bg-danger/10 text-danger',
  pulse: 'border-pulse/30 bg-pulse-soft text-pulse',
}

export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide',
        TONE_STYLES[tone],
      )}
    >
      {children}
    </span>
  )
}

interface ActionButtonProps {
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  active?: boolean
  activeLabel?: string
}

export function ActionButton({ onClick, children, icon, active, activeLabel }: ActionButtonProps) {
  if (active) {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-md border border-ok/30 bg-ok/10 px-2.5 text-xs font-medium text-ok">
        <Check className="size-3.5" aria-hidden="true" />
        {activeLabel}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:border-pulse/50 hover:text-pulse"
    >
      {icon ?? <Plus className="size-3.5" aria-hidden="true" />}
      {children}
    </button>
  )
}
