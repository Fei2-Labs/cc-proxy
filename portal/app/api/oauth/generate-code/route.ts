import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { COOKIE_NAME } from '@/lib/auth'
import { setSetting } from '../../../../../src/db'

export async function POST(request: NextRequest) {
  // Allow from portal session OR menubar app with admin password
  const hasSession = !!request.cookies.get(COOKIE_NAME)?.value
  const apiKey = request.headers.get('x-api-key')
  const validKey = apiKey && process.env.ADMIN_PASSWORD && apiKey === process.env.ADMIN_PASSWORD

  if (!hasSession && !validKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const code = randomBytes(16).toString('hex')
  setSetting('oauth_upload_code', code)

  return NextResponse.json({ code })
}
