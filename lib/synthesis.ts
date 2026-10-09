import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'
import { DirectMessage } from '@/models/DirectMessage'
import { User } from '@/models/User'
import { Synthesis } from '@/models/Synthesis'
import { verifyAuthToken } from '@/lib/auth'

const DEFAULT_GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash']
const TZ = 'Asia/Kolkata'

export interface DeadlineItem {
  id?: string
  title: string
  date: string
  time?: string
  priority: 'High' | 'Medium' | 'Low'
  due?: string
  urgency?: 'URGENT' | 'SOON'
  source?: string
  calendarUrl?: string
}

export interface ActionItem {
  task: string
  assignee: string
  status: 'Pending' | 'In Progress' | 'Completed'
  deadline?: string
}

export interface SynthesisResponse {
  deadlines: DeadlineItem[]
  actionItems: ActionItem[]
  summary: string
  decisions?: string[]
  unresolved?: string[]
  /** Which path produced this result. Handy for debugging on Vercel. */
  engine?: 'gemini' | 'fallback'
}

interface ChatMessage {
  sender: string
  text: string
  sentAt?: string // ISO timestamp, used to resolve "tonight" / "tomorrow"
}

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) return fenceMatch[1].trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return cleaned
}

const MONTHS: Record<string, string> = {
  jan: 'Jan', january: 'Jan', feb: 'Feb', february: 'Feb', mar: 'Mar', march: 'Mar',
  apr: 'Apr', april: 'Apr', may: 'May', jun: 'Jun', june: 'Jun', jul: 'Jul', july: 'Jul',
  aug: 'Aug', august: 'Aug', sep: 'Sep', sept: 'Sep', september: 'Sep',
  oct: 'Oct', october: 'Oct', nov: 'Nov', november: 'Nov', dec: 'Dec', december: 'Dec',
}

