import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { Task } from '@/models/Task'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const task = await Task.findById(id)
    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    let explicitStatus: string | undefined
    try {
      const body = await request.json()
      if (body && (body.status === 'completed' || body.status === 'pending')) {
        explicitStatus = body.status
      }
    } catch {
      // Body may be empty if client simply wants a toggle
    }

    task.status = explicitStatus
      ? (explicitStatus as 'pending' | 'completed')
      : task.status === 'completed'
      ? 'pending'
      : 'completed'

    await task.save()

    return NextResponse.json({ task }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error updating task:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
