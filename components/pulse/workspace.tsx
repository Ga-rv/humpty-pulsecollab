'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import {
  INITIAL_DM_USER_IDS,
  MAIN_ROOM_ID,
  ME_ID,
  REPLIES,
  SEED_MESSAGES,
  SEED_TRACKER,
  SEED_UNREAD,
  USERS,
  formatTime,
  getRoom,
} from '@/lib/pulse/data'
import type { Message, PulseTab, ScanScope, Session, TrackerTask } from '@/lib/pulse/types'
import { AddContextModal } from './add-context-modal'
import { AuthModal, type AuthPayload } from './auth-modal'
import { ChatStream } from './chat-stream'
import { NewChatModal } from './new-chat-modal'
import { PulseDrawer } from './pulse-drawer'
import { Sidebar } from './sidebar'

const DEFAULT_SESSION: Session = {
  name: USERS[ME_ID].name,
  initials: USERS[ME_ID].initials,
  email: 'arpit@campus.edu',
  role: 'Lead Dev',
}

const SCAN_DURATION_MS = 1200
const TYPING_DELAY_MS = 600
const REPLY_DELAY_MS = 2200

function toTitleCase(value: string) {
  return value
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function toInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
  return letters.slice(0, 2).toUpperCase() || 'ME'
}

