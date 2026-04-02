import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { getSetting } from '../../../../../src/db'

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check OAuth status without importing src/oauth.ts (which has .js imports Turbopack can't resolve)
  // We read the stored token and check if the proxy has a valid access token via the health endpoint
  const storedToken = getSetting('oauth_refresh_token')
  if (!storedToken) {
    return NextResponse.json({ status: 'not_configured', expiresAt: null })
  }

  // Use internal health check to determine actual OAuth status
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 8443}/_health`)
    if (res.ok) {
      const health = await res.json()
      if (health.oauth === 'valid') {
        return NextResponse.json({ status: 'valid', expiresAt: null })
      }
    }
  } catch {
    // Health check failed, fall through
  }

  return NextResponse.json({ status: 'expired', expiresAt: null })
}
