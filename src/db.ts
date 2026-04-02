import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { createHash } from 'crypto'

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_creation_tokens INTEGER,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_client ON request_logs(client_name);
CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at);

CREATE TABLE IF NOT EXISTS magic_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

export type DbToken = {
  id: number
  name: string
  token_hash: string
  token_prefix: string
  active: number
  last_used_at: string | null
  created_at: string
}

export function initDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    const { resolve } = require('path') as typeof import('path')
    const dbPath = process.env.PORTAL_DATA_DIR
      ? resolve(process.env.PORTAL_DATA_DIR, 'cc-proxy.db')
      : resolve(process.cwd(), 'data', 'cc-proxy.db')
    initDatabase(dbPath)
  }
  return db!
}

export function getSetting(key: string): string | undefined {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getDatabase().prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createToken(name: string, token: string): DbToken {
  const token_hash = hashToken(token)
  const token_prefix = token.slice(0, 8)
  getDatabase().prepare(
    'INSERT INTO tokens (name, token_hash, token_prefix) VALUES (?, ?, ?)'
  ).run(name, token_hash, token_prefix)
  return getDatabase().prepare('SELECT * FROM tokens WHERE name = ?').get(name) as DbToken
}

export function listTokens(): DbToken[] {
  return getDatabase().prepare('SELECT * FROM tokens ORDER BY created_at DESC').all() as DbToken[]
}

export function authenticateToken(rawToken: string): string | null {
  const hash = hashToken(rawToken)
  const row = getDatabase().prepare(
    'SELECT name FROM tokens WHERE token_hash = ? AND active = 1'
  ).get(hash) as { name: string } | undefined
  if (row) {
    getDatabase().prepare(
      "UPDATE tokens SET last_used_at = datetime('now') WHERE token_hash = ?"
    ).run(hash)
    return row.name
  }
  return null
}

export function importConfigTokens(tokens: Array<{ name: string; token: string }>): number {
  let imported = 0
  const existing = listTokens()
  const existingNames = new Set(existing.map(t => t.name))
  for (const t of tokens) {
    if (!existingNames.has(t.name)) {
      createToken(t.name, t.token)
      imported++
    }
  }
  return imported
}

export type RequestLog = {
  client_name: string
  method: string
  path: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_creation_tokens?: number
  status: number
  latency_ms: number
}

export function logRequest(entry: RequestLog): void {
  try {
    getDatabase().prepare(
      `INSERT INTO request_logs (client_name, method, path, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, status, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.client_name, entry.method, entry.path,
      entry.model ?? null, entry.input_tokens ?? null, entry.output_tokens ?? null,
      entry.cache_read_tokens ?? null, entry.cache_creation_tokens ?? null,
      entry.status, entry.latency_ms
    )
  } catch {
    // Never let logging failures affect proxy
  }
}

export type UsageRollup = {
  client_name: string
  total_requests: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  avg_latency_ms: number
}

export function getUsageByClient(period: 'day' | 'week' | 'month'): UsageRollup[] {
  const since = period === 'day' ? '-1 day' : period === 'week' ? '-7 days' : '-30 days'
  return getDatabase().prepare(`
    SELECT client_name,
      COUNT(*) as total_requests,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
      CAST(AVG(latency_ms) AS INTEGER) as avg_latency_ms
    FROM request_logs
    WHERE created_at >= datetime('now', ?)
    GROUP BY client_name
    ORDER BY input_tokens DESC
  `).all(since) as UsageRollup[]
}

export type LogEntry = {
  id: number
  client_name: string
  method: string
  path: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_creation_tokens: number | null
  status: number
  latency_ms: number
  created_at: string
}

export type LogFilter = {
  client?: string
  status?: 'success' | 'error' | 'rate_limited'
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export function queryLogs(filter: LogFilter): { logs: LogEntry[]; total: number } {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filter.client) {
    conditions.push('client_name = ?')
    params.push(filter.client)
  }
  if (filter.status === 'success') {
    conditions.push('status >= 200 AND status < 300')
  } else if (filter.status === 'error') {
    conditions.push('status >= 400 AND status != 429')
  } else if (filter.status === 'rate_limited') {
    conditions.push('status = 429')
  }
  if (filter.from) {
    conditions.push('created_at >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    conditions.push('created_at <= ?')
    params.push(filter.to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = filter.limit || 50
  const offset = filter.offset || 0

  const total = (getDatabase().prepare(`SELECT COUNT(*) as count FROM request_logs ${where}`).get(...params) as { count: number }).count
  const logs = getDatabase().prepare(`SELECT * FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as LogEntry[]

  return { logs, total }
}

export function getDistinctClients(): string[] {
  return (getDatabase().prepare('SELECT DISTINCT client_name FROM request_logs ORDER BY client_name').all() as { client_name: string }[]).map(r => r.client_name)
}

export function createMagicLink(email: string, token: string, ttlMinutes = 15): void {
  const token_hash = hashToken(token)
  // Clean up expired/used links for this email
  getDatabase().prepare("DELETE FROM magic_links WHERE email = ? OR expires_at < datetime('now')").run(email)
  getDatabase().prepare(
    `INSERT INTO magic_links (email, token_hash, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))`
  ).run(email, token_hash, ttlMinutes)
}

export function verifyMagicLink(token: string): string | null {
  const token_hash = hashToken(token)
  const row = getDatabase().prepare(
    "SELECT email FROM magic_links WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')"
  ).get(token_hash) as { email: string } | undefined
  if (row) {
    getDatabase().prepare("UPDATE magic_links SET used = 1 WHERE token_hash = ?").run(token_hash)
    return row.email
  }
  return null
}