export function Workspace() {
  const [session, setSession] = useState<Session>(DEFAULT_SESSION)
  const [activeRoomId, setActiveRoomId] = useState(MAIN_ROOM_ID)
  const [messages, setMessages] = useState<Record<string, Message[]>>(SEED_MESSAGES)
  const [unread, setUnread] = useState<Record<string, number>>(SEED_UNREAD)
  const [dmUserIds, setDmUserIds] = useState<string[]>(INITIAL_DM_USER_IDS)
  const [typing, setTyping] = useState<{ roomId: string; userId: string } | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [tab, setTab] = useState<PulseTab>('deadlines')
  const [scope, setScope] = useState<ScanScope>('last-50')
  const [scanning, setScanning] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [pulseActive, setPulseActive] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [converted, setConverted] = useState<Record<string, boolean>>({})
  const [tracker, setTracker] = useState<TrackerTask[]>(SEED_TRACKER)

  const [authOpen, setAuthOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)

  const activeRoomRef = useRef(activeRoomId)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const idCounter = useRef(0)

  useEffect(() => {
    activeRoomRef.current = activeRoomId
  }, [activeRoomId])

  useEffect(() => {
    if (window.innerWidth < 1280) setDrawerOpen(false)
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const schedule = useCallback((callback: () => void, delay: number) => {
    timers.current.push(setTimeout(callback, delay))
  }, [])

  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1
    return `${prefix}-${idCounter.current}`
  }, [])

  const appendMessage = useCallback((message: Message) => {
    setMessages((current) => ({
      ...current,
      [message.roomId]: [...(current[message.roomId] ?? []), message],
    }))
  }, [])

  const selectRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId)
    setUnread((current) => {
      if (!current[roomId]) return current
      const { [roomId]: _cleared, ...rest } = current
      return rest
    })
    setSidebarOpen(false)
  }, [])

  const handleSend = useCallback(
    (text: string) => {
      const room = getRoom(activeRoomId)
      const roomId = room.id
      appendMessage({ id: nextId('msg'), roomId, authorId: ME_ID, text, time: formatTime() })

      const replies = REPLIES[room.responderId]
      if (!replies) return

      schedule(() => setTyping({ roomId, userId: room.responderId }), TYPING_DELAY_MS)
      schedule(() => {
        setTyping(null)
        appendMessage({
          id: nextId('reply'),
          roomId,
          authorId: room.responderId,
          text: replies[Math.floor(Math.random() * replies.length)],
          time: formatTime(),
        })
        if (activeRoomRef.current !== roomId) {
          setUnread((current) => ({ ...current, [roomId]: (current[roomId] ?? 0) + 1 }))
        }
      }, REPLY_DELAY_MS)
    },
    [activeRoomId, appendMessage, nextId, schedule],
  )

  const handleSynthesize = useCallback(() => {
    setDrawerOpen(true)
    setTab('deadlines')
    setScanning(true)
    setScanKey((key) => key + 1)
    schedule(() => {
      setScanning(false)
      setPulseActive(true)
      setSyncedAt(Date.now())
    }, SCAN_DURATION_MS)
  }, [schedule])

  const handleConvert = useCallback(
    (key: string, title: string, owner: string) => {
      setConverted((current) => ({ ...current, [key]: true }))
      setTracker((current) => [
        { id: nextId('task'), title, owner, done: false, fromPulse: true },
        ...current,
      ])
    },
    [nextId],
  )

  const handleToggleTask = useCallback((id: string) => {
    setTracker((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)))
  }, [])

  const handlePickPeer = useCallback(
    (userId: string) => {
      setDmUserIds((current) => (current.includes(userId) ? current : [...current, userId]))
      setMessages((current) => (current[`dm-${userId}`] ? current : { ...current, [`dm-${userId}`]: [] }))
      setNewChatOpen(false)
      selectRoom(`dm-${userId}`)
    },
    [selectRoom],
  )

  const handleAuth = useCallback((payload: AuthPayload) => {
    const name = toTitleCase(payload.username || payload.email.split('@')[0])
    setSession({
      name,
      initials: toInitials(name),
      email: payload.email,
      role: payload.mode === 'create' ? 'Member' : 'Lead Dev',
    })
    setAuthOpen(false)
  }, [])

  const handleAddContext = useCallback(
    (text: string) => {
      appendMessage({
        id: nextId('ctx'),
        roomId: activeRoomId,
        authorId: ME_ID,
        text,
        time: formatTime(),
        kind: 'context',
      })
      setContextOpen(false)
    },
    [activeRoomId, appendMessage, nextId],
  )

  const room = getRoom(activeRoomId)
  const typingUserId = typing && typing.roomId === activeRoomId ? typing.userId : null

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar
        open={sidebarOpen}
        activeRoomId={activeRoomId}
        unread={unread}
        dmUserIds={dmUserIds}
        session={session}
        onSelectRoom={selectRoom}
        onNewChat={() => setNewChatOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="relative flex min-w-0 flex-1">
        <ChatStream
          room={room}
          messages={messages[activeRoomId] ?? []}
          session={session}
          pulseActive={pulseActive}
          scanning={scanning}
          scanKey={scanKey}
          typingUserId={typingUserId}
          scope={scope}
          onScopeChange={setScope}
          onSend={handleSend}
          onSynthesize={handleSynthesize}
          onAddContext={() => setContextOpen(true)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        {!drawerOpen && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="absolute right-3 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-pulse/30 bg-pulse-soft px-2.5 text-xs font-semibold text-pulse transition-colors hover:border-pulse/60"
          >
            <Zap className="size-3.5 fill-pulse" aria-hidden="true" />
            <span className="hidden sm:inline">Pulse</span>
            <span className="sr-only sm:hidden">Open Pulse</span>
          </button>
        )}

        <PulseDrawer
          open={drawerOpen}
          tab={tab}
          scanning={scanning}
          syncedAt={syncedAt}
          scope={scope}
          converted={converted}
          tracker={tracker}
          currentUserName={session.name}
          onTabChange={setTab}
          onConvert={handleConvert}
          onToggleTask={handleToggleTask}
          onClose={() => setDrawerOpen(false)}
        />
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSubmit={handleAuth} />
      <NewChatModal
        open={newChatOpen}
        existingUserIds={dmUserIds}
        onClose={() => setNewChatOpen(false)}
        onPick={handlePickPeer}
      />
      <AddContextModal
        open={contextOpen}
        roomName={room.name}
        onClose={() => setContextOpen(false)}
        onSubmit={handleAddContext}
      />
    </div>
  )
}
