import { readFileSync } from 'fs'

// Load .env
try {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

import { createServer } from 'http'
import next from 'next'
import { loadConfig } from './src/config.js'
import { setLogLevel, log } from './src/logger.js'
import { initOAuth, reinitOAuth } from './src/oauth.js'
import { createProxyHandler } from './src/proxy.js'
import { initDatabase, getSetting } from './src/db.js'
import { resolve } from 'path'

const dev = process.env.NODE_ENV !== 'production'
const configPath = process.argv[2]

async function main() {
  const config = loadConfig(configPath)
  setLogLevel(config.logging.level)
  log('info', 'CC Gateway starting...')

  // Initialize database
  const dbPath = process.env.PORTAL_DATA_DIR
    ? resolve(process.env.PORTAL_DATA_DIR, 'cc-proxy.db')
    : resolve(process.cwd(), 'data', 'cc-proxy.db')
  initDatabase(dbPath)
  log('info', `Database initialized: ${dbPath}`)

  // Tokens are managed via the portal UI — no config.yaml import

  // Initialize OAuth (SQLite first, config.yaml fallback)
  const storedRefreshToken = getSetting('oauth_refresh_token')
  const refreshToken = storedRefreshToken || config.oauth?.refresh_token

  if (refreshToken) {
    try {
      await initOAuth(refreshToken)
    } catch (err) {
      log('warn', `OAuth init failed: ${err instanceof Error ? err.message : err}. Configure via portal.`)
    }
  } else {
    log('info', 'No OAuth token configured. Use the portal to connect.')
  }

  // Create proxy handler
  const proxyHandler = createProxyHandler(config)

  // Initialize Next.js
  const app = next({ dev, dir: resolve(process.cwd(), 'portal') })
  const nextHandler = app.getRequestHandler()
  await app.prepare()

  // Create unified server
  const port = config.server.port
  const server = createServer((req, res) => {
    const url = req.url || '/'

    // Internal: reinitialize OAuth with stored token
    if (url === '/_reinit-oauth' && req.method === 'POST') {
      const token = getSetting('oauth_refresh_token')
      if (token) {
        reinitOAuth(token).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        }).catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: String(err) }))
        })
        return
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No stored token' }))
      return
    }

    // Portal routes → Next.js
    if (url === '/') {
      res.writeHead(302, { Location: '/portal' })
      res.end()
      return
    }
    if (url.startsWith('/portal') || url.startsWith('/login') || url.startsWith('/api/auth') || url.startsWith('/api/tokens') || url.startsWith('/api/oauth') || url.startsWith('/api/usage') || url.startsWith('/api/logs') || url.startsWith('/_next') || url.startsWith('/favicon')) {
      nextHandler(req, res)
      return
    }

    // Everything else → proxy
    proxyHandler(req, res)
  })

  server.listen(port, () => {
    log('info', `CC Gateway + Portal listening on http://0.0.0.0:${port}`)
    log('info', `Portal: http://localhost:${port}/portal`)
    log('info', `Proxy upstream: ${config.upstream.url}`)
  })
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
