import { NextRequest, NextResponse } from 'next/server'
import { setSetting, getSetting } from '../../../../../src/db'

export async function POST(request: NextRequest) {
  const { token, code } = await request.json()
  if (!token || !code) {
    return NextResponse.json({ error: 'Token and code required' }, { status: 400 })
  }

  const stored = getSetting('oauth_upload_code')
  if (!stored || stored !== code) {
    return NextResponse.json({ error: 'Invalid upload code' }, { status: 401 })
  }

  // Invalidate the code
  setSetting('oauth_upload_code', '')
  setSetting('oauth_refresh_token', token.trim())

  try {
    await fetch(`http://127.0.0.1:${process.env.PORT || 8443}/_reinit-oauth`, { method: 'POST' })
  } catch {}

  return NextResponse.json({ ok: true })
}
