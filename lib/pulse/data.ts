import type { Message, Room, TrackerTask, User } from './types'

export const ME_ID = 'me'
export const MAIN_ROOM_ID = 'first-commit-sprint'

export const USERS: Record<string, User> = {
  me: { id: 'me', name: 'Guest User', initials: 'GU', role: 'Guest', online: true },
}

export const INITIAL_DM_USER_IDS: string[] = []

export const CHANNELS: Room[] = [
  {
    id: MAIN_ROOM_ID,
    name: 'first-commit-sprint',
    type: 'channel',
    context: 'Context: First Commit Hackathon | Target: 11:59 PM',
    onlineCount: 1,
    responderId: '',
  },
  {
    id: 'campus-announcements',
    name: 'campus-announcements',
    type: 'channel',
    context: 'Context: Campus Ops | Broadcast channel',
    onlineCount: 1,
    responderId: '',
  },
  {
    id: 'backend-ops',
    name: 'backend-ops',
    type: 'channel',
    context: 'Context: Infra & APIs',
    onlineCount: 1,
    responderId: '',
  },
]

export const SEED_UNREAD: Record<string, number> = {}

export const SEED_MESSAGES: Record<string, Message[]> = {}

export const SEED_TRACKER: TrackerTask[] = []

export const REPLIES: Record<string, string[]> = {}

export function getRoom(roomId: string): Room {
  const channel = CHANNELS.find((c) => c.id === roomId)
  if (channel) return channel

  const userId = roomId.replace(/^dm-/, '')
  const user = USERS[userId]
  return {
    id: roomId,
    name: user?.name ?? 'Direct message',
    type: 'dm',
    userId,
    context: `Direct message | ${user?.online ? 'Online now' : 'Offline'}`,
    onlineCount: user?.online ? 1 : 0,
    responderId: userId,
  }
}

export function formatTime(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
