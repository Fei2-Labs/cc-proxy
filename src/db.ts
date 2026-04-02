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
  if (!db) throw new Error('Database not initialized — call initDatabase() first')
  return db
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
