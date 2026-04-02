import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createToken, listTokens } from '../../../../src/db'
import { COOKIE_NAME } from '@/lib/auth'

function requireAuth(request: NextRequest): boolean {
  const token = request.cookies.get(COOKIE_NAME)?.value
  return !!token
}

export async function GET(request: NextRequest) {
  if (!requireAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tokens = listTokens().map(t => ({
    id: t.id,
    name: t.name,
    prefix: t.token_prefix,
    active: t.active === 1,
    lastUsedAt: t.last_used_at,
    createdAt: t.created_at,
  }))

  return NextResponse.json({ tokens })
}

export async function POST(request: NextRequest) {
  if (!requireAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Token name required' }, { status: 400 })
    }

    const rawToken = 'cc_' + randomBytes(32).toString('hex')
    const dbToken = createToken(name.trim(), rawToken)

    return NextResponse.json({
      token: rawToken,
      name: dbToken.name,
      prefix: dbToken.token_prefix,
      createdAt: dbToken.created_at,
    }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Token name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
