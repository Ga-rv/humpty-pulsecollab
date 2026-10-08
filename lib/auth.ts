import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'pulse_collab_jwt_secret_fallback'

export interface DecodedUser {
  userId: string
  username: string
  email: string
}

export function verifyAuthToken(request: NextRequest): DecodedUser | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim()

  if (!token) return null

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedUser
    return decoded
  } catch (err) {
    return null
  }
}
