'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Avatar } from './avatar'
import { Modal } from './modal'

export interface ChatPeer {
  id: string
  name: string
  email?: string
  online?: boolean
}

interface NewChatModalProps {
  open: boolean
  users: ChatPeer[]
  existingUserIds: string[]
  onClose: () => void
  onPick: (userId: string) => void
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}

function PeerPicker({ users, existingUserIds, onPick }: Pick<NewChatModalProps, 'users' | 'existingUserIds' | 'onPick'>) {
  const [query, setQuery] = useState('')
  const filtered = users.filter(
    (user) =>
      user.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(query.trim().toLowerCase())),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="peer-search" className="sr-only">
          Search registered teammates
        </label>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="peer-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search teammates by name or email..."
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-pulse"
        />
      </div>

      <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
        {filtered.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => onPick(user.id)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-panel-2"
            >
              <Avatar initials={getInitials(user.name)} online={user.online ?? true} showPresence />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {user.name}
                </span>
                {user.email && (
                  <span className="font-mono text-[11px] text-muted-foreground truncate">
                    {user.email}
                  </span>
                )}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {existingUserIds.includes(user.id) ? 'OPEN' : 'START'}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">
            {users.length === 0 ? 'No other registered teammates found.' : `No teammates match "${query}".`}
          </li>
        )}
      </ul>
    </div>
  )
}

export function NewChatModal({ open, users, existingUserIds, onClose, onPick }: NewChatModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="New Direct Message" description="Select a registered teammate to start a 1-on-1 private chat.">
      <PeerPicker users={users} existingUserIds={existingUserIds} onPick={onPick} />
    </Modal>
  )
}
