import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { setSetting } from '../../../../../src/db'

export async function POST(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { token } = await request.json()
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  setSetting('oauth_refresh_token', token.trim())

  try {
    await fetch(`http://127.0.0.1:${process.env.PORT || 8443}/_reinit-oauth`, { method: 'POST' })
  } catch {}

  return NextResponse.json({ ok: true })
}
