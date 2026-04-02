import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { getUsageByClient } from '../../../../src/db'

const DEFAULT_PRICING = { input: 3, output: 15 }

function estimateCost(inputTokens: number, outputTokens: number, cacheTokens: number): number {
  const p = DEFAULT_PRICING
  return ((inputTokens + cacheTokens) * p.input + outputTokens * p.output) / 1_000_000
}

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const period = (request.nextUrl.searchParams.get('period') || 'week') as 'day' | 'week' | 'month'
  const rollups = getUsageByClient(period)

  const data = rollups.map(r => ({
    ...r,
    estimated_cost_usd: Math.round(estimateCost(r.input_tokens, r.output_tokens, r.cache_read_tokens + r.cache_creation_tokens) * 100) / 100,
  }))

  return NextResponse.json({ period, clients: data })
}
