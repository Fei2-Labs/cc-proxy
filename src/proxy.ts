import { createServer as createHttpsServer, type ServerOptions } from 'https'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync } from 'fs'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import type { Config } from './config.js'
import { authenticate } from './auth.js'
import { getAccessToken } from './oauth.js'
import { rewriteBody, rewriteHeaders } from './rewriter.js'
import { audit, log } from './logger.js'
import { logRequest, setSetting } from './db.js'

export function createProxyHandler(config: Config) {
  const upstream = new URL(config.upstream.url)
  return (req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, config, upstream)
  }
}

export function startProxy(config: Config) {
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

  // Health check - no auth required
  if (path === '/_health') {
    const oauthOk = !!getAccessToken()
    const status = oauthOk ? 200 : 503
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: oauthOk ? 'ok' : 'degraded',
      oauth: oauthOk ? 'valid' : 'expired/refreshing',
      canonical_device: config.identity.device_id.slice(0, 8) + '...',
      canonical_platform: config.env.platform,
      upstream: config.upstream.url,
      clients: config.auth.tokens.map(t => t.name),
    }))
    return
  }

  // Dry-run verification - shows what would be rewritten (auth required)
  if (path === '/_verify') {
    const clientName = authenticate(req)
    if (!clientName) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    const sample = buildVerificationPayload(config)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(sample, null, 2))
    return
  }

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
  const startTime = Date.now()
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

      const responseChunks: Buffer[] = []

      proxyRes.on('data', (chunk: Buffer) => {
        res.write(chunk)
        responseChunks.push(chunk)
      })

      proxyRes.on('end', () => {
        res.end()
        const latencyMs = Date.now() - startTime

        let model: string | undefined
        let inputTokens: number | undefined
        let outputTokens: number | undefined
        let cacheReadTokens: number | undefined
        let cacheCreationTokens: number | undefined

        try {
          const responseText = Buffer.concat(responseChunks).toString('utf-8')

          // Try SSE format (streaming)
          const lines = responseText.split('\n')
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i]
            if (line.startsWith('data: ') && line.includes('"usage"')) {
              const data = JSON.parse(line.slice(6))
              if (data.usage) {
                inputTokens = data.usage.input_tokens
                outputTokens = data.usage.output_tokens
                cacheReadTokens = data.usage.cache_read_input_tokens
                cacheCreationTokens = data.usage.cache_creation_input_tokens
              }
              if (data.model) model = data.model
              break
            }
            if (line.startsWith('data: ') && line.includes('"model"') && !model) {
              try { const d = JSON.parse(line.slice(6)); if (d.model) model = d.model } catch {}
            }
          }

          // Try JSON format (non-streaming)
          if (!inputTokens) {
            try {
              const json = JSON.parse(responseText)
              if (json.usage) {
                inputTokens = json.usage.input_tokens
                outputTokens = json.usage.output_tokens
                cacheReadTokens = json.usage.cache_read_input_tokens
                cacheCreationTokens = json.usage.cache_creation_input_tokens
              }
              if (json.model) model = json.model
            } catch {}
          }
        } catch {}

        logRequest({
          client_name: clientName, method, path, model,
          input_tokens: inputTokens, output_tokens: outputTokens,
          cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens,
          status, latency_ms: latencyMs,
        })

        // Capture rate limit headers
        const rlHeaders = ['x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']
        for (const h of rlHeaders) {
          const val = proxyRes.headers[h]
          if (val) try { setSetting(`ratelimit_${h}`, String(val)) } catch {}
        }

        if (config.logging.audit) {
          audit(clientName, method, path, status)
        }
      })
    },
  )

  proxyReq.on('error', (err) => {
    log('error', `Upstream error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad gateway', detail: err.message }))
    }
    logRequest({
      client_name: clientName, method, path,
      status: 502, latency_ms: Date.now() - startTime,
    })
    if (config.logging.audit) {
      audit(clientName, method, path, 502)
    }
  })

  proxyReq.write(body)
  proxyReq.end()
}

/**
 * Build a sample payload showing what the rewriter produces.
 * Used by /_verify endpoint for admin validation.
 */
function buildVerificationPayload(config: Config) {
  // Simulate a /v1/messages request body
  const sampleInput = {
    metadata: {
      user_id: JSON.stringify({
        device_id: 'REAL_DEVICE_ID_FROM_CLIENT_abc123',
        account_uuid: 'shared-account-uuid',
        session_id: 'session-xxx',
      }),
    },
    system: [
      {
        type: 'text',
        text: `x-anthropic-billing-header: cc_version=2.1.81.a1b; cc_entrypoint=cli;`,
      },
      {
        type: 'text',
        text: `Here is useful information about the environment:\n<env>\nWorking directory: /home/bob/myproject\nPlatform: linux\nShell: bash\nOS Version: Linux 6.5.0-generic\n</env>`,
      },
    ],
    messages: [{ role: 'user', content: 'hello' }],
  }

  const rewritten = JSON.parse(
    rewriteBody(Buffer.from(JSON.stringify(sampleInput)), '/v1/messages', config).toString('utf-8'),
  )

  return {
    _info: 'This shows how the gateway rewrites a sample request',
    before: {
      'metadata.user_id': JSON.parse(sampleInput.metadata.user_id),
      system_prompt_env: sampleInput.system[1].text,
      billing_header: sampleInput.system[0].text,
    },
    after: {
      'metadata.user_id': JSON.parse(rewritten.metadata.user_id),
      system_prompt_env: rewritten.system[1].text,
      billing_header: rewritten.system[0].text,
    },
  }
}
