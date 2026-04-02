import { createServer } from 'http'
import next from 'next'
import { loadConfig } from './src/config.js'
import { setLogLevel, log } from './src/logger.js'
import { initOAuth } from './src/oauth.js'
import { createProxyHandler } from './src/proxy.js'
import { initDatabase, importConfigTokens } from './src/db.js'
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

  // Import config.yaml tokens into SQLite on first run
  if (config.auth.tokens.length > 0) {
    const imported = importConfigTokens(config.auth.tokens)
    if (imported > 0) {
      log('info', `Imported ${imported} token(s) from config.yaml`)
    }
  }

  // Initialize OAuth
  await initOAuth(config.oauth.refresh_token)

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

    // Portal routes → Next.js
    if (url.startsWith('/portal') || url.startsWith('/login') || url.startsWith('/api/auth') || url.startsWith('/api/tokens') || url.startsWith('/_next') || url.startsWith('/favicon')) {
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
