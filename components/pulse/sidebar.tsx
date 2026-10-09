'use client'

import { Hash, LogIn, LogOut, Plus, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHANNELS } from '@/lib/pulse/data'
import type { Session } from '@/lib/pulse/types'
import { Avatar } from './avatar'

export interface ChatUser {
  id: string
  _id?: string
  name: string
  username?: string
  email?: string
  avatarUrl?: string
  online?: boolean
}

interface SidebarProps {
  open: boolean
  activeRoomId: string
  unread: Record<string, number>
  registeredUsers?: ChatUser[]
  session: Session | null
  onSelectRoom: (roomId: string) => void
  onNewChat: () => void
  onOpenAuth: () => void
  onClose: () => void
  onSignOut?: () => void
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-border px-1.5 py-px font-mono text-[10px] font-semibold text-foreground">
      <span className="sr-only">{count} unread messages</span>
      <span aria-hidden="true">{count}</span>
    </span>
  )
}

export function Sidebar({
  open,
  activeRoomId,
  unread,
  registeredUsers = [],
  session,
  onSelectRoom,
  onNewChat,
  onOpenAuth,
  onClose,
  onSignOut,
}: SidebarProps) {
  const isGuest = !session || Boolean(session.isGuest) || session.role === 'Guest' || !session.token

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Workspace navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[260px] shrink-0 flex-col border-r border-border bg-panel transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-3">
          <div className="flex items-center gap-1.5">
            <Zap className="size-4 fill-pulse text-pulse" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight text-foreground">PulseCollab</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-ok">
            <span className="live-dot size-1.5 rounded-full bg-ok" aria-hidden="true" />
            LIVE
          </span>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
          <section aria-labelledby="rooms-heading">
            <h2
              id="rooms-heading"
              className="px-2 pb-1.5 pt-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Sprint Channels / War Rooms
            </h2>
            <ul className="flex flex-col gap-0.5">
              {CHANNELS.map((room) => {
                const active = room.id === activeRoomId
                return (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRoom(room.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[13px] transition-colors',
                        active
                          ? 'border-border bg-panel-2 font-medium text-foreground'
                          : 'border-transparent text-muted-foreground hover:bg-panel-2/60 hover:text-foreground',
                        !active && unread[room.id] ? 'text-foreground' : '',
                      )}
                    >
                      <Hash className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{room.name}</span>
                      {!active && <UnreadBadge count={unread[room.id] ?? 0} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="dm-heading">
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
              <h2
                id="dm-heading"
                className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Direct Messages
              </h2>
              {!isGuest && (
                <button
                  type="button"
                  onClick={onNewChat}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  New Chat
                </button>
              )}
            </div>
            {isGuest ? (
              <p className="px-2 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                Sign in to chat
              </p>
            ) : registeredUsers.length === 0 ? (
              <p className="px-2 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                No active conversations yet. Click + New Chat to start a thread.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {registeredUsers.map((user) => {
                  const roomId = `dm-${user.id}`
                  const active = roomId === activeRoomId
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => onSelectRoom(roomId)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] transition-colors',
                          active
                            ? 'border-border bg-panel-2 font-medium text-foreground'
                            : 'border-transparent text-muted-foreground hover:bg-panel-2/60 hover:text-foreground',
                          !active && unread[roomId] ? 'text-foreground' : '',
                        )}
                      >
                        <Avatar
                          initials={getInitials(user.name)}
                          size="sm"
                          online={user.online ?? true}
                          showPresence
                        />
                        <span className="truncate">{user.name}</span>
                        <span className="sr-only">
                          {user.online !== false ? 'Online' : 'Offline'}
                        </span>
                        {!active && <UnreadBadge count={unread[roomId] ?? 0} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </nav>

        {isGuest ? (
          <div className="flex flex-col gap-2 border-t border-border p-2.5">
            <div className="flex items-center gap-2">
              <Avatar initials="GU" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">Guest User</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">Not signed in</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-pulse px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              <LogIn className="size-3.5" aria-hidden="true" />
              Sign In / Register
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-border p-2.5">
            <Avatar initials={session.initials} showPresence online />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{session.name}</p>
              <span className="mt-0.5 inline-flex rounded-full border border-border bg-panel-2 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                {session.role}
              </span>
            </div>
            <button
              type="button"
              onClick={onSignOut || onOpenAuth}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
