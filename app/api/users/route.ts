import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'
import { verifyAuthToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase()

    const decoded = verifyAuthToken(request)
    const filter = decoded ? { _id: { $ne: decoded.userId } } : {}

    const users = await User.find(filter)
      .select('_id username email avatarUrl createdAt')
      .sort({ username: 1 })

    const formattedUsers = users.map((u) => ({
      _id: u._id.toString(),
      id: u._id.toString(),
      name: u.username,
      username: u.username,
      email: u.email,
      avatarUrl: u.avatarUrl || '',
    }))

    return NextResponse.json({ users: formattedUsers }, { status: 200 })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching users:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
