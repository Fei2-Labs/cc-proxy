import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { queryLogs, getDistinctClients } from '../../../../src/db'

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const filter = {
    client: sp.get('client') || undefined,
    status: (sp.get('status') || undefined) as 'success' | 'error' | 'rate_limited' | undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    limit: sp.get('limit') ? Number(sp.get('limit')) : 50,
    offset: sp.get('offset') ? Number(sp.get('offset')) : 0,
  }

  const result = queryLogs(filter)
  const clients = getDistinctClients()

  return NextResponse.json({ ...result, clients })
}
