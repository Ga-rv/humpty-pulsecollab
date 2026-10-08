import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'

const JWT_SECRET = process.env.JWT_SECRET || 'pulse_collab_jwt_secret_fallback'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, username, password } = body

    const identifier = (email || username || '').trim()

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Email/username and password are required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier },
      ],
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    return NextResponse.json(
      {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const err = error as Error
    console.error('Login error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
