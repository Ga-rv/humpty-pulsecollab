import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'
import { Conversation } from '@/models/Conversation'
import { CHANNELS, SEED_MESSAGES, getRoom } from '@/lib/pulse/data'
import mongoose from 'mongoose'

interface ActionItem {
  task: string
  assignee: string
  deadline: string
}

interface DeadlineItem {
  title: string
  due: string
  source: string
  urgency: 'URGENT' | 'SOON'
  calendarUrl: string
}

interface PulseSynthesisResult {
  decisions: string[]
  actionItems: ActionItem[]
  deadlines: DeadlineItem[]
  unresolved: string[]
}

function buildCalendarUrl(title: string, source: string): string {
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&details=${encodeURIComponent(source || '')}`
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return cleaned
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, scope = 'last50' } = body

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // 1. Fetch conversation & projectContext
    let projectContext = ''
    try {
      await connectToDatabase()
      const isObjectId = mongoose.isValidObjectId(conversationId)
      const conv = await Conversation.findOne({
        $or: [
          ...(isObjectId ? [{ _id: conversationId }] : []),
          { name: conversationId },
        ],
      })
      if (conv?.projectContext) {
        projectContext = conv.projectContext
      }
    } catch (e) {
      console.warn('MongoDB conversation lookup skipped/failed:', e)
    }

    if (!projectContext) {
      const fallbackRoom = CHANNELS.find((c) => c.id === conversationId) || getRoom(conversationId)
      projectContext = fallbackRoom?.context || 'First Commit Hackathon sprint channel'
    }

    // 2. Fetch messages for the conversation
    interface FormattedMsg {
      sender: string
      content: string
      time: string
    }

    let messagesList: FormattedMsg[] = []

    try {
      await connectToDatabase()
      let dbMessages
      if (scope === 'today') {
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        dbMessages = await Message.find({
          conversationId,
          createdAt: { $gte: startOfDay },
        }).sort({ createdAt: 1 })
      } else {
        // last 50
        const rev = await Message.find({ conversationId })
          .sort({ createdAt: -1 })
          .limit(50)
        dbMessages = rev.reverse()
      }

      if (dbMessages && dbMessages.length > 0) {
        messagesList = dbMessages.map((m) => ({
          sender: m.sender,
          content: m.content,
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }))
      }
    } catch (e) {
      console.warn('MongoDB message lookup skipped/failed:', e)
    }

    // Fallback to seed messages if database has no messages yet
    if (messagesList.length === 0 && SEED_MESSAGES[conversationId]) {
      messagesList = SEED_MESSAGES[conversationId].map((m) => ({
        sender: m.authorId,
        content: m.text,
        time: m.time,
      }))
    }

    const messagesText =
      messagesList.length > 0
        ? messagesList
            .map((m) => `[${m.time}] ${m.sender}: ${m.content}`)
            .join('\n')
        : 'No previous messages in this conversation thread yet.'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'GEMINI_API_KEY is not defined. Please set GEMINI_API_KEY in your .env file.',
        },
        { status: 500 }
      )
    }

    // 3. Call Gemini 1.5 Flash using @google/genai
    const ai = new GoogleGenAI({ apiKey })

    const prompt = `You are the AI synthesis engine for PulseCollab, an agile hackathon war room and project collaboration system.
Analyze the following conversation thread and project context for the channel "${conversationId}".

Channel Project Context:
${projectContext}

Conversation Messages (Scope: ${scope}):
${messagesText}

Instructions:
Extract actionable intelligence and return ONLY a valid JSON object matching this EXACT schema:
{
  "decisions": ["string"],
  "actionItems": [
    {
      "task": "string",
      "assignee": "string",
      "deadline": "string"
    }
  ],
  "deadlines": [
    {
      "title": "string",
      "due": "string",
      "source": "string",
      "urgency": "URGENT" | "SOON",
      "calendarUrl": "string"
    }
  ],
  "unresolved": ["string"]
}

Guidelines:
- Decisions: List explicit decisions agreed upon by team members.
- ActionItems: Direct tasks assigned to people or taken up with stated or implied deadlines.
- Deadlines: Hard deadlines, delivery targets, or submission cutoffs. Urgency must be either "URGENT" (e.g. today, imminent) or "SOON". Set source to the person or announcement who stated it.
- Unresolved: Questions, doubts, or ambiguities that were asked and not answered yet in the messages.
- For calendarUrl, you can provide an empty string or template URL, as it will be dynamically verified by the server.
- Return ONLY valid JSON, with no markdown code fences, comments, or intro/outro prose.`

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const rawText = response.text || ''
    const cleaned = cleanJsonResponse(rawText)
    const parsed: PulseSynthesisResult = JSON.parse(cleaned)

    // 4. Validate and dynamically build calendarUrl for all deadlines
    const deadlines: DeadlineItem[] = (parsed.deadlines || []).map((d) => ({
      title: d.title || 'Untitled Deadline',
      due: d.due || 'TBD',
      source: d.source || 'Conversation',
      urgency: d.urgency === 'URGENT' ? 'URGENT' : 'SOON',
      calendarUrl: buildCalendarUrl(d.title || 'Deadline', d.source || 'PulseCollab'),
    }))

    const result: PulseSynthesisResult = {
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      actionItems: (parsed.actionItems || []).map((a) => ({
        task: a.task || '',
        assignee: a.assignee || 'Unassigned',
        deadline: a.deadline || 'Pending',
      })),
      deadlines,
      unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved : [],
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Pulse synthesis error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to synthesize pulse' },
      { status: 500 }
    )
  }
}
