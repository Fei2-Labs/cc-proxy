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
