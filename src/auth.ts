import type { IncomingMessage } from 'http'
import { authenticateToken } from './db.js'

export function authenticate(req: IncomingMessage): string | null {
  const authHeader = req.headers['proxy-authorization'] || req.headers['authorization']
  if (!authHeader || typeof authHeader !== 'string') return null

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null

  return authenticateToken(match[1])
}
