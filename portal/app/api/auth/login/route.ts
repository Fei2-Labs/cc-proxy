import { NextResponse } from 'next/server'

// Password login removed — use magic link at /api/auth/magiclink/send
export async function POST() {
  return NextResponse.json({ error: 'Use magic link login' }, { status: 410 })
}
