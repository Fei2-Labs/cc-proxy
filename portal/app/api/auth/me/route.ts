import { NextRequest, NextResponse } from 'next/server'
import { verifySession, COOKIE_NAME } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const { valid, email } = await verifySession(token)
  if (!valid) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({ authenticated: true, role: 'admin', email })
}
