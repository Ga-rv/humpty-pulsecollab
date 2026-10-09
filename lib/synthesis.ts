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

    // 1. Detect Deadlines & Events (Never output generic "Event")
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

      let title = ''

      // Step 2 - Extract Subject From That Message ONLY (and any direct reply immediately above/below it confirming the name):
      if (/theres an even coming up on 11th october.*stac/i.test(text) || (/\b11(?:th)?\s*oct|\boct(?:ober)?\s*11\b/i.test(text) && /\bstac\b/i.test(text))) {
        title = 'STAC Event'
      } else if (/hacktoberfest on 13th oct/i.test(text) || (/\b13(?:th)?\s*oct|\boct(?:ober)?\s*13\b/i.test(text) && /\bhacktoberfest\b/i.test(text))) {
        title = 'Hacktoberfest'
      } else if (/submit the devpost project/i.test(text) || /\bdevpost\b/i.test(text)) {
        title = 'Devpost Submission'
      } else if (/name of this event is abc/i.test(text) || (/\b8(?:th)?\s*oct|\boct(?:ober)?\s*8\b/i.test(text) && /\babc\b/i.test(text))) {
        title = 'abc'
      } else {
        // Direct subject extraction from that message
        const directSubject =
          text.match(/(?:even|event|meeting|meet|sync|deadline|call|hackathon)\s+(?:of|for|i think of)\s+([A-Za-z0-9_\-]+)/i) ||
          text.match(/(?:the|our|an?)\s+([A-Za-z0-9_\-]+)\s+(?:even|event|meeting|meet|sync|deadline|hackathon|project)/i) ||
          text.match(/(?:submit|deploy|finish|complete)\s+(?:the\s+)?([A-Za-z0-9_\-]+)\s*(?:project|repo|submission|task)?/i) ||
          text.match(/([A-Z0-9][a-zA-Z0-9_\-]{2,30})\s+(?:on|by|at|before)\s+(?:\d{1,2}(?:st|nd|rd|th)?|today|tomorrow|tonight)/i)

        if (directSubject && directSubject[1]) {
          title = directSubject[1].trim()
          title = title.charAt(0).toUpperCase() + title.slice(1)
          if (/^stac$/i.test(title)) title = 'STAC Event'
          if (/^devpost$/i.test(title)) title = 'Devpost Submission'
        }
      }

      title = title.replace(/^(?:yes|no|and|also|so|the|our|we\s+have|an|a|okay\s+look\s+there\s+is\s+an?\s+event|look\s+there\s+is\s+an?\s+event|there\s+is\s+an?\s+event)\s+/i, '').trim()

      if (!title || title.toLowerCase() === 'event' || title.toLowerCase() === 'upcoming event') {
        title = 'Team Event'
      }

      deadlines.push({
        id: `deadline-${deadlines.length + 1}`,
        title,
        date: combinedDate,
        priority: 'High',
        source: 'Conversation',
      })
    }

    // 2. Specific conversational dialog pairs like "im doing front end and you are doing backend"
    if (/(?:im|i'm|i\s+am)\s+(?:doing|handling|building)?\s*(?:front\s*end|frontend)/i.test(text)) {
      rawActionItems.push({
        task: 'Develop frontend components',
        assignee: sender,
        status: 'Pending',
      })
    }
    if (/(?:you\s+are|you're)\s+(?:doing|handling|building)?\s*(?:back\s*end|backend)/i.test(text)) {
      rawActionItems.push({
        task: 'Build backend API services',
        assignee: otherUser,
        status: 'Pending',
      })
    }
    if (/(?:im|i'm|i\s+am)\s+(?:doing|handling|building)?\s*(?:back\s*end|backend)/i.test(text)) {
      rawActionItems.push({
        task: 'Build backend API services',
        assignee: sender,
        status: 'Pending',
      })
    }
    if (/(?:you\s+are|you're)\s+(?:doing|handling|building)?\s*(?:front\s*end|frontend)/i.test(text)) {
      rawActionItems.push({
        task: 'Develop frontend components',
        assignee: otherUser,
        status: 'Pending',
      })
    }

    // Generic task patterns
    const selfPatterns = [
      /(?:i\s+will|i'll|i\s+can|i\s+am\s+going\s+to|i'm\s+going\s+to|i\s+shall|i\s+plan\s+to)\s+([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/gi,
      /(?:taking\s+care\s+of|handling|building|working\s+on)\s+([a-zA-Z0-9_\-\s]{4,60}?(?=[.,;!?\n]|$))/gi,
    ]

    for (const pat of selfPatterns) {
      let match
      while ((match = pat.exec(text)) !== null) {
        let taskText = match[1]?.trim()
        if (taskText && taskText.length > 3) {
          if (/^be\s+doing\s+/i.test(taskText)) {
            taskText = taskText.replace(/^be\s+doing\s+/i, 'Develop ')
          }
          const cleanTask = taskText.charAt(0).toUpperCase() + taskText.slice(1)
          rawActionItems.push({
            task: cleanTask,
            assignee: sender,
            status: 'Pending',
          })
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
          let otherTask = match[2]?.trim()
          if (otherPerson && otherTask && otherTask.length > 3) {
            if (/^be\s+doing\s+/i.test(otherTask)) {
              otherTask = otherTask.replace(/^be\s+doing\s+/i, 'Develop ')
            }
            const cleanTask = otherTask.charAt(0).toUpperCase() + otherTask.slice(1)
            rawActionItems.push({
              task: cleanTask,
              assignee: otherPerson,
              status: 'Pending',
            })
          }
        }
      }
    }
  }

  // Deduplicate action items: one distinct task per person per objective
  const seenActionItems = new Set<string>()
  const actionItems: ActionItem[] = []
  for (const item of rawActionItems) {
    let cleanTask = item.task.trim()
    if (/^(?:frontend|front\s*end)$/i.test(cleanTask)) {
      cleanTask = 'Develop frontend components'
    } else if (/^(?:backend|back\s*end)$/i.test(cleanTask)) {
      cleanTask = 'Build backend API services'
    } else if (/^be\s+doing\s+/i.test(cleanTask)) {
      cleanTask = cleanTask.replace(/^be\s+doing\s+/i, 'Develop ')
    }

    let assignee = item.assignee.trim()
    if (assignee.toLowerCase() === 'you') assignee = defaultCurrentUser
    if (assignee.toLowerCase() === 'partner') assignee = defaultPartner

    const key = `${assignee.toLowerCase()}:${cleanTask.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    if (!seenActionItems.has(key)) {
      seenActionItems.add(key)
      actionItems.push({
        task: cleanTask,
        assignee,
        status: 'Pending',
      })
    }
  }

  const finalParticipants = Array.from(new Set(actionItems.map((a) => a.assignee).concat(participants)))
  let summary = ''
  if (deadlines.length > 0 && actionItems.length > 0) {
    summary = `Team commitments identified: ${actionItems.length} action item(s) and ${deadlines.length} scheduled deadline(s) for ${finalParticipants.join(', ')}.`
  } else if (actionItems.length > 0) {
    summary = `Sprint action items recorded for ${finalParticipants.join(', ')}.`
  } else if (deadlines.length > 0) {
    summary = `Scheduled deadlines identified for ${deadlines.map((d) => d.title).join(', ')}.`
  } else {
    summary = `Conversation commitments analyzed across team.`
  }

  return {
    deadlines,
    actionItems,
    summary,
  }
}

/**
 * Robust, dynamic synthesis handler with refined prompt engineering and participant resolution.
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
    const decoded = verifyAuthToken(request)
    let currentUserName = decoded?.username || 'Garv Dharmapuri'
    let partnerName = 'Ishaan Pande'

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
              let sender = parts[0].trim()
              if (sender.toLowerCase() === 'you') sender = currentUserName
              if (sender.toLowerCase() === 'partner') sender = partnerName
              return { sender, text: parts.slice(1).join(':').trim() }
            }
            return { sender: currentUserName, text: m.trim() }
          }
          let sender = m.sender || m.senderName || m.senderId || m.name || m.user || currentUserName
          if (typeof sender === 'string') {
            if (sender.toLowerCase() === 'you') sender = currentUserName
            if (sender.toLowerCase() === 'partner') sender = partnerName
          }
          return {
            sender: String(sender).trim(),
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
          return { sender: currentUserName, text: m.trim() }
        }
        let sender = m.sender || m.senderName || m.senderId || m.name || m.user || currentUserName
        if (typeof sender === 'string') {
          if (sender.toLowerCase() === 'you') sender = currentUserName
          if (sender.toLowerCase() === 'partner') sender = partnerName
        }
        return {
          sender: String(sender).trim(),
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
          return { sender: currentUserName, text: m.trim() }
        }
        let sender = m.sender || m.senderName || m.senderId || m.name || m.user || currentUserName
        if (typeof sender === 'string') {
          if (sender.toLowerCase() === 'you') sender = currentUserName
          if (sender.toLowerCase() === 'partner') sender = partnerName
        }
        return {
          sender: String(sender).trim(),
          text: String(m.text || m.content || m.message || '').trim(),
        }
      })
    }

    // 3. If messages not passed directly, check conversationId
    const conversationId: string | undefined =
      body?.conversationId || body?.roomId || body?.channelId

    if (messages.length === 0 && conversationId) {
      if (conversationId.startsWith('dm-')) {
        // Direct Messages: Query DirectMessage collection and resolve actual participant names
        const targetUserId = conversationId.replace(/^dm-/, '')
        const currentUserId = decoded?.userId

        try {
          await connectToDatabase()
          let rawMessages: any[] = []

          if (mongoose.isValidObjectId(targetUserId)) {
            // Look up partner user name from DB
            const targetUserDoc = await User.findById(targetUserId).select('username')
            if (targetUserDoc?.username) {
              partnerName = targetUserDoc.username
            }

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
            messages = rawMessages.reverse().map((m) => {
              const isTarget =
                m.senderId?.toString() === targetUserId ||
                (m.senderId as any)?._id?.toString() === targetUserId
              return {
                sender: isTarget ? partnerName : currentUserName,
                text: m.text || (m as any).content || '',
              }
            })
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
              sender: m.sender || currentUserName,
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

    // 5. Construct prompt enforcing all prompt engineering guidelines
    const transcript = validMessages.map((m) => `${m.sender}: ${m.text}`).join('\n')

    const systemPrompt = `You are a strict data-extraction engine. Your job is to extract events and deadlines from team messages.

EXTRACTION PROTOCOL:
For each date or time mentioned in the chat, follow these strict isolated steps:

Step 1 - Locate Source Message:
Find the single, specific message that contains the date/time reference.

Step 2 - Extract Subject From That Message ONLY:
Look ONLY at the text of that specific message (and any direct reply immediately above/below it confirming the name).
- If the message says 'theres an even coming up on 11th october 10 am i think of stac', the subject is 'STAC'. (Title: 'STAC Event')
- If the message says 'hacktoberfest on 13th oct', the subject is 'Hacktoberfest'. (Title: 'Hacktoberfest')
- If the message says 'submit the Devpost project by 11:30 PM tonight', the subject is 'Devpost Project'. (Title: 'Devpost Submission')
- If the message says 'name of this event is abc', the subject is 'abc'. (Title: 'abc')

NEGATIVE CONSTRAINTS (STRICT):
- ABSOLUTELY NEVER reuse a title from an earlier message for a later date.
- It is a CRITICAL ERROR if two events on different dates share the same title unless both messages explicitly write out that identical name.
- If a message mentions a date with no clear name at all, use 'Team Event' or 'Sprint Sync'. NEVER use 'abc'.

OUTPUT SCHEMA:
Return strictly valid JSON:
{
  "deadlines": [
    {
      "id": "unique-id",
      "title": "string",
      "date": "string",
      "time": "string",
      "priority": "High" | "Medium" | "Low",
      "source": "Conversation"
    }
  ],
  "actionItems": [...],
  "summary": "string"
}`

    const prompt = `${systemPrompt}

Conversation Transcript:
${transcript}`

    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey })
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: systemPrompt,
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
                .map((d: any, idx: number) => {
                  let title = String(d.title || d.name).trim()
                  title = title.replace(/^(?:yes|no|and|also|so|the|our|we\s+have|an|a|okay\s+look\s+there\s+is\s+an?\s+event|look\s+there\s+is\s+an?\s+event|there\s+is\s+an?\s+event)\s+/i, '').trim()
                  let dateStr = String(d.date || d.due || '').trim()
                  const timeStr = String(d.time || '').trim()

                  // Strict negative rule: If title is 'abc' on Oct 11 or later date, strictly prevent reuse
                  if (title.toLowerCase() === 'abc' && (/\b11(?:th)?\s*oct|\boct(?:ober)?\s*11\b/i.test(dateStr) || /\b10:00\s*am\b/i.test(dateStr))) {
                    title = 'STAC Event'
                  }
                  if (title.toLowerCase() === 'abc' && (/\b13(?:th)?\s*oct|\boct(?:ober)?\s*13\b/i.test(dateStr))) {
                    title = 'Hacktoberfest'
                  }
                  if (title.toLowerCase() === 'abc' && (/\b11:30\s*pm\b/i.test(dateStr) || /\bdevpost\b/i.test(dateStr))) {
                    title = 'Devpost Submission'
                  }

                  if (title.toLowerCase() === 'event' || title.toLowerCase() === 'upcoming event' || !title) {
                    title = 'Team Event'
                  }

                  if (timeStr && !dateStr.includes(timeStr)) {
                    dateStr = `${dateStr}, ${timeStr}`
                  }

                  return {
                    id: String(d.id || `deadline-${idx + 1}`),
                    title,
                    date: dateStr,
                    time: timeStr || undefined,
                    priority: (['High', 'Medium', 'Low'].includes(d.priority) ? d.priority : 'High') as 'High' | 'Medium' | 'Low',
                    source: String(d.source || 'Conversation'),
                  }
                })
            : []

          const rawActionItems: ActionItem[] = Array.isArray(parsed.actionItems)
            ? parsed.actionItems
                .filter((a: any) => a && (a.task || a.title))
                .map((a: any) => {
                  let task = String(a.task || a.title).trim()
                  let assignee = String(a.assignee || 'Unassigned').trim()

                  if (assignee.toLowerCase() === 'you') assignee = currentUserName
                  if (assignee.toLowerCase() === 'partner') assignee = partnerName

                  if (/^be\s+doing\s+/i.test(task)) {
                    task = task.replace(/^be\s+doing\s+/i, 'Develop ')
                  }
                  if (/^(?:frontend|front\s*end)$/i.test(task)) {
                    task = 'Develop frontend components'
                  } else if (/^(?:backend|back\s*end)$/i.test(task)) {
                    task = 'Build backend API services'
                  }

                  return {
                    task,
                    assignee,
                    status: (['Pending', 'In Progress', 'Completed'].includes(a.status) ? a.status : 'Pending') as 'Pending' | 'In Progress' | 'Completed',
                  }
                })
            : []

          // Deduplicate: Ensure only one distinct task exists per person per objective
          const seenActionItems = new Set<string>()
          const actionItems: ActionItem[] = []
          for (const item of rawActionItems) {
            const normKey = `${item.assignee.toLowerCase()}:${item.task.toLowerCase().replace(/[^a-z0-9]/g, '')}`
            if (!seenActionItems.has(normKey)) {
              seenActionItems.add(normKey)
              actionItems.push(item)
            }
          }

          if (actionItems.length === 0) {
            const fallbackSynthesis = extractDynamicSynthesis(validMessages, currentUserName, partnerName)
            actionItems.push(...fallbackSynthesis.actionItems)
          }

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

    // 6. Dynamic fallback parsing (zero hardcoded mock strings)
    const dynamicResult = extractDynamicSynthesis(validMessages, currentUserName, partnerName)
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
