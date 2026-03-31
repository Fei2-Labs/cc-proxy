import { createServer as createHttpsServer, type ServerOptions } from 'https'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync } from 'fs'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import type { Config } from './config.js'
import { authenticate, initAuth } from './auth.js'
import { getAccessToken } from './oauth.js'
import { rewriteBody, rewriteHeaders } from './rewriter.js'
import { audit, log } from './logger.js'

export function startProxy(config: Config) {
  initAuth(config)

  const upstream = new URL(config.upstream.url)
  const useTls = config.server.tls?.cert && config.server.tls?.key

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, config, upstream)
  }

  let server
  if (useTls) {
    const tlsOptions: ServerOptions = {
      cert: readFileSync(config.server.tls.cert),
      key: readFileSync(config.server.tls.key),
    }
    server = createHttpsServer(tlsOptions, handler)
  } else {
    server = createHttpServer(handler)
    log('warn', 'Running without TLS - only use for local development')
  }

  server.listen(config.server.port, () => {
    log('info', `CC Gateway listening on ${useTls ? 'https' : 'http'}://0.0.0.0:${config.server.port}`)
    log('info', `Upstream: ${config.upstream.url}`)
    log('info', `Canonical device_id: ${config.identity.device_id.slice(0, 8)}...`)
    log('info', `Authorized clients: ${config.auth.tokens.map(t => t.name).join(', ')}`)
  })

  return server
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  upstream: URL,
) {
  const method = req.method || 'GET'
  const path = req.url || '/'

  // Authenticate client (proxy-level auth)
  const clientName = authenticate(req)
  if (!clientName) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized - provide Bearer token in Authorization or Proxy-Authorization header' }))
    log('warn', `Unauthorized request: ${method} ${path}`)
    return
  }

  // Get the real OAuth token (managed by gateway)
  const oauthToken = getAccessToken()
  if (!oauthToken) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'OAuth token not available - gateway is refreshing' }))
    log('error', 'No valid OAuth token available')
    return
  }

  // Collect request body
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  let body = Buffer.concat(chunks)

  // Rewrite identity fields in body
  if (body.length > 0) {
    try {
      body = rewriteBody(body, path, config) as Buffer<ArrayBuffer>
    } catch (err) {
      log('error', `Body rewrite failed for ${path}: ${err}`)
    }
  }

  // Rewrite headers (strips client auth, normalizes identity headers)
  const rewrittenHeaders = rewriteHeaders(
    req.headers as Record<string, string | string[] | undefined>,
    config,
  )

  // Inject the real OAuth token (replaces whatever the client sent)
  rewrittenHeaders['authorization'] = `Bearer ${oauthToken}`

  // Forward to upstream
  const upstreamUrl = new URL(path, upstream)

  const proxyReq = httpsRequest(
    upstreamUrl,
    {
      method,
      headers: {
        ...rewrittenHeaders,
        host: upstream.host,
        'content-length': String(body.length),
      },
    },
    (proxyRes) => {
      const status = proxyRes.statusCode || 502

      const responseHeaders = { ...proxyRes.headers }
      delete responseHeaders['transfer-encoding']

      res.writeHead(status, responseHeaders)

      // Stream response directly (SSE for Claude responses)
      proxyRes.pipe(res)

      if (config.logging.audit) {
        audit(clientName, method, path, status)
      }
    },
  )

  proxyReq.on('error', (err) => {
    log('error', `Upstream error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad gateway', detail: err.message }))
    }
    if (config.logging.audit) {
      audit(clientName, method, path, 502)
    }
  })

  proxyReq.write(body)
  proxyReq.end()
}
