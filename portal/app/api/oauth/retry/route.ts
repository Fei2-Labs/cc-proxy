import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 8443}/_reinit-oauth`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data.error || 'Refresh failed — the token may be revoked. Run "claude" to login again, then re-extract.' })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not reach proxy' })
  }
}
