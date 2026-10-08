import { cn } from '@/lib/utils'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md'
  online?: boolean
  showPresence?: boolean
  className?: string
}

export function Avatar({ initials, size = 'md', online, showPresence, className }: AvatarProps) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-panel-2 font-mono font-semibold text-foreground',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-[11px]',
        className,
      )}
      aria-hidden="true"
    >
      {initials}
      {showPresence && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-panel',
            online ? 'bg-ok' : 'bg-muted-foreground/60',
          )}
        />
      )}
    </span>
  )
}
