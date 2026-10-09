import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { DirectMessage } from '@/models/DirectMessage'
import { verifyAuthToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const decoded = verifyAuthToken(request)
    if (!decoded || decoded.isGuest || decoded.role === 'Guest') {
      return NextResponse.json([], { status: 200 })
    }

    const { searchParams } = new URL(request.url)
    const recipientId = searchParams.get('recipientId')

    if (!recipientId) {
      return NextResponse.json(
        { error: 'recipientId is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const currentUserId = decoded.userId

    const messages = await DirectMessage.find({
      $or: [
        { senderId: currentUserId, recipientId },
        { senderId: recipientId, recipientId: currentUserId },
      ],
    }).sort({ createdAt: 1 })

    return NextResponse.json({ messages }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching direct messages:', err)
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
    const { recipientId, text } = body

    if (!recipientId || !text || !text.trim()) {
      return NextResponse.json(
        { error: 'recipientId and text are required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const directMessage = await DirectMessage.create({
      senderId: decoded.userId,
      recipientId,
      text: text.trim(),
    })

    return NextResponse.json({ message: directMessage }, { status: 201 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error creating direct message:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
