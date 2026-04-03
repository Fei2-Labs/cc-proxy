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

  setSetting('oauth_upload_code', '')
  setSetting('oauth_refresh_token', token.trim())

  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 8443}/_reinit-oauth`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      console.error('OAuth reinit failed:', data)
      return NextResponse.json({ ok: true, reinit: 'failed', detail: data })
    }
    return NextResponse.json({ ok: true, reinit: 'success' })
  } catch (err) {
    console.error('OAuth reinit error:', err)
    return NextResponse.json({ ok: true, reinit: 'unreachable' })
  }
}
