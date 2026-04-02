import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createMagicLink } from '../../../../../../src/db'
import { isEmailAllowed } from '@/lib/auth'
import { sendMagicLinkEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    if (!isEmailAllowed(normalized)) {
      // Don't reveal whether email is allowed — always return success
      return NextResponse.json({ ok: true })
    }

    const token = randomBytes(32).toString('hex')
    createMagicLink(normalized, token)

    const base = process.env.PORTAL_URL || request.nextUrl.origin
    const url = `${base}/api/auth/magiclink/verify?token=${token}`
    await sendMagicLinkEmail(normalized, url)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Magic link send error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
