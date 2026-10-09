import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { Task } from '@/models/Task'
import { verifyAuthToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const unauthorized = () =>
  NextResponse.json({ error: 'Sign in to use the tracker' }, { status: 401 })

/** All tasks belonging to the signed-in user, across every room and DM. */
export async function GET(request: NextRequest) {
  try {
    const decoded = verifyAuthToken(request)
    if (!decoded?.userId) return unauthorized()

    await connectToDatabase()
    const tasks = await Task.find({ userId: String(decoded.userId) }).sort({ createdAt: -1 })

    return NextResponse.json({ tasks }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching tasks:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = verifyAuthToken(request)
    if (!decoded?.userId) return unauthorized()
    const userId = String(decoded.userId)

    const body = await request.json()
    const { conversationId, title, assignee, deadline, sourceKey } = body

    if (!conversationId || !title) {
      return NextResponse.json({ error: 'conversationId and title are required' }, { status: 400 })
    }

    await connectToDatabase()

    const cleanKey = typeof sourceKey === 'string' ? sourceKey.trim().slice(0, 400) : ''

    // Same deadline / action item already in this user's tracker -> return it, don't duplicate
    if (cleanKey) {
      const existing = await Task.findOne({ userId, sourceKey: cleanKey })
      if (existing) {
        return NextResponse.json({ task: existing, existing: true }, { status: 200 })
      }
    }

    const task = await Task.create({
      userId,
      conversationId,
      sourceKey: cleanKey,
      title: String(title).trim(),
      assignee: String(assignee || 'Unassigned').trim(),
      deadline: String(deadline || '').trim(),
      status: 'pending',
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error creating task:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/tasks?completed=true  -> clears the user's completed tasks. */
export async function DELETE(request: NextRequest) {
  try {
    const decoded = verifyAuthToken(request)
    if (!decoded?.userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    if (searchParams.get('completed') !== 'true') {
      return NextResponse.json({ error: 'Use ?completed=true or DELETE /api/tasks/:id' }, { status: 400 })
    }

    await connectToDatabase()
    const result = await Task.deleteMany({ userId: String(decoded.userId), status: 'completed' })

    return NextResponse.json({ deleted: result.deletedCount ?? 0 }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error clearing completed tasks:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
