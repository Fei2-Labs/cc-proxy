import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { COOKIE_NAME } from '@/lib/auth'
import { setSetting } from '../../../../../src/db'

export async function POST(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const code = randomBytes(16).toString('hex')
  setSetting('oauth_upload_code', code)

  return NextResponse.json({ code })
}
