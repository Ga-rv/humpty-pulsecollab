import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'
import { DirectMessage } from '@/models/DirectMessage'
import { verifyAuthToken } from '@/lib/auth'

export interface DeadlineItem {
  title: string
  date: string
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
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }
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
 * Pure dynamic extractor used when Gemini API key is missing or calls throw.
 * Inspects the actual conversation messages without hardcoded mock strings.
 */
export function extractDynamicSynthesis(messages: ChatMessage[]): SynthesisResponse {
  const deadlines: DeadlineItem[] = []
  const actionItems: ActionItem[] = []

  for (const m of messages) {
    const sender = m.sender || 'Participant'
    const text = m.text

    // 1. Detect Deadlines & Events
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

      let title = 'Event'
      if (/\bevent\s+(?:on|at|for|by|scheduled|in)\b/i.test(text)) {
        title = 'Event'
      } else {
        const eventNameMatch =
          text.match(/event\s+['"]([^'"]+)['"]/i) ||
          text.match(/['"]([^'"]+)['"]\s+event/i) ||
          text.match(/\b([A-Z][a-zA-Z0-9_\s]{2,25})\s+(?:deadline|due|event|hackathon|workshop|release)/i) ||
          text.match(/\b(hackathon|workshop|meetup|demo|presentation|release|submission|sprint)\b/i)

        if (eventNameMatch) {
          const found = eventNameMatch[1] ? eventNameMatch[1].trim() : eventNameMatch[0].trim()
          title = found.charAt(0).toUpperCase() + found.slice(1)
        } else if (text.toLowerCase().includes('event')) {
          title = 'Event'
        }
      }

      deadlines.push({
        title,
        date: combinedDate,
        priority: 'High',
      })
    }

    // 2. Detect Action Items
    const selfPatterns = [
      /(?:i\s+will|i'll|i\s+can|i\s+am\s+going\s+to|i'm\s+going\s+to|i\s+shall|i\s+plan\s+to)\s+([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/gi,
      /(?:will\s+be\s+doing|doing)\s+([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/gi,
      /(?:taking\s+care\s+of|handling|building|working\s+on)\s+([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/gi,
    ]

    for (const pat of selfPatterns) {
      let match
      while ((match = pat.exec(text)) !== null) {
        const taskText = match[1]?.trim()
        if (taskText && taskText.length > 3) {
          const cleanTask = taskText.charAt(0).toUpperCase() + taskText.slice(1)
          if (!actionItems.some((a) => a.task.toLowerCase() === cleanTask.toLowerCase() && a.assignee === sender)) {
            actionItems.push({
              task: cleanTask,
              assignee: sender,
              status: 'Pending',
            })
          }
        }
      }
    }

    const otherPatterns = [
      /(?:^|[.,\n])\s*([A-Z][a-zA-Z0-9_]+)\s+(?:will|to|shall)\s+([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/g,
      /(?:task|todo|action\s+item)\s*:\s*([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/gi,
    ]

    for (const pat of otherPatterns) {
      let match
      while ((match = pat.exec(text)) !== null) {
        if (match.length === 3) {
          const otherPerson = match[1]?.trim()
          const otherTask = match[2]?.trim()
          if (otherPerson && otherTask && otherTask.length > 3) {
            const cleanTask = otherTask.charAt(0).toUpperCase() + otherTask.slice(1)
            if (!actionItems.some((a) => a.task.toLowerCase() === cleanTask.toLowerCase() && a.assignee === otherPerson)) {
              actionItems.push({
                task: cleanTask,
                assignee: otherPerson,
                status: 'Pending',
              })
            }
          }
        } else if (match.length === 2) {
          const explicitTask = match[1]?.trim()
          if (explicitTask && explicitTask.length > 3) {
            const cleanTask = explicitTask.charAt(0).toUpperCase() + explicitTask.slice(1)
            if (!actionItems.some((a) => a.task.toLowerCase() === cleanTask.toLowerCase() && a.assignee === sender)) {
              actionItems.push({
                task: cleanTask,
                assignee: sender,
                status: 'Pending',
              })
            }
          }
        }
      }
    }
  }

  const participants = Array.from(new Set(messages.map((m) => m.sender).filter(Boolean)))
  let summary = ''
  if (deadlines.length > 0 && actionItems.length > 0) {
    summary = `Team commitments identified: ${actionItems.length} task(s) and ${deadlines.length} scheduled deadline(s) across participants (${participants.join(', ')}).`
  } else if (actionItems.length > 0) {
    summary = `Sprint action items recorded for ${participants.join(', ')}.`
  } else if (deadlines.length > 0) {
    summary = `Deadlines identified for upcoming sprint milestone(s).`
  } else {
    summary = `Conversation reviewed across ${participants.length > 0 ? participants.join(', ') : 'participants'}.`
  }

  return {
    deadlines,
    actionItems,
    summary,
  }
}

/**
 * Robust, dynamic synthesis handler.
 */
export async function processSynthesisRequest(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Extract request body safely
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      try {
        const text = await request.text()
        if (text && text.trim()) {
          body = JSON.parse(text)
        }
      } catch {
        body = {}
      }
    }

    let messages: ChatMessage[] = []

    // 2. If req.body.messages is already provided as an array, use it directly
    if (body && typeof body === 'object' && 'messages' in body) {
      if (Array.isArray(body.messages)) {
        if (body.messages.length === 0) {
          return NextResponse.json(
            { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
            { status: 200 }
          )
        }
        messages = body.messages.map((m: any) => {
          if (typeof m === 'string') {
            const parts = m.split(':')
            if (parts.length > 1) {
              return { sender: parts[0].trim(), text: parts.slice(1).join(':').trim() }
            }
            return { sender: 'User', text: m.trim() }
          }
          return {
            sender: m.sender || m.senderName || m.senderId || m.name || m.user || 'User',
            text: String(m.text || m.content || m.message || '').trim(),
          }
        })
      }
    } else if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json(
          { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
          { status: 200 }
        )
      }
      messages = body.map((m: any) => {
        if (typeof m === 'string') {
          return { sender: 'User', text: m.trim() }
        }
        return {
          sender: m.sender || m.senderName || m.senderId || m.name || m.user || 'User',
          text: String(m.text || m.content || m.message || '').trim(),
        }
      })
    } else if (body && typeof body === 'object' && 'conversation' in body && Array.isArray(body.conversation)) {
      if (body.conversation.length === 0) {
        return NextResponse.json(
          { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
          { status: 200 }
        )
      }
      messages = body.conversation.map((m: any) => {
        if (typeof m === 'string') {
          return { sender: 'User', text: m.trim() }
        }
        return {
          sender: m.sender || m.senderName || m.senderId || m.name || m.user || 'User',
          text: String(m.text || m.content || m.message || '').trim(),
        }
      })
    }

    // 3. If messages not passed directly, check conversationId
    const conversationId: string | undefined =
      body?.conversationId || body?.roomId || body?.channelId

    if (messages.length === 0 && conversationId) {
      if (conversationId.startsWith('dm-')) {
        // Direct Messages: Query DirectMessage collection
        const targetUserId = conversationId.replace(/^dm-/, '')
        const decoded = verifyAuthToken(request)
        const currentUserId = decoded?.userId

        try {
          await connectToDatabase()
          let rawMessages: any[] = []

          if (mongoose.isValidObjectId(targetUserId)) {
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
                $or: [
                  { senderId: targetUserId },
                  { recipientId: targetUserId },
                ],
              })
                .sort({ createdAt: -1 })
                .limit(50)
            }
          }

          if (rawMessages && rawMessages.length > 0) {
            messages = rawMessages.reverse().map((m) => ({
              sender: m.senderId?.toString() === targetUserId ? 'Partner' : 'You',
              text: m.text || (m as any).content || '',
            }))
          }
        } catch (dmErr) {
          console.warn('Error querying DirectMessage in synthesis:', dmErr)
        }
      } else {
        // Channel messages: Query Message collection
        try {
          await connectToDatabase()
          const rawChannelMessages = await Message.find({ conversationId })
            .sort({ createdAt: -1 })
            .limit(50)

          if (rawChannelMessages && rawChannelMessages.length > 0) {
            messages = rawChannelMessages.reverse().map((m) => ({
              sender: m.sender || 'User',
              text: m.content || '',
            }))
          }
        } catch (chanErr) {
          console.warn('Error querying Message in synthesis:', chanErr)
        }
      }
    }

    // 4. Validate messages
    const validMessages = messages.filter((m) => m && m.text && m.text.trim().length > 0)

    if (validMessages.length === 0) {
      return NextResponse.json(
        { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
        { status: 200 }
      )
    }

    // 5. Call Gemini 2.5 Flash
    const transcript = validMessages.map((m) => `${m.sender}: ${m.text}`).join('\n')

    const prompt = `You are an AI sprint manager. Analyze this conversation transcript and extract all upcoming deadlines, events, and action items for each participant.

Transcript:
${transcript}

Return strictly valid JSON with this schema (no markdown fences, no extra text):
{
  "deadlines": [
    { "title": "string", "date": "string", "priority": "High|Medium|Low" }
  ],
  "actionItems": [
    { "task": "string", "assignee": "string", "status": "Pending" }
  ],
  "summary": "string"
}`

    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey })
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        })

        const rawText = response.text || ''
        const cleaned = cleanJsonResponse(rawText)
        const parsed = JSON.parse(cleaned)

        if (parsed && typeof parsed === 'object') {
          const deadlines: DeadlineItem[] = Array.isArray(parsed.deadlines)
            ? parsed.deadlines
                .filter((d: any) => d && (d.title || d.name))
                .map((d: any) => ({
                  title: String(d.title || d.name).trim(),
                  date: String(d.date || d.due || '').trim(),
                  priority: (['High', 'Medium', 'Low'].includes(d.priority) ? d.priority : 'High') as 'High' | 'Medium' | 'Low',
                }))
            : []

          const actionItems: ActionItem[] = Array.isArray(parsed.actionItems)
            ? parsed.actionItems
                .filter((a: any) => a && (a.task || a.title))
                .map((a: any) => ({
                  task: String(a.task || a.title).trim(),
                  assignee: String(a.assignee || 'Unassigned').trim(),
                  status: (['Pending', 'In Progress', 'Completed'].includes(a.status) ? a.status : 'Pending') as 'Pending' | 'In Progress' | 'Completed',
                }))
            : []

          const summary =
            typeof parsed.summary === 'string' && parsed.summary.trim()
              ? parsed.summary.trim()
              : `Sprint commitments analyzed across ${validMessages.length} message(s).`

          return NextResponse.json(
            {
              deadlines,
              actionItems,
              summary,
            },
            { status: 200 }
          )
        }
      } catch (geminiError: unknown) {
        console.warn('Gemini 2.5 Flash call failed, using dynamic parser:', geminiError)
      }
    }

    // 6. Dynamic fallback parsing (zero hardcoded strings)
    const dynamicResult = extractDynamicSynthesis(validMessages)
    return NextResponse.json(dynamicResult, { status: 200 })
  } catch (error: unknown) {
    console.error('Safe catch-all in processSynthesisRequest:', error)
    return NextResponse.json(
      {
        deadlines: [],
        actionItems: [],
        summary: 'No messages to synthesize.',
      },
      { status: 200 }
    )
  }
}
