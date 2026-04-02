import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { COOKIE_NAME } from '@/lib/auth'
import { AUTHORIZE_URL, CLIENT_ID, DEFAULT_SCOPES } from '../../../../../src/oauth-constants'

export async function POST(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  const origin = request.headers.get('origin') || request.nextUrl.origin
  const redirectUri = `${origin}/api/oauth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: DEFAULT_SCOPES.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: randomBytes(16).toString('hex'),
  })

  const response = NextResponse.json({ url: `${AUTHORIZE_URL}?${params.toString()}` })
  response.cookies.set({
    name: 'oauth_verifier',
    value: codeVerifier,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  response.cookies.set({
    name: 'oauth_redirect_uri',
    value: redirectUri,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
