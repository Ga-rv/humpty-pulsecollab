import { CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message, PulseKind, User } from '@/lib/pulse/types'
import { Avatar } from './avatar'

const PULSE_TAG: Record<PulseKind, string> = {
  deadline: 'DEADLINE',
  action: 'ACTION',
  unresolved: 'OPEN QUESTION',
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN)
  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
          >
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

interface MessageItemProps {
  message: Message
  author: User
  displayName: string
  displayInitials: string
  outgoing: boolean
  highlighted: boolean
}

export function MessageItem({
  message,
  author,
  displayName,
  displayInitials,
  outgoing,
  highlighted,
}: MessageItemProps) {
  if (message.kind === 'context') {
    return (
      <li className="flex justify-center py-1">
        <p className="max-w-[90%] rounded-full border border-border bg-panel px-3 py-1 text-center font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground">CONTEXT</span> {message.text}
          <span className="ml-2">{message.time}</span>
        </p>
      </li>
    )
  }

  const tag = highlighted && message.pulseKind ? PULSE_TAG[message.pulseKind] : null

  return (
    <li className={cn('flex gap-2', outgoing ? 'justify-end' : 'justify-start')}>
      {!outgoing && <Avatar initials={author.initials} className="mt-0.5" />}
      <article
        className={cn(
          'max-w-[85%] rounded-lg border border-l-2 px-3 py-2 transition-colors duration-300 sm:max-w-[70%]',
          outgoing
            ? 'border-pulse/25 bg-pulse-soft'
            : 'border-border bg-panel-2',
          highlighted ? 'border-l-pulse' : outgoing ? 'border-l-pulse/25' : 'border-l-border',
        )}
      >
        <header className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-bold text-foreground">
            {outgoing ? `${displayName} (You)` : displayName}
          </span>
          <time className="font-mono text-[11px] text-muted-foreground">{message.time}</time>
          {tag && (
            <span className="rounded-full border border-pulse/30 bg-pulse-soft px-1.5 py-px font-mono text-[9px] font-semibold tracking-wide text-pulse">
              {tag}
            </span>
          )}
        </header>
        <p className="text-[13.5px] leading-relaxed text-foreground">
          <Linkified text={message.text} />
        </p>
        {outgoing && (
          <p className="mt-1 flex items-center justify-end gap-1 font-mono text-[10px] text-muted-foreground">
            <CheckCheck className="size-3.5 text-pulse" aria-hidden="true" />
            <span className="sr-only">Delivered</span>
          </p>
        )}
      </article>
      {outgoing && <Avatar initials={displayInitials} className="mt-0.5" />}
    </li>
  )
}
