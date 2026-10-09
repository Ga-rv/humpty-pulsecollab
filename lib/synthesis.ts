import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'
import { DirectMessage } from '@/models/DirectMessage'
import { User } from '@/models/User'
import { verifyAuthToken } from '@/lib/auth'

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
}

interface ChatMessage {
  sender: string
  text: string
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) return fenceMatch[1].trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return cleaned
}

function normalizeDateStr(rawDate: string): string {
  const months: Record<string, string> = {
    jan: 'Jan', january: 'Jan',
    feb: 'Feb', february: 'Feb',
    mar: 'Mar', march: 'Mar',
    apr: 'Apr', april: 'Apr',
    may: 'May',
    jun: 'Jun', june: 'Jun',
    jul: 'Jul', july: 'Jul',
    aug: 'Aug', august: 'Aug',
    sep: 'Sep', sept: 'Sep', september: 'Sep',
    oct: 'Oct', october: 'Oct',
    nov: 'Nov', november: 'Nov',
    dec: 'Dec', december: 'Dec',
  }

  const m1 = rawDate.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)/i)
  if (m1) {
    const monthKey = m1[2].toLowerCase()
    const monthName = months[monthKey] || m1[2]
    return `${monthName} ${m1[1]}`
  }

  const m2 = rawDate.match(/([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/i)
  if (m2) {
    const monthKey = m2[1].toLowerCase()
    const monthName = months[monthKey] || m2[1]
    return `${monthName} ${m2[2]}`
  }

  return rawDate
}

function normalizeTimeStr(rawTime: string): string {
  const m = rawTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (m) {
    const hour = m[1]
    const minute = m[2] || '00'
    const ampm = m[3] ? m[3].toUpperCase() : 'PM'
    return `${hour}:${minute} ${ampm}`
  }
  return rawTime.toUpperCase()
}

/**
 * Robust fallback parser when Gemini API key is missing or call fails.
 */
export function extractDynamicSynthesis(
  messages: ChatMessage[],
  defaultCurrentUser = 'Garv Dharmapuri',
  defaultPartner = 'Ishaan Pande'
): SynthesisResponse {
  const deadlines: DeadlineItem[] = []
  const rawActionItems: ActionItem[] = []

  const participants = Array.from(new Set(messages.map((m) => m.sender).filter(Boolean)))
  const firstUser = participants[0] || defaultCurrentUser
  const secondUser = participants.find((p) => p !== firstUser) || defaultPartner

  for (const m of messages) {
    let sender = m.sender || firstUser
    if (sender.toLowerCase() === 'you') sender = defaultCurrentUser
    if (sender.toLowerCase() === 'partner') sender = defaultPartner

    const otherUser = sender === firstUser ? secondUser : firstUser
    const text = m.text

    // Detect Dates
    const dateMatch =
      text.match(/(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)/i) ||
      text.match(/((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?)/i) ||
      text.match(/\b(today|tomorrow|tonight)\b/i)

    if (dateMatch) {
      const rawDate = dateMatch[1] || dateMatch[0]
      const formattedDate = normalizeDateStr(rawDate)

      const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|11:59\s*pm|midnight|noon)/i)
      let combinedDate = formattedDate
      if (timeMatch) {
        combinedDate = `${formattedDate}, ${normalizeTimeStr(timeMatch[1])}`
      }

      // Dynamic Title Cleaning: Strip dates, days, times, and filler words to get real title
      let title = text
        // remove explicit date strings
        .replace(/(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)/gi, '')
        .replace(/((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?)/gi, '')
        .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\b/gi, '')
        .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
        .replace(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|11:59\s*pm|midnight|noon)/gi, '')
        .replace(/\b(today|tomorrow|tonight)\b/gi, '')
        .replace(/\b(on|at|by|before|in|for|of|is|the|an?|and|also|so|hey|okay|ok|dont\s+forget|don't\s+forget|be\s+sure\s+to|be\s+there|theres|there\s+is|coming\s+up|i\s+think)\b/gi, ' ')
        .replace(/[,:;!?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      // Capitalize title
      if (title.length > 2) {
        title = title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      } else {
        title = 'Team Event'
      }

      // Normalization of common names
      if (/stac/i.test(title)) title = 'STAC Event'
      if (/devpost/i.test(title)) title = 'Devpost Submission'
      if (/hacktoberfest/i.test(title)) title = 'Hacktoberfest'

      deadlines.push({
        id: `deadline-${deadlines.length + 1}`,
        title,
        date: combinedDate,
        priority: 'High',
        source: 'Conversation',
      })
    }

    // Task extraction logic
    if (/(?:im|i'm|i\s+am)\s+(?:doing|handling|building)?\s*(?:front\s*end|frontend)/i.test(text)) {
      rawActionItems.push({ task: 'Develop frontend components', assignee: sender, status: 'Pending' })
    }
    if (/(?:you\s+are|you're)\s+(?:doing|handling|building)?\s*(?:back\s*end|backend)/i.test(text)) {
      rawActionItems.push({ task: 'Build backend API services', assignee: otherUser, status: 'Pending' })
    }
    if (/(?:im|i'm|i\s+am)\s+(?:doing|handling|building)?\s*(?:back\s*end|backend)/i.test(text)) {
      rawActionItems.push({ task: 'Build backend API services', assignee: sender, status: 'Pending' })
    }
    if (/(?:you\s+are|you're)\s+(?:doing|handling|building)?\s*(?:front\s*end|frontend)/i.test(text)) {
      rawActionItems.push({ task: 'Develop frontend components', assignee: otherUser, status: 'Pending' })
    }
  }

  // Deduplicate action items
  const seenActionItems = new Set<string>()
  const actionItems: ActionItem[] = []
  for (const item of rawActionItems) {
    const key = `${item.assignee.toLowerCase()}:${item.task.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    if (!seenActionItems.has(key)) {
      seenActionItems.add(key)
      actionItems.push(item)
    }
  }

  return {
    deadlines,
    actionItems,
    summary: `Sprint commitments analyzed across ${messages.length} message(s).`,
  }
}

export async function processSynthesisRequest(request: NextRequest): Promise<NextResponse> {
  try {
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      try {
        const text = await request.text()
        if (text && text.trim()) body = JSON.parse(text)
      } catch {
        body = {}
      }
    }

    let messages: ChatMessage[] = []
    const decoded = verifyAuthToken(request)
    let currentUserName = decoded?.username || 'Garv Dharmapuri'
    let partnerName = 'Ishaan Pande'

    if (body?.messages && Array.isArray(body.messages)) {
      messages = body.messages.map((m: any) => ({
        sender: String(m.sender || currentUserName).trim(),
        text: String(m.text || m.content || '').trim(),
      }))
    } else if (Array.isArray(body)) {
      messages = body.map((m: any) => ({
        sender: String(m.sender || currentUserName).trim(),
        text: String(m.text || m.content || '').trim(),
      }))
    }

    const conversationId = body?.conversationId || body?.roomId || body?.channelId
    if (messages.length === 0 && conversationId) {
      await connectToDatabase()
      const rawMsgs = await Message.find({ conversationId }).sort({ createdAt: -1 }).limit(100)
      if (rawMsgs.length > 0) {
        messages = rawMsgs.reverse().map((m) => ({
          sender: m.sender || currentUserName,
          text: m.content || '',
        }))
      }
    }

    const validMessages = messages.filter((m) => m && m.text && m.text.trim().length > 0)
    if (validMessages.length === 0) {
      return NextResponse.json({ deadlines: [], actionItems: [], summary: 'No messages to synthesize.' }, { status: 200 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      try {
        const transcript = validMessages.map((m) => `${m.sender}: ${m.text}`).join('\n')
        const ai = new GoogleGenAI({ apiKey })
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Extract deadlines and action items from this conversation transcript:\n\n${transcript}`,
          config: {
            systemInstruction: `You are an event extraction assistant. Return strictly a JSON object with:
"deadlines": array of { "id": string, "title": string, "date": string, "priority": "High"|"Medium"|"Low", "source": "Conversation" }
"actionItems": array of { "task": string, "assignee": string, "status": "Pending" }
"summary": string

CRITICAL RULE FOR TITLES:
- The title MUST be the actual event or activity name (e.g. "Hackathon Presentation", "STAC Event", "Devpost Submission").
- NEVER use month names ("October"), day names ("Sunday"), or generic placeholders as the title.`,
            responseMimeType: 'application/json',
          },
        })

        const rawText = response.text || ''
        const parsed = JSON.parse(cleanJsonResponse(rawText))
        if (parsed && Array.isArray(parsed.deadlines)) {
          return NextResponse.json(parsed, { status: 200 })
        }
      } catch (err) {
        console.warn('Gemini generation failed, falling back to dynamic parser:', err)
      }
    }

    // Dynamic clean fallback
    const fallback = extractDynamicSynthesis(validMessages, currentUserName, partnerName)
    return NextResponse.json(fallback, { status: 200 })
  } catch (error: unknown) {
    return NextResponse.json({ deadlines: [], actionItems: [], summary: 'Error processing synthesis.' }, { status: 500 })
  }
}
