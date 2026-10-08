'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
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
import { NewChatModal } from './new-chat-modal'
import { PulseDrawer } from './pulse-drawer'
import { Sidebar } from './sidebar'

const DEFAULT_SESSION: Session = {
  name: USERS[ME_ID].name,
  initials: USERS[ME_ID].initials,
  email: 'arpit@campus.edu',
  role: 'Lead Dev',
}

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
  const [synthesisData, setSynthesisData] = useState<PulseSynthesisData | null>(null)

  const [authOpen, setAuthOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
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
    if (window.innerWidth < 1280) setDrawerOpen(false)

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

  // Join room and load DB messages + tasks whenever activeRoomId changes
  useEffect(() => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_room', activeRoomId)
    }

    // Fetch messages from MongoDB
    fetch(`/api/messages?conversationId=${encodeURIComponent(activeRoomId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
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
          setMessages((curr) => {
            const currentRoomMsgs = curr[activeRoomId] ?? []
            const merged = [...currentRoomMsgs]
            for (const dm of dbMsgs) {
              if (!merged.some((m) => m.id === dm.id || (m.text === dm.text && m.authorId === dm.authorId))) {
                merged.push(dm)
              }
            }
            return { ...curr, [activeRoomId]: merged }
          })
        }
      })
      .catch(() => {})

    // Fetch tasks from MongoDB
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
          setTracker((curr) => {
            const merged = [...dbTasks]
            for (const ct of curr) {
              if (!merged.some((t) => t.id === ct.id || t.title === ct.title)) {
                merged.push(ct)
              }
            }
            return merged
          })
        }
      })
      .catch(() => {})
  }, [activeRoomId])

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
      const msgId = nextId('msg')
      const time = formatTime()

      const outgoingMessage: Message = {
        id: msgId,
        roomId,
        authorId: ME_ID,
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
          authorId: ME_ID,
          sender: session.name,
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
          sender: session.name,
          content: text,
        }),
      }).catch((err) => console.warn('Failed to persist message to DB:', err))

      // Keep mock peer responses if in demo channels
      const replies = REPLIES[room.responderId]
      if (!replies) return

      schedule(() => setTyping({ roomId, userId: room.responderId }), TYPING_DELAY_MS)
      schedule(() => {
        setTyping(null)
        const replyText = replies[Math.floor(Math.random() * replies.length)]
        const replyId = nextId('reply')
        const replyTime = formatTime()

        const replyMsg: Message = {
          id: replyId,
          roomId,
          authorId: room.responderId,
          text: replyText,
          time: replyTime,
        }

        appendMessage(replyMsg)

        // Persist peer reply to MongoDB
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: roomId,
            sender: room.responderId,
            content: replyText,
          }),
        }).catch(() => {})

        if (activeRoomRef.current !== roomId) {
          setUnread((current) => ({ ...current, [roomId]: (current[roomId] ?? 0) + 1 }))
        }
      }, REPLY_DELAY_MS)
    },
    [activeRoomId, appendMessage, nextId, schedule, session.name],
  )

  const handleTypingEvent = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('typing', {
        roomId: activeRoomId,
        userId: session.name,
        username: session.name,
      })
    }
  }, [activeRoomId, session.name])

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
      token: payload.token,
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
          drawerOpen={drawerOpen}
          onOpenDrawer={() => setDrawerOpen(true)}
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
          currentUserName={session.name}
          onTabChange={setTab}
          onConvert={handleConvert}
          onToggleTask={handleToggleTask}
          onClose={() => setDrawerOpen(false)}
          synthesisData={synthesisData}
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
