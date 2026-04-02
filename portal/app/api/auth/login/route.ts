import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSession, getSessionCookieConfig } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ ok: false, error: 'Password required' }, { status: 400 })
    }

    if (!process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: 'Portal not configured' }, { status: 503 })
    }

    if (!verifyPassword(password)) {
      return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 })
    }

    const token = await createSession()
    const response = NextResponse.json({ ok: true })
    const cookieConfig = getSessionCookieConfig(token)
    response.cookies.set(cookieConfig)
    return response
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
