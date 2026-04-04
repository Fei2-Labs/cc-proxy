import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { getSetting } from '../../../../../src/db'

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keys = ['x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']
  const limits: Record<string, string | undefined> = {}
  for (const k of keys) {
    limits[k] = getSetting(`ratelimit_${k}`)
  }

  // Unified subscription rate limit headers
  const unifiedKeys = [
    'anthropic-ratelimit-unified-status',
    'anthropic-ratelimit-unified-reset',
    'anthropic-ratelimit-unified-representative-claim',
    'anthropic-ratelimit-unified-5h-status',
    'anthropic-ratelimit-unified-5h-reset',
    'anthropic-ratelimit-unified-5h-utilization',
    'anthropic-ratelimit-unified-7d-status',
    'anthropic-ratelimit-unified-7d-reset',
    'anthropic-ratelimit-unified-7d-utilization',
    'anthropic-ratelimit-unified-fallback',
    'anthropic-ratelimit-unified-fallback-percentage',
  ]
  const unified: Record<string, string | undefined> = {}
  for (const k of unifiedKeys) {
    unified[k] = getSetting(`ratelimit_${k}`)
  }

  return NextResponse.json({ limits, unified })
}
