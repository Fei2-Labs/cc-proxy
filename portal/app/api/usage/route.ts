import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { getUsageByClient, getUsageByModel } from '../../../../src/db'

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}
const DEFAULT_PRICING = { input: 3, output: 15 }

function estimateCost(inputTokens: number, outputTokens: number, cacheTokens: number, model?: string): number {
  const p = (model && MODEL_PRICING[model]) || DEFAULT_PRICING
  return ((inputTokens + cacheTokens) * p.input + outputTokens * p.output) / 1_000_000
}

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const period = (request.nextUrl.searchParams.get('period') || 'week') as 'day' | 'week' | 'month'
  const rollups = getUsageByClient(period)
  const models = getUsageByModel(period)

  const clientData = rollups.map(r => ({
    ...r,
    estimated_cost_usd: Math.round(estimateCost(r.input_tokens, r.output_tokens, r.cache_read_tokens + r.cache_creation_tokens) * 100) / 100,
  }))

  const modelData = models.map(m => ({
    ...m,
    estimated_cost_usd: Math.round(estimateCost(m.input_tokens, m.output_tokens, m.cache_read_tokens + m.cache_creation_tokens, m.model) * 100) / 100,
  }))

  return NextResponse.json({ period, clients: clientData, models: modelData })
}