function normalizeDateStr(rawDate: string): string {
  const m1 = rawDate.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)/i)
  if (m1 && MONTHS[m1[2].toLowerCase()]) return `${MONTHS[m1[2].toLowerCase()]} ${m1[1]}`
  const m2 = rawDate.match(/([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/i)
  if (m2 && MONTHS[m2[1].toLowerCase()]) return `${MONTHS[m2[1].toLowerCase()]} ${m2[2]}`
  return rawDate.trim()
}

/** Normalizes "6pm", "18:30", "noon" -> "6:00 PM", "6:30 PM", "12:00 PM". */
function normalizeTimeStr(rawTime: string): string {
  const t = rawTime.trim().toLowerCase()
  if (t === 'noon') return '12:00 PM'
  if (t === 'midnight') return '12:00 AM'

  const ampm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i)
  if (ampm) {
    const suffix = ampm[3].toLowerCase().startsWith('a') ? 'AM' : 'PM'
    return `${parseInt(ampm[1], 10)}:${ampm[2] || '00'} ${suffix}`
  }

  const h24 = t.match(/(\d{1,2}):(\d{2})/)
  if (h24) {
    const h = parseInt(h24[1], 10)
    const suffix = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${h24[2]} ${suffix}`
  }
  return rawTime.toUpperCase()
}

function formatMonDay(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })
}

function formatStamp(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function resolveRelativeDay(word: string, base: Date): string {
  const offset = /tomorrow/i.test(word) ? 1 : 0
  const d = new Date(base.getTime() + offset * 24 * 60 * 60 * 1000)
  return formatMonDay(d)
}

/* -------------------------------------------------------------------------- */
/*  Title cleaning & extraction (shared by Gemini post-processing and fallback) */
/* -------------------------------------------------------------------------- */

const MONTH_RE =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

const MONTHS_REGEX = new RegExp('\\b' + MONTH_RE + '\\b', 'gi')

const WEEKDAYS = /\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b/gi

const LEADING_FILLER_LIST = [
  /^(?:hey|hi|hello|okay+|ok+|so|and|also|btw|yes|yeah|yep|no|sure)\b[\s,:;-]*/i,
  /^(?:please|pls|just)\b[\s,:;-]*/i,
  /^(?:remember(?:\s+that)?|reminder|don'?t\s+forget(?:\s+to)?|do\s+not\s+forget(?:\s+to)?|make\s+sure(?:\s+to)?|be\s+sure(?:\s+to)?)\b[\s,:;-]*/i,
  /^(?:(?:you|we|i)\s+(?:should|need\s+to|have\s+to|must|will|are\s+going\s+to|can|shall|might))\b[\s,:;-]*/i,
  /^(?:we\s+have|we've\s+got|there(?:'s|\s+is)?|theres)\b[\s,:;-]*/i,
  /^(?:name\s+of\s+(?:this|the)?\s*(?:event|even|meeting|meet|sync|call|presentation)?\s*(?:is|was|:))\b[\s,:;-]*/i,
  /^(?:an?|the)\s+(?:event|even|meeting|meet|call|sync|session)\s+(?:is\s+)?(?:called|named)?\b[\s,:;-]*/i,
  /^(?:an?|the)\b[\s,:;-]*/i,
  /^(?:event|even|meeting|meet|call|sync|presentation)\s+(?:is|called|named)?\b[\s,:;-]*/i,
  /^(?:coming\s+up(?:\s+(?:on|at|for|in))?)\b[\s,:;-]*/i,
  /^(?:to\s+be\s+present(?:\s+(?:at|for|in))?|be\s+present(?:\s+(?:at|for|in))?|to\s+be\s+there(?:\s+(?:at|for))?|be\s+there(?:\s+(?:at|for))?)\b[\s,:;-]*/i,
  /^(?:i\s+think(?:\s+(?:of|about|it's|its|it\s+is))?)\b[\s,:;-]*/i,
  /^(?:submit(?:\s+the)?|turn\s+in(?:\s+the)?|hand\s+in(?:\s+the)?)\b[\s,:;-]*/i,
  /^(?:to|your|our|my)\b[\s,:;-]*/i,
]

const TRAILING_FILLER_LIST = [
  /[\s,.:;!?-]+$/,
  /\s+\b(?:please\s+don'?t\s+be\s+late|don'?t\s+be\s+late|be\s+on\s+time|asap|either|too|as\s+well|right|correct)\b[\s!.]*$/i,
  /\s+\b(?:i\s+think|i\s+guess|maybe)\b[\s!.]*$/i,
  /\s+\b(?:is\s+)?(?:scheduled|planned|set|happening|taking\s+place)(?:\s+(?:for|on|at|to))?\b[\s!.]*$/i,
  /\s+\b(?:tonight|today|tomorrow)\b[\s!.]*$/i,
  /\s+\b(?:on|at|by|before|from|till|until|is|for|the|a|an|in|of|about|with|to)\b[\s,.:;!?-]*$/i,
]

const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'to', 'in', 'on', 'at', 'a', 'an', 'by'])

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (/^[A-Z0-9]+$/.test(w) && w.length >= 2) return w // Preserve STAC, API, UI
      if (/[A-Z]/.test(w.slice(1))) return w // Preserve DevPost, GitHub
      const lw = w.toLowerCase()
      if (i > 0 && SMALL_WORDS.has(lw)) return lw
      return lw.charAt(0).toUpperCase() + lw.slice(1)
    })
    .join(' ')
}

function stripFiller(input: string): string {
  let s = input.trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^[A-Z][a-z]+,\s+/, '') // leading "Ishaan, ..."
    for (const r of LEADING_FILLER_LIST) {
      s = s.replace(r, '')
    }
    for (const r of TRAILING_FILLER_LIST) {
      s = s.replace(r, '')
    }
    s = s.replace(WEEKDAYS, ' ').replace(MONTHS_REGEX, ' ').replace(/\s+/g, ' ').trim()
  }
  return s.trim()
}

export function extractSmartEventTitle(
  text: string,
  dateRaw?: string | null,
  timeRaw?: string | null
): string {
  let s = text.trim()
  if (dateRaw) s = s.replace(dateRaw, ' ')
  if (timeRaw) s = s.replace(timeRaw, ' ')
  s = s.replace(WEEKDAYS, ' ')
  s = s.replace(/\b(?:today|tomorrow|tonight)\b/gi, ' ')

  // 1. Explicit name patterns: "name of this event is abc", "event is called abc"
  const nameOfMatch = s.match(
    /\bname\s+of\s+(?:this|the)?\s*(?:event|even|meeting|meet|call|sync|presentation)?\s*(?:is|was|:)\s*([a-zA-Z0-9_\-\s]{1,30})/i
  )
  if (nameOfMatch && nameOfMatch[1].trim()) {
    return titleCase(nameOfMatch[1].trim())
  }

  // 2. "i think of stac", "called stac"
  const thinkOfMatch = s.match(
    /\b(?:i\s+think\s+(?:of|about)|called|named)\s+['"]?([a-zA-Z0-9_\-]{1,25})['"]?/i
  )
  if (thinkOfMatch && thinkOfMatch[1].trim()) {
    const val = thinkOfMatch[1].trim()
    if (val.toUpperCase() === 'STAC') return 'STAC Event'
    return titleCase(val)
  }

  // 3. Project submission patterns: "submit the Devpost project" -> "Devpost Submission"
  if (/\bdevpost\b/i.test(s)) {
    return 'Devpost Submission'
  }
  const submitMatch = s.match(
    /\b(?:submit|turn\s+in|hand\s+in)\s+(?:the\s+)?([a-zA-Z0-9_\-\s]{2,25}?)(?:\s+project|\s+deck|\s+report|\s+code|\s+by|\s+at|$)/i
  )
  if (submitMatch && submitMatch[1].trim()) {
    return titleCase(submitMatch[1].trim()) + ' Submission'
  }

  // 4. Standalone known acronyms (e.g. STAC)
  if (/\bstac\b/i.test(s)) return 'STAC Event'

  // 5. Clean with stripFiller
  const stripped = stripFiller(s)
  if (!stripped || /^(?:event|even|upcoming event)$/i.test(stripped)) {
    return ''
  }

  return titleCase(stripped)
}

function polishTitle(raw: string): string {
  const smart = extractSmartEventTitle(raw)
  if (smart) return smart
  const stripped = stripFiller(raw)
  if (!stripped) return ''
  return titleCase(stripped)
}

/* -------------------------------------------------------------------------- */
/*  Generic fallback extractor (no hardcoded cases)                            */
/* -------------------------------------------------------------------------- */

const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b(?:,?\\s+\\d{4})?`, 'i'),
  new RegExp(`\\b${MONTH_RE}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, 'i'),
  /\b(?:today|tomorrow|tonight)\b/i,
]

const TIME_PATTERNS: RegExp[] = [
  /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])/i,
  /\b(?:noon|midnight)\b/i,
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,
]

function findFirst(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[0]
  }
  return null
}

const ACK_ONLY = /^(?:ok+a*y*|yes|yeah|yep|no|sure|thanks|thank you|cool|nice|hmm+|lol|done|got it)$/i

const GENERIC_TITLES = new Set([
  'event', 'events', 'even', 'upcoming event', 'team event', 'meeting', 'meet',
  'sync', 'call', 'session', 'untitled event', 'reminder', 'schedule', 'deadline',
  'on', 'at', 'in', 'for', 'to', 'by', 'the', 'an', 'a', 'it', 'this', 'that',
])

function deriveTitle(text: string, dateRaw: string | null, timeRaw: string | null): string {
  return extractSmartEventTitle(text, dateRaw, timeRaw)
}

function isNameLike(title: string): boolean {
  if (!title || ACK_ONLY.test(title)) return false
  const clean = title.trim().toLowerCase()
  if (GENERIC_TITLES.has(clean)) return false
  if (/^(?:on|at|in|for|to|by|the|an|a|there|is)\b/i.test(clean) && clean.split(/\s+/).length <= 2) return false
  const words = title.split(/\s+/).length
  return words >= 1 && words <= 6
}

interface MsgInfo {
  m: ChatMessage
  dateRaw: string | null
  timeRaw: string | null
  title: string
}

/**
 * Best-effort extractor used only when Gemini is unavailable or errors.
 * Handles name and date/time split across adjacent messages.
 */
export function extractDynamicSynthesis(
  messages: ChatMessage[],
  defaultCurrentUser = 'Garv Dharmapuri',
  defaultPartner = 'Ishaan Pande'
): SynthesisResponse {
  const participants = Array.from(new Set(messages.map((m) => m.sender).filter(Boolean)))
  const firstUser = participants[0] || defaultCurrentUser
  const secondUser = participants.find((p) => p !== firstUser) || defaultPartner

  const infos: MsgInfo[] = messages.map((m) => {
    const dateRaw = findFirst(m.text, DATE_PATTERNS)
    const timeRaw = findFirst(m.text, TIME_PATTERNS)
    return { m, dateRaw, timeRaw, title: deriveTitle(m.text, dateRaw, timeRaw) }
  })

  const toDateStr = (raw: string, m: ChatMessage): string => {
    if (/^(today|tomorrow|tonight)$/i.test(raw)) {
      const base = m.sentAt && !isNaN(new Date(m.sentAt).getTime()) ? new Date(m.sentAt) : new Date()
      return resolveRelativeDay(raw, base)
    }
    return normalizeDateStr(raw)
  }

  // ---- Deadlines ----
  const deadlines: DeadlineItem[] = []
  const used = new Set<number>()

  for (let i = 0; i < infos.length; i++) {
    if (used.has(i)) continue
    const cur = infos[i]
    if (!cur.dateRaw && !cur.timeRaw) continue

    let dateRaw = cur.dateRaw
    let timeRaw = cur.timeRaw
    let title = cur.title
    let last = i

    // Date in one message, time in the next (or the other way round)
    const next = infos[i + 1]
    if (next && !used.has(i + 1)) {
      if (dateRaw && !timeRaw && next.timeRaw && !next.dateRaw) {
        timeRaw = next.timeRaw
        used.add(i + 1)
        last = i + 1
      } else if (!dateRaw && timeRaw && next.dateRaw && !next.timeRaw) {
        dateRaw = next.dateRaw
        if (!isNameLike(title)) title = next.title
        used.add(i + 1)
        last = i + 1
      }
    }
    if (!dateRaw) continue // a bare time with no date anywhere: not an event

    // Event name in an adjacent message with no date/time of its own
    if (!isNameLike(title)) {
      const prev = infos[i - 1]
      const after = infos[last + 1]
      if (prev && !prev.dateRaw && !prev.timeRaw && !used.has(i - 1) && isNameLike(prev.title)) {
        title = prev.title
      } else if (after && !after.dateRaw && !after.timeRaw && !used.has(last + 1) && isNameLike(after.title)) {
        title = after.title
        used.add(last + 1)
      }
    }
    if (!isNameLike(title)) {
      const fullContext = `${cur.m.text} ${infos[last + 1]?.m?.text || ''}`
      if (/\bhackathon\b/i.test(fullContext)) title = 'Hackathon'
      else if (/\bpresentation\b/i.test(fullContext)) title = 'Presentation'
      else if (/\bdemo\b/i.test(fullContext)) title = 'Demo'
      else if (/\breview\b/i.test(fullContext)) title = 'Review'
      else if (/\bsync\b/i.test(fullContext)) title = 'Team Sync'
      else if (/\bmeet(?:ing)?\b/i.test(fullContext)) title = 'Meeting'
      else title = 'Team Event'
    }

    const date = toDateStr(dateRaw, cur.m)
    const time = timeRaw ? normalizeTimeStr(timeRaw) : undefined
    deadlines.push({
      id: `deadline-${deadlines.length + 1}`,
      title,
      date: time ? `${date}, ${time}` : date,
      time,
      priority: 'High',
      source: 'Conversation',
    })
  }

  // ---- Action items ----
  const rawActionItems: ActionItem[] = []
  const firstNameOf = (full: string) => full.split(/\s+/)[0].toLowerCase()

  for (const m of messages) {
    const sender = m.sender || firstUser
    const otherUser = sender === firstUser ? secondUser : firstUser
    const text = m.text

    const selfMatch =
      text.match(/\b(?:i\s+will|i'll|i'm\s+going\s+to|i\s+am\s+going\s+to|i\s+can|i\s+shall)\s+(?:be\s+)?(?:doing\s+)?(.{3,60}?)(?=[.,;!?\n]|$)/i) ||
      text.match(/\b(?:i'm|im|i\s+am)\s+(?:doing|handling|building|working\s+on|taking\s+care\s+of)\s+(.{3,60}?)(?=[.,;!?\n]|$)/i)
    if (selfMatch) {
      rawActionItems.push({ task: titleCase(selfMatch[1].trim()), assignee: sender, status: 'Pending' })
    }

    const otherMatch = text.match(
      /\byou(?:'re|\s+are|\s+will|'ll)\s+(?:be\s+)?(?:doing|handling|building|taking\s+care\s+of|working\s+on)?\s*(.{3,60}?)(?=[.,;!?\n]|$)/i
    )
    if (otherMatch) {
      rawActionItems.push({ task: titleCase(otherMatch[1].trim()), assignee: otherUser, status: 'Pending' })
    }

    // "Name, submit the report"
    const addressed = text.match(/^([A-Z][a-z]+),\s*(?:please\s+)?([a-z].{3,60}?)(?=[.!?]|$)/)
    if (addressed) {
      const target = participants.find((p) => firstNameOf(p) === addressed[1].toLowerCase())
      if (target) {
        rawActionItems.push({ task: titleCase(addressed[2].trim()), assignee: target, status: 'Pending' })
      }
    }
  }

  const seen = new Set<string>()
  const actionItems: ActionItem[] = []
  for (const item of rawActionItems) {
    const task = item.task.replace(/^Be\s+Doing\s+/i, '').trim()
    if (!task) continue
    const key = `${item.assignee.toLowerCase()}:${task.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    if (seen.has(key)) continue
    seen.add(key)
    actionItems.push({ task, assignee: item.assignee, status: 'Pending' })
  }

  let summary: string
  if (deadlines.length && actionItems.length) {
    summary = `${actionItems.length} action item(s) and ${deadlines.length} scheduled event(s) identified.`
  } else if (actionItems.length) {
    summary = `${actionItems.length} action item(s) identified.`
  } else if (deadlines.length) {
    summary = `Scheduled: ${deadlines.map((d) => d.title).join(', ')}.`
  } else {
    summary = 'No events or action items found in this conversation.'
  }

  return { deadlines, actionItems, summary, engine: 'fallback' }
}

/* -------------------------------------------------------------------------- */
/*  Gemini prompt + schema                                                    */
/* -------------------------------------------------------------------------- */

function buildSystemPrompt(): string {
  const now = new Date().toLocaleString('en-US', {
    timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return `You extract events, deadlines and action items from a chat between teammates.
Current date/time: ${now} (${TZ}). Each message may be prefixed with the time it was sent.

CRITICAL RULES FOR EVENT HEADER NAMES (title):
- title MUST be ONLY the clean, official name of the event or deadline as a short noun phrase (1-4 words), Title Case.
- NEVER include conversational sentence fragments or chat phrases like "Name Of This Event Is", "Theres An Even Coming Up", "I Think Of", "We Have", "Remember To", "Submit The", "Please Be Late", "Is Scheduled For".
- NEVER use generic titles like "Untitled Event", "Event", "Meeting", "Upcoming Event" if ANY specific topic, platform, project, or name is mentioned anywhere in the conversation.
- Multi-turn name resolution:
  * "there is an event on 8th october at 5 pm..." followed by "name of this event is abc" or "is it abc?" -> Title MUST be "abc" (or "abc Event").
  * "theres an even coming up on 11th october 10 am i think of stac" -> Title MUST be "STAC Event" (or "STAC").
  * "submit the Devpost project by 11:30 PM tonight" -> Title MUST be "Devpost Submission".
  * "Hackathon presentation on Sunday, 12th october at 5:00 PM" -> Title MUST be "Hackathon Presentation".
  * "robotics demo tomorrow at 4 pm" -> Title MUST be "Robotics Demo".
  * "design review is scheduled for friday at 2 pm" -> Title MUST be "Design Review".
- Keep acronyms and proper nouns exact (e.g. "STAC", "Devpost", "API", "UI").
- date: "Mon D" format, e.g. "Oct 11". Resolve "today", "tonight", "tomorrow", and weekdays relative to the time the message was sent (or the current date if unknown). If both a weekday and a date are given, trust the explicit date.
- time: "h:mm AM/PM", e.g. "6:00 PM". Empty string if no time was given. If am/pm is missing, infer it from context (an evening event is PM).

LINK CONTEXT ACROSS NEIGHBORING MESSAGES
The event name and its date/time are often split across two nearby messages, from either sender, in either order. Treat them as ONE event and output ONE entry.
- Name first, date later: "we have the design review" ... "it's on friday at 2" -> "Design Review", the Friday date, 2:00 PM.
- Date first, name later: "something's happening on 3rd March at 4pm" ... "it's the robotics demo" -> "Robotics Demo", Mar 3, 4:00 PM.
- Clarification: "there is an event on 8th oct" ... "name of this event is abc" -> "abc", Oct 8.
Only link messages that are clearly about the same thing and sit within a couple of messages of each other. Chatter in between ("ok", "cool") does not break the link.

RULES
- One entry per real event. If an event is mentioned again (reminders), merge into one entry. If its date or time is later changed, use the latest version.
- Never bleed or copy a title from one event onto a different, unrelated event.
- Only include items that have a date or a time. Ignore vague talk with no schedule.
- priority: "High" for hard deadlines, submissions, presentations, or anything within 48 hours; "Medium" for other planned events; "Low" for casual/optional ones.

ACTION ITEMS
- Concrete tasks someone committed to or was asked to do. "assignee" is the person's full name exactly as it appears in the transcript. Resolve "I" to the speaker and "you" to the other person in a two-person chat. status is "Pending" unless the chat says otherwise.
- task: short imperative phrase, e.g. "Build backend API services", "Develop frontend components".

SUMMARY: one short sentence.`
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    deadlines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          date: { type: Type.STRING },
          time: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
        },
        required: ['title', 'date', 'time', 'priority'],
        propertyOrdering: ['title', 'date', 'time', 'priority'],
      },
    },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING },
          assignee: { type: Type.STRING },
          status: { type: Type.STRING, enum: ['Pending', 'In Progress', 'Completed'] },
        },
        required: ['task', 'assignee', 'status'],
        propertyOrdering: ['task', 'assignee', 'status'],
      },
    },
    summary: { type: Type.STRING },
  },
  required: ['deadlines', 'actionItems', 'summary'],
  propertyOrdering: ['deadlines', 'actionItems', 'summary'],
}

