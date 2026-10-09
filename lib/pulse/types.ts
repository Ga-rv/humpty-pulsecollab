export type PulseKind = 'deadline' | 'action' | 'unresolved'

export interface User {
  id: string
  name: string
  initials: string
  role?: string
  online: boolean
}

export interface Session {
  id?: string
  userId?: string
  name: string
  initials: string
  email: string
  role: string
  token?: string
  isGuest?: boolean
}

export interface Room {
  id: string
  name: string
  type: 'channel' | 'dm'
  userId?: string
  context: string
  onlineCount: number
  responderId: string
}

export interface Message {
  id: string
  roomId: string
  authorId: string
  text: string
  time: string
  pulseKind?: PulseKind
  kind?: 'context'
}

export interface TrackerTask {
  id: string
  title: string
  owner: string
  done: boolean
  fromPulse?: boolean
  deadline?: string
}

export interface ActionItem {
  task: string
  assignee: string
  deadline: string
}

export interface DeadlineItem {
  title: string
  due?: string
  date?: string
  priority?: 'High' | 'Medium' | 'Low'
  source?: string
  urgency?: 'URGENT' | 'SOON'
  calendarUrl?: string
  /** Absolute due instant (ISO). Used for the live T-minus countdown. */
  dueAt?: string
}

export interface PulseSynthesisData {
  decisions?: string[]
  actionItems: ActionItem[]
  deadlines: DeadlineItem[]
  unresolved?: string[]
  summary?: string
}

export type PulseTab = 'deadlines' | 'actions' | 'tracker'

export type ScanScope = 'last-50' | 'today'

export const SCOPE_LABEL: Record<ScanScope, string> = {
  'last-50': 'Scan Last 50',
  today: "Scan Today's Thread",
}
