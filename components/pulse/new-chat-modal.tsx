'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { ME_ID, USERS } from '@/lib/pulse/data'
import { Avatar } from './avatar'
import { Modal } from './modal'

interface NewChatModalProps {
  open: boolean
  existingUserIds: string[]
  onClose: () => void
  onPick: (userId: string) => void
}

function PeerPicker({ existingUserIds, onPick }: Pick<NewChatModalProps, 'existingUserIds' | 'onPick'>) {
  const [query, setQuery] = useState('')
  const peers = Object.values(USERS).filter(
    (user) => user.id !== ME_ID && user.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="peer-search" className="sr-only">
          Search campus peers
        </label>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="peer-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search campus peers..."
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-pulse"
        />
      </div>

      <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
        {peers.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => onPick(user.id)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-panel-2"
            >
              <Avatar initials={user.initials} online={user.online} showPresence />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {user.name}
                  {user.role && <span className="text-muted-foreground"> ({user.role})</span>}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {user.online ? 'Online' : 'Offline'}
                </span>
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {existingUserIds.includes(user.id) ? 'OPEN' : 'START'}
              </span>
            </button>
          </li>
        ))}
        {peers.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">No peers match &quot;{query}&quot;.</li>
        )}
      </ul>
    </div>
  )
}

export function NewChatModal({ open, existingUserIds, onClose, onPick }: NewChatModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="New Chat" description="Pick a campus peer to start a 1-on-1 conversation.">
      <PeerPicker existingUserIds={existingUserIds} onPick={onPick} />
    </Modal>
  )
}
