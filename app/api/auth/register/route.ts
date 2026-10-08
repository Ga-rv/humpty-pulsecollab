import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { connectToDatabase } from '@/lib/mongodb'
import { User } from '@/models/User'

const JWT_SECRET = process.env.JWT_SECRET || 'pulse_collab_jwt_secret_fallback'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, email, password, avatarUrl } = body

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Username, email, and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const normalizedEmail = email.toLowerCase().trim()
    const trimmedUsername = username.trim()

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: trimmedUsername }],
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email or username already exists' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await User.create({
      username: trimmedUsername,
      email: normalizedEmail,
      passwordHash,
      avatarUrl: avatarUrl || '',
    })

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
      { status: 201 }
    )
  } catch (error: unknown) {
    const err = error as Error
    console.error('Registration error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
