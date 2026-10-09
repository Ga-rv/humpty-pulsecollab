import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'
import { verifyAuthToken } from '@/lib/auth'
import { triggerPusherEvent } from '@/lib/pusher-server'

export async function GET(request: NextRequest) {
  try {
    const decoded = verifyAuthToken(request)
    if (!decoded || decoded.isGuest || decoded.role === 'Guest') {
      return NextResponse.json([], { status: 200 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 })

    return NextResponse.json({ messages }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching messages:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = verifyAuthToken(request)
    if (!decoded || decoded.isGuest || decoded.role === 'Guest') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversationId, sender, content } = body

    if (!conversationId || !sender || !content) {
      return NextResponse.json(
        { error: 'conversationId, sender, and content are required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const message = await Message.create({
      conversationId,
      sender: sender.trim(),
      content: content.trim(),
    })

    // Broadcast real-time WebSocket event via Pusher
    await triggerPusherEvent(`chat-${conversationId}`, 'new-message', {
      id: message._id.toString(),
      _id: message._id.toString(),
      roomId: conversationId,
      conversationId,
      authorId: sender.trim(),
      sender: sender.trim(),
      text: content.trim(),
      content: content.trim(),
      createdAt: message.createdAt,
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error creating message:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
