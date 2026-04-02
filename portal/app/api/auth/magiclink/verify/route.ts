import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink } from '../../../../../../src/db'
import { createSession, getSessionCookieConfig } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url))
  }

  const email = verifyMagicLink(token)
  if (!email) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', request.url))
  }

  const jwt = await createSession(email)
  const response = NextResponse.redirect(new URL('/portal', request.url))
  response.cookies.set(getSessionCookieConfig(jwt))
  return response
}
