import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongodb'
import { Conversation } from '@/models/Conversation'
import { User } from '@/models/User'
import { verifyAuthToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase()

    const decoded = verifyAuthToken(request)
    if (!decoded || decoded.isGuest || decoded.role === 'Guest') {
      return NextResponse.json({ conversations: [] }, { status: 200 })
    }

    const currentUserId = decoded.userId
    const convos = await Conversation.find({
      type: 'direct',
      members: currentUserId,
    }).populate('members', '_id username email avatarUrl')

    return NextResponse.json({ conversations: convos }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching conversations:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase()

    const decoded = verifyAuthToken(request)
    if (!decoded || decoded.isGuest || decoded.role === 'Guest') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const targetUserId = body?.targetUserId || body?.userId

    if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) {
      return NextResponse.json({ error: 'Valid targetUserId is required' }, { status: 400 })
    }

    const currentUserId = decoded.userId
    if (currentUserId === targetUserId) {
      return NextResponse.json({ error: 'Cannot create conversation with yourself' }, { status: 400 })
    }

    let convo = await Conversation.findOne({
      type: 'direct',
      members: { $all: [currentUserId, targetUserId] },
    })

    if (!convo) {
      convo = await Conversation.create({
        type: 'direct',
        members: [currentUserId, targetUserId],
      })
    }

    const targetUser = await User.findById(targetUserId).select('_id username email avatarUrl')

    return NextResponse.json(
      {
        conversation: convo,
        user: targetUser
          ? {
              _id: targetUser._id.toString(),
              id: targetUser._id.toString(),
              name: targetUser.username,
              username: targetUser.username,
              email: targetUser.email,
              avatarUrl: targetUser.avatarUrl || '',
            }
          : null,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error creating conversation:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
