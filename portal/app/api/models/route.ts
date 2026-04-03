import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { getSetting, setSetting } from '../../../../../src/db'

const CACHE_KEY = 'cached_models'
const CACHE_TS_KEY = 'cached_models_ts'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

async function fetchModels(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await fetch('http://127.0.0.1:' + (process.env.PORT || 8443) + '/_health')
    const health = await res.json()
    if (health.oauth !== 'valid') throw new Error('OAuth not valid')
  } catch {}

  // Fetch from Anthropic via the proxy
  const port = process.env.PORT || 8443
  const res = await fetch(`http://127.0.0.1:${port}/v1/models?limit=100`, {
    headers: { 'Authorization': 'Bearer internal', 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    // Fallback: try direct
    const direct = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'x-api-key': 'dummy',
        'anthropic-version': '2023-06-01',
      },
    })
    if (!direct.ok) throw new Error('Failed to fetch models')
    const data = await direct.json()
    return parseModels(data)
  }

  return parseModels(await res.json())
}

function parseModels(data: any): { id: string; name: string }[] {
  if (!data?.data) return []
  return data.data
    .filter((m: any) => m.id && !m.id.includes('bedrock') && !m.id.includes('vertex'))
    .map((m: any) => ({ id: m.id, name: m.display_name || m.id }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
}

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = request.nextUrl.searchParams.get('refresh') === '1'
  const cachedTs = getSetting(CACHE_TS_KEY)
  const cached = getSetting(CACHE_KEY)

  if (!force && cached && cachedTs && Date.now() - Number(cachedTs) < CACHE_TTL) {
    return NextResponse.json({ models: JSON.parse(cached), cached: true })
  }

  try {
    const models = await fetchModels()
    if (models.length > 0) {
      setSetting(CACHE_KEY, JSON.stringify(models))
      setSetting(CACHE_TS_KEY, String(Date.now()))
      return NextResponse.json({ models, cached: false })
    }
  } catch {}

  // Return cache or fallback
  if (cached) {
    return NextResponse.json({ models: JSON.parse(cached), cached: true })
  }

  const fallback = [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ]
  return NextResponse.json({ models: fallback, cached: false })
}
