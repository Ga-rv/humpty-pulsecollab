import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'
import { DirectMessage } from '@/models/DirectMessage'
import { Conversation } from '@/models/Conversation'
import { verifyAuthToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase()

    const decoded = verifyAuthToken(request)
    if (!decoded || decoded.isGuest || decoded.role === 'Guest') {
      return NextResponse.json({ users: [] }, { status: 200 })
    }

    const { searchParams } = new URL(request.url)
    const isAll = searchParams.get('all') === 'true'

    // If ?all=true is passed, return all registered users (for the New Chat modal)
    if (isAll) {
      const allUsers = await User.find({ _id: { $ne: decoded.userId } })
        .select('_id username email avatarUrl createdAt')
        .sort({ username: 1 })

      const formattedAll = allUsers.map((u) => ({
        _id: u._id.toString(),
        id: u._id.toString(),
        name: u.username,
        username: u.username,
        email: u.email,
        avatarUrl: u.avatarUrl || '',
      }))

      return NextResponse.json({ users: formattedAll }, { status: 200 })
    }

    // Default: Fetch ONLY users where an active conversation or DirectMessage thread already exists
    const currentUserId = decoded.userId
    const partnerIds = new Set<string>()

    if (mongoose.isValidObjectId(currentUserId)) {
      // 1. Query DirectMessage collection for threads where current user participated
      const dms = await DirectMessage.find({
        $or: [{ senderId: currentUserId }, { recipientId: currentUserId }],
      }).select('senderId recipientId')

      for (const dm of dms) {
        const sender = dm.senderId.toString()
        const recipient = dm.recipientId.toString()
        if (sender === currentUserId && recipient !== currentUserId) {
          partnerIds.add(recipient)
        } else if (recipient === currentUserId && sender !== currentUserId) {
          partnerIds.add(sender)
        }
      }

      // 2. Query Conversation collection for initiated direct threads
      const convos = await Conversation.find({
        type: 'direct',
        members: currentUserId,
      }).select('members')

      for (const convo of convos) {
        if (Array.isArray(convo.members)) {
          for (const member of convo.members) {
            const memberId = member.toString()
            if (memberId !== currentUserId) {
              partnerIds.add(memberId)
            }
          }
        }
      }
    }

    if (partnerIds.size === 0) {
      return NextResponse.json({ users: [] }, { status: 200 })
    }

    const activeUsers = await User.find({
      _id: { $in: Array.from(partnerIds) },
    })
      .select('_id username email avatarUrl createdAt')
      .sort({ username: 1 })

    const formattedActiveUsers = activeUsers.map((u) => ({
      _id: u._id.toString(),
      id: u._id.toString(),
      name: u.username,
      username: u.username,
      email: u.email,
      avatarUrl: u.avatarUrl || '',
    }))

    return NextResponse.json({ users: formattedActiveUsers }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching users:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
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
      return NextResponse.json({ error: 'Cannot initiate DM with yourself' }, { status: 400 })
    }

    // Persist or find active direct conversation in MongoDB
    const existing = await Conversation.findOne({
      type: 'direct',
      members: { $all: [currentUserId, targetUserId] },
    })

    if (!existing) {
      await Conversation.create({
        type: 'direct',
        members: [currentUserId, targetUserId],
      })
    }

    const targetUser = await User.findById(targetUserId).select('_id username email avatarUrl')
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const formattedUser = {
      _id: targetUser._id.toString(),
      id: targetUser._id.toString(),
      name: targetUser.username,
      username: targetUser.username,
      email: targetUser.email,
      avatarUrl: targetUser.avatarUrl || '',
    }

    return NextResponse.json({ user: formattedUser, success: true }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error initiating conversation:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
