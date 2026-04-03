import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink } from '../../../../../../src/db'
import { createSession, getSessionCookieConfig } from '@/lib/auth'

const base = () => process.env.PORTAL_URL || 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(`${base()}/login?error=missing_token`)
  }

  const email = verifyMagicLink(token)
  if (!email) {
    return NextResponse.redirect(`${base()}/login?error=invalid_or_expired`)
  }

  const jwt = await createSession(email)
  const response = NextResponse.redirect(`${base()}/portal`)
  response.cookies.set(getSessionCookieConfig(jwt))
  return response
}
