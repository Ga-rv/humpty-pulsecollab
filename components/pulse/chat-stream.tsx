'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Hash, Menu, MessageSquare, Plus, Send, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAIN_ROOM_ID, ME_ID, USERS } from '@/lib/pulse/data'
import { SCOPE_LABEL } from '@/lib/pulse/types'
import type { Message, Room, ScanScope, Session } from '@/lib/pulse/types'
import { MessageItem } from './message-item'

interface ChatStreamProps {
  room: Room
  messages: Message[]
  session: Session | null
  pulseActive: boolean
  scanning: boolean
  scanKey: number
  typingUserId: string | null
  scope: ScanScope
  onScopeChange: (scope: ScanScope) => void
  onSend: (text: string) => void
  onSynthesize: () => void
  onAddContext: () => void
  onOpenSidebar: () => void
  drawerOpen: boolean
  onToggleDrawer: () => void
  onTyping?: () => void
  onStopTyping?: () => void
}

export function ChatStream({
  room,
  messages,
  session,
  pulseActive,
  scanning,
  scanKey,
  typingUserId,
  scope,
  onScopeChange,
  onSend,
  onSynthesize,
  onAddContext,
  onOpenSidebar,
  drawerOpen,
  onToggleDrawer,
  onTyping,
  onStopTyping,
}: ChatStreamProps) {
  const [draft, setDraft] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [messages.length, room.id, typingUserId])

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value)
    if (onTyping) {
      onTyping()
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        onStopTyping?.()
      }, 1500)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    onStopTyping?.()
    onSend(text)
    setDraft('')
  }

  const currentUserName = session?.name || 'Guest User'
  const currentUserInitials = session?.initials || 'GU'

  const typingUser = typingUserId ? (USERS[typingUserId] || { name: typingUserId }) : null
  const isChannel = room.type === 'channel'
  const dmUser = room.userId ? USERS[room.userId] : null

  return (
    <section aria-label={`Conversation: ${room.name}`} className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex flex-row items-center justify-between w-full h-14 px-4 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open navigation"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground md:hidden"
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>

          <h1 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
            {isChannel ? (
              <Hash className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <MessageSquare className="size-4 shrink-0 text-pulse" aria-hidden="true" />
            )}
            <span className="truncate">{room.name}</span>
          </h1>

          <span className="hidden min-w-0 truncate rounded-full border border-border bg-panel-2 px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-block">
            {room.context}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full',
                (isChannel || dmUser?.online !== false) ? 'bg-ok' : 'bg-muted-foreground/60',
              )}
              aria-hidden="true"
            />
            {isChannel ? `${room.onlineCount} online` : 'Online'}
          </span>
          <button
            type="button"
            onClick={onAddContext}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:border-muted-foreground/50"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add Context
          </button>
          <button
            type="button"
            onClick={onToggleDrawer}
            aria-pressed={drawerOpen}
            aria-label={drawerOpen ? 'Close Pulse drawer' : 'Open Pulse drawer'}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors',
              drawerOpen
                ? 'border-pulse bg-pulse text-background'
                : 'border-pulse/30 bg-pulse-soft text-pulse hover:border-pulse/60',
            )}
          >
            <Zap className={cn('size-3.5', drawerOpen ? 'fill-background' : 'fill-pulse')} aria-hidden="true" />
            <span className="hidden sm:inline">Pulse</span>
            <span className="sr-only sm:hidden">Pulse</span>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {scanning && <div key={scanKey} className="scan-line" aria-hidden="true" />}
        <div ref={feedRef} className="h-full overflow-y-auto px-3 py-3 sm:px-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full border border-border bg-panel-2">
                {isChannel ? (
                  <Hash className="size-5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <MessageSquare className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <p className="text-sm font-medium text-foreground">
                {isChannel ? `Welcome to #${room.name}` : `No direct messages yet`}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {isChannel
                  ? 'Start the discussion below.'
                  : `Start a conversation with ${room.name}.`}
              </p>
            </div>
          ) : (
            <ol
              role="log"
              aria-live="polite"
              aria-label="Messages"
              className="flex flex-col gap-2"
            >
              {messages.map((message) => {
                const outgoing =
                  message.authorId === (session?.userId || '') ||
                  message.authorId === currentUserName ||
                  message.authorId === ME_ID ||
                  message.authorId === 'guest'
                const fallbackName = room.type === 'dm' ? room.name : message.authorId
                const author = USERS[message.authorId] ?? {
                  id: message.authorId,
                  name: fallbackName,
                  initials: fallbackName.slice(0, 2).toUpperCase(),
                  online: true,
                }
                const displayName = outgoing
                  ? currentUserName
                  : room.type === 'dm'
                  ? room.name
                  : author.name
                const displayInitials = outgoing
                  ? currentUserInitials
                  : room.type === 'dm'
                  ? room.name.slice(0, 2).toUpperCase()
                  : author.initials

                return (
                  <MessageItem
                    key={message.id}
                    message={message}
                    author={author}
                    displayName={displayName}
                    displayInitials={displayInitials}
                    outgoing={outgoing}
                    highlighted={pulseActive && room.id === MAIN_ROOM_ID && !!message.pulseKind}
                  />
                )
              })}
            </ol>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-panel px-3 pb-3 pt-1.5 sm:px-4">
        <p className="mb-1 min-h-4 text-[11px] italic text-muted-foreground" aria-live="polite">
          {typingUser && (
            <>
              {typingUser.name} is typing
              <span className="typing-dot">.</span>
              <span className="typing-dot [animation-delay:0.2s]">.</span>
              <span className="typing-dot [animation-delay:0.4s]">.</span>
            </>
          )}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="compose-input" className="sr-only">
              Message
            </label>
            <input
              id="compose-input"
              value={draft}
              onChange={handleInputChange}
              onBlur={() => onStopTyping?.()}
              placeholder="Type a message or paste a deadline..."
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-pulse"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 text-[13px] font-medium text-foreground transition-colors hover:border-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative">
              <label htmlFor="scan-scope" className="sr-only">
                Pulse scan scope
              </label>
              <select
                id="scan-scope"
                value={scope}
                onChange={(event) => onScopeChange(event.target.value as ScanScope)}
                className="h-8 appearance-none rounded-lg border border-border bg-background pl-2.5 pr-7 font-mono text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:border-pulse"
              >
                {(Object.keys(SCOPE_LABEL) as ScanScope[]).map((key) => (
                  <option key={key} value={key}>
                    {SCOPE_LABEL[key]}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>

            <button
              type="button"
              onClick={onSynthesize}
              disabled={scanning}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg bg-pulse px-3.5 text-[13px] font-semibold text-background transition-opacity disabled:opacity-70',
                !scanning && 'pulse-glow hover:opacity-90',
              )}
            >
              <Zap className="size-4 fill-background" aria-hidden="true" />
              {scanning ? 'Scanning...' : 'Synthesize Pulse'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
