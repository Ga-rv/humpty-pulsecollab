'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import {
  MAIN_ROOM_ID,
  formatTime,
  getRoom,
} from '@/lib/pulse/data'
import type {
  Message,
  PulseSynthesisData,
  PulseTab,
  ScanScope,
  Session,
  TrackerTask,
} from '@/lib/pulse/types'
import { AddContextModal } from './add-context-modal'
import { AuthModal, type AuthPayload } from './auth-modal'
import { ChatStream } from './chat-stream'
import { PulseDrawer } from './pulse-drawer'
import { Sidebar } from './sidebar'

const GUEST_SESSION: Session = {
  name: 'Guest User',
  initials: 'GU',
  email: '',
  role: 'Guest',
  isGuest: true,
}

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
  return letters.slice(0, 2).toUpperCase() || 'GU'
}

export function Workspace() {
  const [session, setSession] = useState<Session | null>(GUEST_SESSION)
  const [activeRoomId, setActiveRoomId] = useState(MAIN_ROOM_ID)
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [dmUserIds, setDmUserIds] = useState<string[]>([])
  const [typing, setTyping] = useState<{ roomId: string; userId: string } | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState<PulseTab>('deadlines')
  const [scope, setScope] = useState<ScanScope>('last-50')
  const [scanning, setScanning] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [pulseActive, setPulseActive] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [converted, setConverted] = useState<Record<string, boolean>>({})
  const [tracker, setTracker] = useState<TrackerTask[]>([])
  const [synthesisData, setSynthesisData] = useState<PulseSynthesisData | null>(null)

  const [authOpen, setAuthOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)

  const activeRoomRef = useRef(activeRoomId)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const idCounter = useRef(0)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    activeRoomRef.current = activeRoomId
  }, [activeRoomId])

  // Initialize Socket.IO connection
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join_room', activeRoomRef.current)
    })

    socket.on('receive_message', (data: Record<string, unknown>) => {
      const roomId = (data.roomId || data.conversationId || activeRoomRef.current) as string

      // Ignore incoming DM socket messages if DMs are disabled
      if (roomId.startsWith('dm-')) return

      const incoming: Message = {
        id: (data.id || data._id || `sock-${Date.now()}`) as string,
        roomId,
        authorId: (data.authorId || data.sender || 'peer') as string,
        text: (data.text || data.content || '') as string,
        time: (data.time || formatTime()) as string,
        pulseKind: data.pulseKind as Message['pulseKind'],
      }

      setMessages((current) => {
        const roomMsgs = current[roomId] ?? []
        // Deduplicate
        if (roomMsgs.some((m) => m.id === incoming.id || (m.text === incoming.text && m.time === incoming.time && m.authorId === incoming.authorId))) {
          return current
        }
        return {
          ...current,
          [roomId]: [...roomMsgs, incoming],
        }
      })

      if (activeRoomRef.current !== roomId) {
        setUnread((current) => ({ ...current, [roomId]: (current[roomId] ?? 0) + 1 }))
      }
    })

    socket.on('typing', (data: { roomId: string; userId?: string; username?: string }) => {
      setTyping({ roomId: data.roomId, userId: data.userId || data.username || 'peer' })
    })

    socket.on('stop_typing', (data: { roomId: string }) => {
      setTyping((prev) => (prev?.roomId === data.roomId ? null : prev))
    })

    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      socket.disconnect()
    }
  }, [])

  // Join room and load DB messages + tasks whenever activeRoomId or session changes
  useEffect(() => {
    // If somehow a DM thread was selected, immediately fallback to MAIN_ROOM_ID
    if (activeRoomId.startsWith('dm-')) {
      setActiveRoomId(MAIN_ROOM_ID)
      return
    }

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_room', activeRoomId)
    }

    // Fetch messages from MongoDB for the active channel
    fetch(`/api/messages?conversationId=${encodeURIComponent(activeRoomId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages && Array.isArray(data.messages)) {
          interface DbMsg {
            _id?: string
            id?: string
            conversationId: string
            sender: string
            content: string
            createdAt: string
          }
          const dbMsgs: Message[] = data.messages.map((m: DbMsg) => ({
            id: m._id || m.id || `db-${Date.now()}`,
            roomId: m.conversationId,
            authorId: m.sender,
            text: m.content,
            time: formatTime(new Date(m.createdAt)),
          }))
          setMessages((curr) => ({
            ...curr,
            [activeRoomId]: dbMsgs,
          }))
        }
      })
      .catch(() => {})

    // Fetch tasks from MongoDB for the active channel
    fetch(`/api/tasks?conversationId=${encodeURIComponent(activeRoomId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tasks && Array.isArray(data.tasks)) {
          interface DbTask {
            _id?: string
            id?: string
            title: string
            assignee: string
            status: string
            deadline?: string
          }
          const dbTasks: TrackerTask[] = data.tasks.map((t: DbTask) => ({
            id: t._id || t.id || `task-${Date.now()}`,
            title: t.title,
            owner: t.assignee || 'Team',
            done: t.status === 'completed',
            deadline: t.deadline,
            fromPulse: true,
          }))
          setTracker(dbTasks)
        }
      })
      .catch(() => {})
  }, [activeRoomId, session?.email])

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
    // If a DM is clicked or requested, ignore or redirect to main channel
    if (roomId.startsWith('dm-')) return

    setActiveRoomId(roomId)
    setUnread((current) => {
      if (!current[roomId]) return current
      const { [roomId]: _cleared, ...rest } = current
      return rest
    })
    setSidebarOpen(false)
  }, [])

  const currentUserName = session?.name || 'Guest User'

  const handleSend = useCallback(
    (text: string) => {
      const room = getRoom(activeRoomId)
      const roomId = room.id
      const msgId = nextId('msg')
      const time = formatTime()

      const outgoingMessage: Message = {
        id: msgId,
        roomId,
        authorId: currentUserName,
        text,
        time,
      }

      appendMessage(outgoingMessage)

      // Emit to Socket.IO room
      if (socketRef.current) {
        socketRef.current.emit('send_message', {
          id: msgId,
          roomId,
          conversationId: roomId,
          authorId: currentUserName,
          sender: currentUserName,
          content: text,
          text,
          time,
        })
      }

      // Persist to MongoDB
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: roomId,
          sender: currentUserName,
          content: text,
        }),
      }).catch((err) => console.warn('Failed to persist message to DB:', err))
    },
    [activeRoomId, appendMessage, currentUserName, nextId],
  )

  const handleTypingEvent = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('typing', {
        roomId: activeRoomId,
        userId: currentUserName,
        username: currentUserName,
      })
    }
  }, [activeRoomId, currentUserName])

  const handleStopTypingEvent = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('stop_typing', {
        roomId: activeRoomId,
      })
    }
  }, [activeRoomId])

  const handleSynthesize = useCallback(async () => {
    setDrawerOpen(true)
    setTab('deadlines')
    setScanning(true)
    setScanKey((key) => key + 1)

    const scopeParam = scope === 'last-50' ? 'last50' : 'today'

    try {
      const res = await fetch('/api/pulse/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeRoomId,
          scope: scopeParam,
        }),
      })

      const data = await res.json()

      if (res.ok && data) {
        setSynthesisData(data)
        setPulseActive(true)
        setSyncedAt(Date.now())
      } else {
        console.warn('Synthesis returned non-ok result:', data)
        setPulseActive(true)
        setSyncedAt(Date.now())
      }
    } catch (err) {
      console.error('Failed to synthesize pulse:', err)
      setPulseActive(true)
      setSyncedAt(Date.now())
    } finally {
      setScanning(false)
    }
  }, [activeRoomId, scope])

  const handleConvert = useCallback(
    async (key: string, title: string, owner: string, deadline?: string) => {
      setConverted((current) => ({ ...current, [key]: true }))
      const tempId = nextId('task')
      const newTask: TrackerTask = {
        id: tempId,
        title,
        owner,
        done: false,
        fromPulse: true,
        deadline,
      }

      setTracker((current) => [newTask, ...current])

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeRoomId,
            title,
            assignee: owner,
            deadline: deadline || '',
            status: 'pending',
          }),
        })

        const data = await res.json()
        if (res.ok && data?.task) {
          setTracker((current) =>
            current.map((task) =>
              task.id === tempId ? { ...task, id: data.task._id || data.task.id } : task
            )
          )
        }
      } catch (err) {
        console.warn('Failed to persist task document to MongoDB:', err)
      }
    },
    [activeRoomId, nextId],
  )

  const handleToggleTask = useCallback(async (id: string) => {
    setTracker((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
    )

    // Call PATCH /api/tasks/[id] if valid ID
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      try {
        await fetch(`/api/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        console.warn('Failed to toggle task in MongoDB:', err)
      }
    }
  }, [])

  // 1. AUTH STATE RESET:
  // When a user logs in, registers, or logs out, completely purge any active client-side
  // Direct Message thread selection, reset local DM message state to an empty array,
  // and ensure messages sent under one user or guest session never persist or leak into another session's view.
  const handleAuth = useCallback((payload: AuthPayload) => {
    const name = toTitleCase(payload.username || payload.email.split('@')[0])

    // Purge DM selection & default to #first-commit-sprint
    setActiveRoomId(MAIN_ROOM_ID)
    activeRoomRef.current = MAIN_ROOM_ID

    // Reset local message state completely so no previous session messages leak
    setMessages({})
    setUnread({})
    setDmUserIds([])
    setTracker([])
    setSynthesisData(null)
    setPulseActive(false)
    setConverted({})
    setDrawerOpen(false)

    setSession({
      name,
      initials: toInitials(name),
      email: payload.email,
      role: payload.mode === 'create' ? 'Member' : 'Lead Dev',
      token: payload.token,
      isGuest: false,
    })

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_room', MAIN_ROOM_ID)
    }

    setAuthOpen(false)
  }, [])

  const handleSignOut = useCallback(() => {
    // Purge DM selection & default to #first-commit-sprint
    setActiveRoomId(MAIN_ROOM_ID)
    activeRoomRef.current = MAIN_ROOM_ID

    // Reset local message state completely
    setMessages({})
    setUnread({})
    setDmUserIds([])
    setTracker([])
    setSynthesisData(null)
    setPulseActive(false)
    setConverted({})
    setDrawerOpen(false)

    setSession(GUEST_SESSION)

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_room', MAIN_ROOM_ID)
    }
  }, [])

  const handleAddContext = useCallback(
    (text: string) => {
      appendMessage({
        id: nextId('ctx'),
        roomId: activeRoomId,
        authorId: currentUserName,
        text,
        time: formatTime(),
        kind: 'context',
      })
      setContextOpen(false)
    },
    [activeRoomId, appendMessage, currentUserName, nextId],
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
        onOpenAuth={() => setAuthOpen(true)}
        onClose={() => setSidebarOpen(false)}
        onSignOut={handleSignOut}
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
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
          onTyping={handleTypingEvent}
          onStopTyping={handleStopTypingEvent}
        />

        <PulseDrawer
          open={drawerOpen}
          tab={tab}
          scanning={scanning}
          syncedAt={syncedAt}
          scope={scope}
          converted={converted}
          tracker={tracker}
          currentUserName={currentUserName}
          onTabChange={setTab}
          onConvert={handleConvert}
          onToggleTask={handleToggleTask}
          onClose={() => setDrawerOpen(false)}
          synthesisData={synthesisData}
        />
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSubmit={handleAuth} />
      <AddContextModal
        open={contextOpen}
        roomName={room.name}
        onClose={() => setContextOpen(false)}
        onSubmit={handleAddContext}
      />
    </div>
  )
}
