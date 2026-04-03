import type { IncomingMessage } from 'http'
import { authenticateToken } from './db.js'

export function authenticate(req: IncomingMessage): string | null {
  // Support: Authorization: Bearer, Proxy-Authorization: Bearer, x-api-key
  const authHeader = req.headers['proxy-authorization'] || req.headers['authorization']
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match) return authenticateToken(match[1])
  }

  const apiKey = req.headers['x-api-key']
  if (apiKey && typeof apiKey === 'string') return authenticateToken(apiKey)

  return null
}
