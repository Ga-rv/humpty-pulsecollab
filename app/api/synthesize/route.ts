import { NextRequest } from 'next/server'
import { processSynthesisRequest } from '@/lib/synthesis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  return processSynthesisRequest(request)
}

export async function GET(request: NextRequest) {
  return processSynthesisRequest(request)
}
