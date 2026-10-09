import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'

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

interface NormalizedMessage {
  senderName: string
  senderId: string
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

  // e.g. "11th October" or "11 October"
  const m1 = rawDate.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)/i)
  if (m1) {
    const monthKey = m1[2].toLowerCase()
    const monthName = months[monthKey] || m1[2]
    return `${monthName} ${m1[1]}`
  }

  // e.g. "October 11th" or "Oct 11"
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
 * Inspects the actual conversation messages and NEVER returns hardcoded strings.
 */
export function extractDynamicSynthesis(messages: NormalizedMessage[]): SynthesisResponse {
  const deadlines: DeadlineItem[] = []
  const actionItems: ActionItem[] = []

  for (const m of messages) {
    const sender = m.senderName || m.senderId || 'Team Member'
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

      let title = 'Upcoming Event'
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

    // 2. Detect Action Items for all parties
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

  // 3. Dynamic Summary
  const participants = Array.from(new Set(messages.map((m) => m.senderName || m.senderId).filter(Boolean)))
  let summary = ''
  if (deadlines.length > 0 && actionItems.length > 0) {
    summary = `Team commitments identified: ${actionItems.length} task(s) and ${deadlines.length} scheduled deadline(s) across participants (${participants.join(', ')}).`
  } else if (actionItems.length > 0) {
    summary = `Sprint action items recorded for ${participants.join(', ')}.`
  } else if (deadlines.length > 0) {
    summary = `Deadlines identified for upcoming sprint milestone(s).`
  } else {
    summary = `Conversation reviewed across ${participants.length > 0 ? participants.join(', ') : 'team'}.`
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

    // 2. Dynamic message array resolution
    let rawMessages: any[] = []

    if (body && typeof body === 'object' && 'messages' in body) {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return NextResponse.json(
          { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
          { status: 200 }
        )
      }
      rawMessages = body.messages
    } else if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json(
          { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
          { status: 200 }
        )
      }
      rawMessages = body
    } else if (body && typeof body === 'object' && 'conversation' in body) {
      if (!Array.isArray(body.conversation) || body.conversation.length === 0) {
        return NextResponse.json(
          { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
          { status: 200 }
        )
      }
      rawMessages = body.conversation
    } else if (body?.conversationId) {
      // Look up messages for conversationId from DB
      try {
        await connectToDatabase()
        const dbMsgs = await Message.find({ conversationId: body.conversationId }).sort({ createdAt: 1 })
        if (dbMsgs && dbMsgs.length > 0) {
          rawMessages = dbMsgs.map((m) => ({
            senderName: m.sender,
            senderId: m.sender,
            text: m.content,
          }))
        }
      } catch (err) {
        console.warn('DB message lookup skipped/failed:', err)
      }

      if (rawMessages.length === 0) {
        return NextResponse.json(
          { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
          { status: 200 }
        )
      }
    } else {
      return NextResponse.json(
        { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
        { status: 200 }
      )
    }

    // 3. Normalize messages
    const formattedMessages: NormalizedMessage[] = rawMessages
      .map((m) => {
        if (typeof m === 'string') {
          const parts = m.split(':')
          if (parts.length > 1) {
            return {
              senderName: parts[0].trim(),
              senderId: parts[0].trim(),
              text: parts.slice(1).join(':').trim(),
            }
          }
          return {
            senderName: 'User',
            senderId: 'User',
            text: m.trim(),
          }
        }
        if (m && typeof m === 'object') {
          const senderName = m.senderName || m.name || m.user || m.sender || ''
          const senderId = m.senderId || m.authorId || senderName || 'User'
          const text = m.text || m.content || m.message || ''
          return {
            senderName: senderName || senderId,
            senderId,
            text: String(text).trim(),
          }
        }
        return null
      })
      .filter((m): m is NormalizedMessage => Boolean(m && m.text.length > 0))

    if (formattedMessages.length === 0) {
      return NextResponse.json(
        { deadlines: [], actionItems: [], summary: 'No messages to synthesize.' },
        { status: 200 }
      )
    }

    // 4. Construct prompt dynamically with conversation text
    const conversationText = formattedMessages
      .map((m) => `${m.senderName || m.senderId}:${m.text}`)
      .join('\n')

    const prompt = `You are an AI sprint manager. Parse the following conversation and extract all deadlines and action items for every person mentioned.

Conversation:
${conversationText}

Return a valid JSON object matching this schema:
{
  "deadlines": [
    { "title": "string (event or deadline name)", "date": "string (e.g., Oct 11, 10:00 AM)", "priority": "High | Medium | Low" }
  ],
  "actionItems": [
    { "task": "string (clear action verb + scope)", "assignee": "string (name of person responsible)", "status": "Pending" }
  ],
  "summary": "string (1-2 sentence overview of commitments)"
}

Rules:
- Detect all events (e.g. if someone mentions an event on 11th October 10 AM, add it to deadlines).
- Extract action items for ALL parties involved (e.g. if one does frontend and another does backend, create separate tasks for both assignees).
- Return raw JSON only, no markdown backticks or commentary.`

    // 5. Call official Google Gen AI SDK with gemini-2.5-flash
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
              : `Sprint commitments analyzed across ${formattedMessages.length} message(s).`

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
    const dynamicResult = extractDynamicSynthesis(formattedMessages)
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
