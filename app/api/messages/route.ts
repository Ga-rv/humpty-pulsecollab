import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { Message } from '@/models/Message'

export async function GET(request: NextRequest) {
  try {
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
