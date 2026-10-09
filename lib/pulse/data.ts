import type { Message, Room, TrackerTask, User } from './types'

export const ME_ID = 'me'
export const MAIN_ROOM_ID = 'first-commit-sprint'

export const USERS: Record<string, User> = {
  me: { id: 'me', name: 'Guest User', initials: 'GU', role: 'Guest', online: true },
}

export const INITIAL_DM_USER_IDS: string[] = []

// NOTE: keep each `id` stable. It is the key that saved messages, synthesis and tasks are stored
// under in MongoDB. Only `name` / `context` are what people see, so those are safe to change.
export const CHANNELS: Room[] = [
  {
    id: MAIN_ROOM_ID,
    name: 'kamand-commons',
    type: 'channel',
    context: 'IIT Mandi community | Hang out, ask anything',
    onlineCount: 1,
    responderId: '',
  },
  {
    id: 'campus-announcements',
    name: 'campus-notices',
    type: 'channel',
    context: 'IIT Mandi | Events, deadlines & announcements',
    onlineCount: 1,
    responderId: '',
  },
  {
    id: 'backend-ops',
    name: 'mandi-builders',
    type: 'channel',
    context: 'IIT Mandi | Projects, hackathons & tech talk',
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
