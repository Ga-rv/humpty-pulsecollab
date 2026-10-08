import type { Message, Room, TrackerTask, User } from './types'

export const ME_ID = 'me'
export const MAIN_ROOM_ID = 'first-commit-sprint'

export const USERS: Record<string, User> = {
  me: { id: 'me', name: 'Arpit Singh', initials: 'AS', role: 'Lead Dev', online: true },
  rahul: { id: 'rahul', name: 'Rahul Sharma', initials: 'RS', role: 'Lead', online: true },
  aman: { id: 'aman', name: 'Aman Verma', initials: 'AV', online: true },
  priya: { id: 'priya', name: 'Priya Patel', initials: 'PP', online: false },
  neha: { id: 'neha', name: 'Neha Gupta', initials: 'NG', role: 'Campus Ops', online: true },
  karan: { id: 'karan', name: 'Karan Mehta', initials: 'KM', online: true },
  ishita: { id: 'ishita', name: 'Ishita Rao', initials: 'IR', online: false },
  dev: { id: 'dev', name: 'Dev Malhotra', initials: 'DM', online: true },
  sana: { id: 'sana', name: 'Sana Khan', initials: 'SK', online: false },
}

export const INITIAL_DM_USER_IDS = ['rahul', 'aman', 'priya']

export const CHANNELS: Room[] = [
  {
    id: MAIN_ROOM_ID,
    name: 'first-commit-sprint',
    type: 'channel',
    context: 'Context: First Commit Hackathon | Target: 11:59 PM',
    onlineCount: 3,
    responderId: 'aman',
  },
  {
    id: 'campus-announcements',
    name: 'campus-announcements',
    type: 'channel',
    context: 'Context: Campus Ops | Broadcast channel',
    onlineCount: 12,
    responderId: 'neha',
  },
  {
    id: 'backend-ops',
    name: 'backend-ops',
    type: 'channel',
    context: 'Context: Infra & APIs | On-call: Rahul',
    onlineCount: 2,
    responderId: 'rahul',
  },
]

export const SEED_UNREAD: Record<string, number> = {
  'campus-announcements': 3,
  'backend-ops': 4,
  'dm-priya': 1,
}

const m = (
  roomId: string,
  id: string,
  authorId: string,
  time: string,
  text: string,
  pulseKind?: Message['pulseKind'],
): Message => ({ id, roomId, authorId, time, text, pulseKind })

export const SEED_MESSAGES: Record<string, Message[]> = {
  [MAIN_ROOM_ID]: [
    m(
      MAIN_ROOM_ID,
      'seed-1',
      'aman',
      '19:10',
      'Heads up team: The First Commit Hackathon registration deadline is tonight at 11:59 PM sharp! Link: https://firstcommit.iitmandi.co',
      'deadline',
    ),
    m(
      MAIN_ROOM_ID,
      'seed-2',
      'rahul',
      '19:12',
      'Got it. I will complete the MongoDB Atlas schemas and Express auth endpoints by 9:00 PM tonight.',
      'action',
    ),
    m(
      MAIN_ROOM_ID,
      'seed-3',
      'aman',
      '19:14',
      'Awesome, I will handle the v0 client wiring and Socket.IO listener hooks right after.',
      'action',
    ),
    m(
      MAIN_ROOM_ID,
      'seed-4',
      ME_ID,
      '19:15',
      'Confirmed. Who is preparing the Loom demo video and slide deck for submission?',
      'unresolved',
    ),
  ],
  'campus-announcements': [
    m('campus-announcements', 'ca-1', 'neha', '09:00', 'Reminder: library hours are extended to 2 AM through hackathon week.'),
    m('campus-announcements', 'ca-2', 'karan', '11:30', 'Check-in desk opens at 6 PM at the Student Activity Center. Bring your college ID.'),
    m('campus-announcements', 'ca-3', 'neha', '14:05', 'Free dinner for registered teams at 8 PM. Show your team ID at the counter.'),
  ],
  'backend-ops': [
    m('backend-ops', 'bo-1', 'rahul', '16:20', 'Atlas cluster is provisioned. Connection string has been rotated, check the shared vault.'),
    m('backend-ops', 'bo-2', 'aman', '16:41', 'Socket.IO namespace /pulse is live on staging. Heartbeat set to 25s.'),
    m('backend-ops', 'bo-3', 'rahul', '17:02', 'Rate limiter is at 60 req/min per socket. Tell me if the demo needs more.'),
    m('backend-ops', 'bo-4', 'aman', '17:18', 'CORS allow-list updated for the preview domain.'),
  ],
  'dm-rahul': [
    m('dm-rahul', 'dr-1', 'rahul', '18:40', 'Pushed the user schema branch. Can you review before I wire auth?'),
    m('dm-rahul', 'dr-2', ME_ID, '18:44', 'On it, give me ten minutes.'),
  ],
  'dm-aman': [],
  'dm-priya': [
    m('dm-priya', 'dp-1', 'priya', '17:55', 'Slide template is ready in the shared drive. Ping me when you need edits.'),
  ],
}

export const SEED_TRACKER: TrackerTask[] = [
  { id: 'seed-t1', title: 'Initial repository and project context initialized', owner: 'Team', done: true },
  { id: 'seed-t2', title: 'Complete MongoDB Atlas schemas & Express Auth', owner: 'Rahul', done: false },
  { id: 'seed-t3', title: 'Wire v0 client to Socket.IO', owner: 'Aman', done: false },
  { id: 'seed-t4', title: 'Submit First Commit Registration before 11:59 PM', owner: 'Team', done: false },
]

export const REPLIES: Record<string, string[]> = {
  aman: [
    'On it. I can take the Loom walkthrough once the Socket.IO hooks are merged.',
    'Pushing the listener hooks now, will ping when the branch is up.',
    'Sounds good. Keep the registration link pinned so nobody misses it.',
  ],
  rahul: [
    'Schemas are almost done, Express auth routes next.',
    'Noted. I will drop the endpoint list in #backend-ops.',
    'Give me a few minutes, finishing the JWT middleware.',
  ],
  neha: [
    'Thanks for the heads up, I will pass it to the organizing team.',
    'Noted. The desk team has been informed.',
  ],
  karan: ['Got it, will relay this.', 'Thanks, checking with the volunteers.'],
  dev: ['Sure, happy to help with that.', 'Sounds good, send me the details.'],
}

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
