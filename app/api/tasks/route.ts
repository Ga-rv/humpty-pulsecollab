import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { Task } from '@/models/Task'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    await connectToDatabase()

    const filter = conversationId ? { conversationId } : {}
    const tasks = await Task.find(filter).sort({ createdAt: -1 })

    return NextResponse.json({ tasks }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching tasks:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, title, assignee, deadline, status } = body

    if (!conversationId || !title) {
      return NextResponse.json(
        { error: 'conversationId and title are required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const task = await Task.create({
      conversationId,
      title: title.trim(),
      assignee: (assignee || 'Unassigned').trim(),
      deadline: (deadline || '').trim(),
      status: status === 'completed' ? 'completed' : 'pending',
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error creating task:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