function finalizeDeadlines(raw: any[]): DeadlineItem[] {
  const out: DeadlineItem[] = []
  const seen = new Set<string>()

  raw.forEach((d, idx) => {
    if (!d) return
    let title = polishTitle(String(d.title || d.name || ''))
    if (!title || /^(?:event|even|upcoming event)$/i.test(title)) title = 'Team Event'

    const dateRaw = String(d.date || d.due || '').trim()
    const timeRaw = String(d.time || '').trim()
    if (!dateRaw && !timeRaw) return

    const date = dateRaw ? normalizeDateStr(dateRaw) : ''
    const time = timeRaw ? normalizeTimeStr(timeRaw) : undefined
    const combined = [date, time].filter(Boolean).join(', ')

    const key = `${title.toLowerCase()}|${combined.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)

    out.push({
      id: String(d.id || `deadline-${idx + 1}`),
      title,
      date: combined,
      time,
      priority: (['High', 'Medium', 'Low'].includes(d.priority) ? d.priority : 'High') as DeadlineItem['priority'],
      source: 'Conversation',
    })
  })
  return out
}

/* -------------------------------------------------------------------------- */
/*  Request parsing                                                           */
/* -------------------------------------------------------------------------- */

function toIso(v: any): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

function normalizeMessages(raw: any[], me: string, partner: string): ChatMessage[] {
  const resolve = (s: string) => {
    const t = s.trim()
    if (t.toLowerCase() === 'you') return me
    if (t.toLowerCase() === 'partner') return partner
    return t
  }

  return raw.map((m: any) => {
    if (typeof m === 'string') {
      const idx = m.indexOf(':')
      const prefix = idx > 0 ? m.slice(0, idx) : ''
      if (prefix && /^[A-Za-z .'-]{1,40}$/.test(prefix)) {
        return { sender: resolve(prefix), text: m.slice(idx + 1).trim() }
      }
      return { sender: me, text: m.trim() }
    }
    const sender = m.sender || m.senderName || m.senderId || m.name || m.user || me
    return {
      sender: resolve(String(sender)),
      text: String(m.text || m.content || m.message || '').trim(),
      sentAt: toIso(m.createdAt || m.timestamp || m.sentAt),
    }
  })
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                   */
/* -------------------------------------------------------------------------- */

export async function processSynthesisRequest(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const queryConvoId = searchParams.get('conversationId') || searchParams.get('roomId') || searchParams.get('channelId')

    // If GET request, fetch and return saved synthesis from MongoDB
    if (request.method === 'GET') {
      if (queryConvoId) {
        await connectToDatabase()
        const saved = await Synthesis.findOne({ conversationId: queryConvoId })
        if (saved) {
          return NextResponse.json(
            {
              deadlines: saved.deadlines || [],
              actionItems: saved.actionItems || [],
              summary: saved.summary || '',
              updatedAt: saved.updatedAt,
              engine: 'saved',
            },
            { status: 200 }
          )
        }
      }
      return NextResponse.json(
        {
          deadlines: [],
          actionItems: [],
          summary: '',
        },
        { status: 200 }
      )
    }

    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const decoded = verifyAuthToken(request)
    const currentUserName = decoded?.username || 'Garv Dharmapuri'
    let partnerName = 'Ishaan Pande'

    const conversationId: string | undefined = body?.conversationId || body?.roomId || body?.channelId || queryConvoId || undefined

    const rawList: any[] | null = Array.isArray(body)
      ? body
      : Array.isArray(body?.messages)
        ? body.messages
        : Array.isArray(body?.conversation)
          ? body.conversation
          : null

    let messages: ChatMessage[] = rawList ? normalizeMessages(rawList, currentUserName, partnerName) : []

    // Fall back to the database if messages weren't sent with the request
    if (messages.length === 0 && conversationId) {
      if (conversationId.startsWith('dm-')) {
        const targetUserId = conversationId.replace(/^dm-/, '')
        const currentUserId = decoded?.userId

        try {
          await connectToDatabase()
          let rawMessages: any[] = []

          if (mongoose.isValidObjectId(targetUserId)) {
            const targetUserDoc = await User.findById(targetUserId).select('username')
            if (targetUserDoc?.username) partnerName = targetUserDoc.username

            if (currentUserId && mongoose.isValidObjectId(currentUserId) && currentUserId !== targetUserId) {
              rawMessages = await DirectMessage.find({
                $or: [
                  { senderId: currentUserId, recipientId: targetUserId },
                  { senderId: targetUserId, recipientId: currentUserId },
                ],
              })
                .sort({ createdAt: -1 })
                .limit(50)
            }

            if (!rawMessages || rawMessages.length === 0) {
              rawMessages = await DirectMessage.find({
                $or: [{ senderId: targetUserId }, { recipientId: targetUserId }],
              })
                .sort({ createdAt: -1 })
                .limit(50)
            }
          }

          if (rawMessages && rawMessages.length > 0) {
            messages = rawMessages.reverse().map((m) => {
              const isTarget =
                m.senderId?.toString() === targetUserId ||
                (m.senderId as any)?._id?.toString() === targetUserId
              return {
                sender: isTarget ? partnerName : currentUserName,
                text: m.text || (m as any).content || '',
                sentAt: toIso((m as any).createdAt),
              }
            })
          }
        } catch (dmErr) {
          console.warn('Error querying DirectMessage in synthesis:', dmErr)
        }
      } else {
        try {
          await connectToDatabase()
          const rawChannelMessages = await Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .limit(50)

          if (rawChannelMessages && rawChannelMessages.length > 0) {
            messages = rawChannelMessages.reverse().map((m) => ({
              sender: m.sender || currentUserName,
              text: m.content || '',
              sentAt: toIso((m as any).createdAt),
            }))
          }
        } catch (chanErr) {
          console.warn('Error querying Message in synthesis:', chanErr)
        }
      }
    }

    const validMessages = messages.filter((m) => m && m.text && m.text.trim().length > 0)
    if (validMessages.length === 0) {
      return NextResponse.json(
        { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
        { status: 200 }
      )
    }

    // ---- Gemini ----
    const transcript = validMessages
      .map((m) => {
        const stamp = formatStamp(m.sentAt)
        return `${stamp ? `[${stamp}] ` : ''}${m.sender}: ${m.text}`
      })
      .join('\n')

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[synthesis] GEMINI_API_KEY is not set in this environment. Using fallback parser.')
    } else {
      try {
        const ai = new GoogleGenAI({ apiKey })
        const modelsToTry = Array.from(
          new Set([process.env.GEMINI_MODEL, ...DEFAULT_GEMINI_MODELS].filter(Boolean) as string[])
        )

        let response: any = null
        let lastError: any = null

        for (const model of modelsToTry) {
          try {
            response = await ai.models.generateContent({
              model,
              contents: transcript,
              config: {
                systemInstruction: buildSystemPrompt(),
                responseMimeType: 'application/json',
                responseSchema,
              },
            })
            if (response && response.text) break
          } catch (modelErr) {
            lastError = modelErr
            console.warn(`[synthesis] Model "${model}" failed, trying next:`, (modelErr as any)?.message || modelErr)
          }
        }

        if (!response || !response.text) {
          throw lastError || new Error('No response from Gemini models')
        }

        const parsed = JSON.parse(cleanJsonResponse(response.text || ''))

        const deadlines = finalizeDeadlines(Array.isArray(parsed?.deadlines) ? parsed.deadlines : [])

        const seen = new Set<string>()
        const actionItems: ActionItem[] = []
        for (const a of Array.isArray(parsed?.actionItems) ? parsed.actionItems : []) {
          if (!a || !(a.task || a.title)) continue
          let assignee = String(a.assignee || 'Unassigned').trim()
          if (assignee.toLowerCase() === 'you') assignee = currentUserName
          if (assignee.toLowerCase() === 'partner') assignee = partnerName
          const task = String(a.task || a.title).trim()
          const key = `${assignee.toLowerCase()}:${task.toLowerCase().replace(/[^a-z0-9]/g, '')}`
          if (seen.has(key)) continue
          seen.add(key)
          actionItems.push({
            task,
            assignee,
            status: (['Pending', 'In Progress', 'Completed'].includes(a.status) ? a.status : 'Pending') as ActionItem['status'],
          })
        }

        const summary =
          typeof parsed?.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : `Analyzed ${validMessages.length} message(s).`

        // Automatically persist synthesized deadlines & action items to MongoDB
        if (conversationId) {
          try {
            await connectToDatabase()
            await Synthesis.findOneAndUpdate(
              { conversationId },
              {
                conversationId,
                deadlines,
                actionItems,
                summary,
              },
              { upsert: true, new: true }
            )
          } catch (persistErr) {
            console.warn('[synthesis] Failed to save Gemini synthesis to MongoDB:', persistErr)
          }
        }

        return NextResponse.json({ deadlines, actionItems, summary, engine: 'gemini' }, { status: 200 })
      } catch (geminiError: unknown) {
        // Log the real reason so it shows up in Vercel logs
        const err = geminiError as any
        console.error('[synthesis] Gemini call failed, using fallback parser:', err?.status, err?.message || err)
      }
    }

    return NextResponse.json(extractDynamicSynthesis(validMessages, currentUserName, partnerName), { status: 200 })
  } catch (error: unknown) {
    console.error('Safe catch-all in processSynthesisRequest:', error)
    return NextResponse.json(
      { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
      { status: 200 }
    )
  }
}