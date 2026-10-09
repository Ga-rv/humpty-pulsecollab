import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongodb'
import { Task } from '@/models/Task'
import { verifyAuthToken } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function loadOwnTask(request: NextRequest, ctx: Ctx) {
  const decoded = verifyAuthToken(request)
  if (!decoded?.userId) {
    return { error: NextResponse.json({ error: 'Sign in to use the tracker' }, { status: 401 }) }
  }

  const { id } = await Promise.resolve(ctx.params)
  if (!id || !mongoose.isValidObjectId(id)) {
    return { error: NextResponse.json({ error: 'Invalid task id' }, { status: 400 }) }
  }

  await connectToDatabase()
  // Only the owner can see / change a task
  const task = await Task.findOne({ _id: id, userId: String(decoded.userId) })
  if (!task) {
    return { error: NextResponse.json({ error: 'Task not found' }, { status: 404 }) }
  }
  return { task }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { task, error } = await loadOwnTask(request, ctx)
    if (error) return error

    let explicitStatus: string | undefined
    try {
      const body = await request.json()
      if (body && (body.status === 'completed' || body.status === 'pending')) {
        explicitStatus = body.status
      }
    } catch {
      // empty body -> toggle
    }

    task!.status = explicitStatus
      ? (explicitStatus as 'pending' | 'completed')
      : task!.status === 'completed'
        ? 'pending'
        : 'completed'
    task!.completedAt = task!.status === 'completed' ? new Date() : null

    await task!.save()
    return NextResponse.json({ task }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error updating task:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { task, error } = await loadOwnTask(request, ctx)
    if (error) return error

    await task!.deleteOne()
    return NextResponse.json({ deleted: true }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error deleting task:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
