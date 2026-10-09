'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { getPusherClient } from '@/lib/pusher-client'
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
import { NewChatModal } from './new-chat-modal'
import { PulseDrawer } from './pulse-drawer'
import { Sidebar, type ChatUser } from './sidebar'

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
  const [conversationUsers, setConversationUsers] = useState<ChatUser[]>([])
  const [allUsers, setAllUsers] = useState<ChatUser[]>([])
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
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)

  const activeRoomRef = useRef(activeRoomId)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const idCounter = useRef(0)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    activeRoomRef.current = activeRoomId
  }, [activeRoomId])

  // Fetch users with existing active conversations (for sidebar)
  const fetchConversationUsers = useCallback(() => {
    if (!session?.token || session?.isGuest || session?.role === 'Guest') {
      setConversationUsers([])
      return
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.token}`,
    }
    fetch('/api/users', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.users && Array.isArray(data.users)) {
          setConversationUsers(data.users)
        }
      })
      .catch((err) => console.warn('Failed to fetch conversation users:', err))
  }, [session?.token, session?.isGuest, session?.role])

  // Fetch all registered users in database (for New Chat modal)
  const fetchAllUsers = useCallback(() => {
    if (!session?.token || session?.isGuest || session?.role === 'Guest') {
      setAllUsers([])
      return
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.token}`,
    }
    fetch('/api/users?all=true', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.users && Array.isArray(data.users)) {
          setAllUsers(data.users)
        }
      })
      .catch((err) => console.warn('Failed to fetch all users:', err))
  }, [session?.token, session?.isGuest, session?.role])

  useEffect(() => {
    fetchConversationUsers()
    fetchAllUsers()
  }, [fetchConversationUsers, fetchAllUsers])

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

  // Real-time Pusher WebSockets listener with resilient fallback
  useEffect(() => {
    const pusher = getPusherClient()
    if (!pusher) {
      // Gracefully degraded to existing polling sync
      return
    }

    const channelName = `chat-${activeRoomId}`.replace(/[^A-Za-z0-9_\-=@,.;]/g, '_')
    let channel = pusher.channel(channelName)
    if (!channel) {
      channel = pusher.subscribe(channelName)
    }

    const handleNewMessage = (data: Record<string, unknown>) => {
      const roomId = (data.roomId || data.conversationId || activeRoomRef.current) as string

      const incoming: Message = {
        id: (data.id || data._id || `push-${Date.now()}`) as string,
        roomId,
        authorId: (data.authorId || data.sender || data.senderId || 'peer') as string,
        text: (data.text || data.content || '') as string,
        time: (data.time || (data.createdAt ? formatTime(new Date(data.createdAt as string)) : formatTime())) as string,
        pulseKind: data.pulseKind as Message['pulseKind'],
      }

      setMessages((current) => {
        const roomMsgs = current[roomId] ?? []
        // Deduplicate against existing ID
        if (roomMsgs.some((m) => m.id === incoming.id)) {
          return current
        }

        // Replace optimistic placeholder message if matching text & author
        const optIndex = roomMsgs.findIndex(
          (m) => m.text === incoming.text && m.authorId === incoming.authorId && m.id.startsWith('msg-')
        )
        if (optIndex !== -1) {
          const updated = [...roomMsgs]
          updated[optIndex] = incoming
          return {
            ...current,
            [roomId]: updated,
          }
        }

        // Deduplicate against same text & author already received
        if (roomMsgs.some((m) => m.text === incoming.text && m.authorId === incoming.authorId)) {
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
    }

    channel.bind('new-message', handleNewMessage)

    return () => {
      channel.unbind('new-message', handleNewMessage)
    }
  }, [activeRoomId])

  // User personal DM real-time notifications via Pusher WebSockets
  useEffect(() => {
    if (!session?.userId || session?.isGuest || session?.role === 'Guest') return
    const pusher = getPusherClient()
    if (!pusher) return

    const personalChannelName = `chat-dm-${session.userId}`.replace(/[^A-Za-z0-9_\-=@,.;]/g, '_')
    let channel = pusher.channel(personalChannelName)
    if (!channel) {
      channel = pusher.subscribe(personalChannelName)
    }

    const handlePersonalDm = (data: Record<string, unknown>) => {
      const senderId = (data.senderId || data.authorId) as string
      if (!senderId || senderId === session.userId) return

      // Ensure new DM conversation appears in the sidebar
      fetchConversationUsers()

      const roomKey = `dm-${senderId}`
      const incoming: Message = {
        id: (data.id || data._id || `push-${Date.now()}`) as string,
        roomId: roomKey,
        authorId: senderId,
        text: (data.text || data.content || '') as string,
        time: (data.time || (data.createdAt ? formatTime(new Date(data.createdAt as string)) : formatTime())) as string,
        pulseKind: data.pulseKind as Message['pulseKind'],
      }

      setMessages((current) => {
        const roomMsgs = current[roomKey] ?? []
        if (roomMsgs.some((m) => m.id === incoming.id)) return current
        return {
          ...current,
          [roomKey]: [...roomMsgs, incoming],
        }
      })

      if (activeRoomRef.current !== roomKey) {
        setUnread((current) => ({ ...current, [roomKey]: (current[roomKey] ?? 0) + 1 }))
      }
    }

    channel.bind('new-message', handlePersonalDm)

    return () => {
      channel.unbind('new-message', handlePersonalDm)
    }
  }, [session?.userId, session?.isGuest, session?.role])

  // 1-on-1 DIRECT MESSAGE POLLING SYNC (every 2000ms when inside an active DM thread)
  useEffect(() => {
    if (!activeRoomId.startsWith('dm-')) return
    if (!session?.token || session?.isGuest || session?.role === 'Guest') return

    const targetUserId = activeRoomId.replace(/^dm-/, '')

    const pollDirectMessages = async () => {
      try {
        const res = await fetch(`/api/messages/direct?recipientId=${encodeURIComponent(targetUserId)}`, {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        })
        if (!res.ok) return
        const data = await res.json()
        if (data?.messages && Array.isArray(data.messages)) {
          interface DmItem {
            _id?: string
            id?: string
            senderId: string
            recipientId: string
            text: string
            createdAt: string
          }
          const incomingMsgs: Message[] = data.messages.map((m: DmItem) => ({
            id: m._id || m.id || `dm-${Date.now()}`,
            roomId: activeRoomId,
            authorId: m.senderId,
            text: m.text,
            time: formatTime(new Date(m.createdAt)),
          }))

          setMessages((curr) => {
            const currentList = curr[activeRoomId] || []
            // Compare lengths and IDs to prevent re-render flicker and preserve scroll position
            if (
              currentList.length === incomingMsgs.length &&
              currentList.every((msg, idx) => msg.id === incomingMsgs[idx]?.id)
            ) {
              return curr
            }
            return {
              ...curr,
              [activeRoomId]: incomingMsgs,
            }
          })
        }
      } catch (err) {
        console.warn('Direct message poll error:', err)
      }
    }

    // Initial fetch
    pollDirectMessages()

    // 2000ms polling interval
    const intervalId = setInterval(pollDirectMessages, 2000)
    return () => clearInterval(intervalId)
  }, [activeRoomId, session?.token, session?.isGuest, session?.role])

  // Channel messages & tasks fetcher
  useEffect(() => {
    if (activeRoomId.startsWith('dm-')) return

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_room', activeRoomId)
    }

    if (!session?.token || session?.isGuest || session?.role === 'Guest') {
      return
    }

    // Fetch messages from MongoDB for active channel with resilient polling backup
    const fetchChannelMessages = () => {
      fetch(`/api/messages?conversationId=${encodeURIComponent(activeRoomId)}`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const rawList = Array.isArray(data) ? data : data?.messages
          if (rawList && Array.isArray(rawList)) {
            interface DbMsg {
              _id?: string
              id?: string
              conversationId: string
              sender: string
              content: string
              createdAt: string
            }
            const dbMsgs: Message[] = rawList.map((m: DbMsg) => ({
              id: m._id || m.id || `db-${Date.now()}`,
              roomId: m.conversationId,
              authorId: m.sender,
              text: m.content,
              time: formatTime(new Date(m.createdAt)),
            }))
            setMessages((curr) => {
              const currentList = curr[activeRoomId] || []
              if (
                currentList.length === dbMsgs.length &&
                currentList.every((msg, idx) => msg.id === dbMsgs[idx]?.id)
              ) {
                return curr
              }
              return {
                ...curr,
                [activeRoomId]: dbMsgs,
              }
            })
          }
        })
        .catch(() => {})
    }

    fetchChannelMessages()
    const channelPollInterval = setInterval(fetchChannelMessages, 3000)

    // Fetch tasks from MongoDB for active channel
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

    return () => {
      clearInterval(channelPollInterval)
    }
  }, [activeRoomId, session?.token, session?.isGuest, session?.role])

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

  const currentUserName = session?.name || 'Guest User'

  const handleSend = useCallback(
    (text: string) => {
      if (!session?.token || session?.isGuest || session?.role === 'Guest') {
        setAuthOpen(true)
        return
      }

      const msgId = nextId('msg')
      const time = formatTime()

      // Handle 1-on-1 Direct Message persistence and sync
      if (activeRoomId.startsWith('dm-')) {
        if (!session?.token) {
          setAuthOpen(true)
          return
        }

        const targetUserId = activeRoomId.replace(/^dm-/, '')
        const outgoingMessage: Message = {
          id: msgId,
          roomId: activeRoomId,
          authorId: session.userId || currentUserName,
          text,
          time,
        }

        appendMessage(outgoingMessage)

        // Post to /api/messages/direct
        fetch('/api/messages/direct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({
            recipientId: targetUserId,
            text,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.message?._id) {
              setMessages((curr) => ({
                ...curr,
                [activeRoomId]: (curr[activeRoomId] || []).map((m) =>
                  m.id === msgId ? { ...m, id: data.message._id } : m
                ),
              }))
            }
          })
          .catch((err) => console.warn('Failed to persist direct message:', err))

        // Emit to Socket.IO for instant peer delivery
        if (socketRef.current) {
          socketRef.current.emit('send_message', {
            id: msgId,
            roomId: activeRoomId,
            conversationId: activeRoomId,
            authorId: session.userId || currentUserName,
            sender: currentUserName,
            content: text,
            text,
            time,
          })
        }
        return
      }

      // Handle Sprint Channel message persistence and sync
      const room = getRoom(activeRoomId)
      const roomId = room.id

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          conversationId: roomId,
          sender: currentUserName,
          content: text,
        }),
      }).catch((err) => console.warn('Failed to persist message to DB:', err))
    },
    [activeRoomId, appendMessage, currentUserName, nextId, session?.token, session?.userId, session?.isGuest, session?.role],
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.token) {
        headers['Authorization'] = `Bearer ${session.token}`
      }

      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers,
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
  }, [activeRoomId, scope, session?.token])

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

  // 1. AUTH STATE RESET & CLEAN SESSION HANDLING
  const handleAuth = useCallback((payload: AuthPayload) => {
    const name = toTitleCase(payload.username || payload.email.split('@')[0])

    // Purge DM selection & default to #first-commit-sprint
    setActiveRoomId(MAIN_ROOM_ID)
    activeRoomRef.current = MAIN_ROOM_ID

    // Reset local message state completely so no previous session messages leak
    setMessages({})
    setUnread({})
    setTracker([])
    setSynthesisData(null)
    setPulseActive(false)
    setConverted({})
    setDrawerOpen(false)

    setSession({
      id: payload.userId,
      userId: payload.userId,
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
    setTracker([])
    setSynthesisData(null)
    setPulseActive(false)
    setConverted({})
    setDrawerOpen(false)

    setSession(GUEST_SESSION)
    setConversationUsers([])
    setAllUsers([])

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join_room', MAIN_ROOM_ID)
    }
  }, [])

  const handlePickPeer = useCallback(
    (userId: string) => {
      setNewChatOpen(false)

      // 1. Locate selected user from allUsers or conversationUsers
      const chosenUser =
        allUsers.find((u) => u.id === userId || u._id === userId) ||
        conversationUsers.find((u) => u.id === userId || u._id === userId)

      // 2. Dynamically add to sidebar conversation list immediately
      if (chosenUser) {
        setConversationUsers((prev) => {
          if (prev.some((u) => u.id === userId || u._id === userId)) return prev
          return [...prev, chosenUser]
        })
      }

      // 3. Persist conversation in MongoDB permanently
      if (session?.token) {
        fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ targetUserId: userId }),
        }).catch((err) => console.warn('Failed to persist conversation:', err))
      }

      // 4. Open the DM thread
      selectRoom(`dm-${userId}`)
    },
    [allUsers, conversationUsers, selectRoom, session?.token],
  )

  const handleAddContext = useCallback(
    (text: string) => {
      if (activeRoomId.startsWith('dm-')) {
        setContextOpen(false)
        return
      }
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

  // Determine active room metadata (channel vs dynamic 1-on-1 DM)
  let room: ReturnType<typeof getRoom>
  if (activeRoomId.startsWith('dm-')) {
    const targetUserId = activeRoomId.replace(/^dm-/, '')
    const matchedUser =
      conversationUsers.find((u) => u.id === targetUserId || u._id === targetUserId) ||
      allUsers.find((u) => u.id === targetUserId || u._id === targetUserId)
    const partnerName = matchedUser?.name || matchedUser?.username || 'Teammate'
    room = {
      id: activeRoomId,
      name: partnerName,
      type: 'dm',
      userId: targetUserId,
      context: `Direct message with ${partnerName}`,
      onlineCount: 1,
      responderId: targetUserId,
    }
  } else {
    room = getRoom(activeRoomId)
  }

  const typingUserId = typing && typing.roomId === activeRoomId ? typing.userId : null
  const isGuest = !session || Boolean(session.isGuest) || session.role === 'Guest' || !session.token

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar
        open={sidebarOpen}
        activeRoomId={activeRoomId}
        unread={unread}
        registeredUsers={conversationUsers}
        session={session}
        onSelectRoom={selectRoom}
        onNewChat={() => {
          if (!session?.token) {
            setAuthOpen(true)
          } else {
            fetchAllUsers()
            setNewChatOpen(true)
          }
        }}
        onOpenAuth={() => setAuthOpen(true)}
        onClose={() => setSidebarOpen(false)}
        onSignOut={handleSignOut}
      />

      <main className="relative flex min-w-0 flex-1">
        <ChatStream
          room={room}
          messages={isGuest ? [] : (messages[activeRoomId] ?? [])}
          session={session}
          pulseActive={pulseActive}
          scanning={scanning}
          scanKey={scanKey}
          typingUserId={typingUserId}
          scope={scope}
          onScopeChange={setScope}
          onSend={handleSend}
          onSynthesize={handleSynthesize}
          onAddContext={() => {
            if (!activeRoomId.startsWith('dm-')) {
              setContextOpen(true)
            }
          }}
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
      <NewChatModal
        open={newChatOpen}
        users={allUsers}
        existingUserIds={conversationUsers.map((u) => u.id)}
        onClose={() => setNewChatOpen(false)}
        onPick={handlePickPeer}
      />
      <AddContextModal
        open={contextOpen && !activeRoomId.startsWith('dm-')}
        roomName={room.name}
        onClose={() => setContextOpen(false)}
        onSubmit={handleAddContext}
      />
    </div>
  )
}
