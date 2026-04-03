import { createServer as createHttpsServer, type ServerOptions } from 'https'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync } from 'fs'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import type { Config } from './config.js'
import { authenticate } from './auth.js'
import { getAccessToken } from './oauth.js'
import { rewriteBody, rewriteHeaders } from './rewriter.js'
import { isOpenAIRequest, handleModelsRequest, openaiToAnthropic, anthropicToOpenai, anthropicErrorToOpenai, translateSSEChunk } from './openai-compat.js'
import { audit, log } from './logger.js'
import { logRequest, setSetting } from './db.js'
import { checkRateLimit } from './rate-limit.js'
import xxhash from 'xxhash-wasm'

const CCH_SEED = BigInt('0x6E52736AC806831E')
let xxh64fn: ((input: Uint8Array, seed: bigint) => bigint) | null = null

xxhash().then(h => { xxh64fn = h.h64Raw }).catch(() => {})

function computeCch(body: Buffer): string {
  if (!xxh64fn) return '00000'
  const hash = xxh64fn(new Uint8Array(body), CCH_SEED)
  return (hash & BigInt(0xFFFFF)).toString(16).padStart(5, '0')
}

const MODEL_FALLBACKS: Record<string, string[]> = (() => {
  const env = process.env.MODEL_FALLBACKS
  if (env) {
    try { return JSON.parse(env) } catch {}
  }
  return {
    'claude-sonnet-4-6': ['claude-haiku-4-5-20251001'],
    'claude-opus-4-6': ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  }
})()

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
  let path = req.url || '/'

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

  // OpenAI-compatible /v1/models endpoint
  if (path === '/v1/models') {
    handleModelsRequest(res)
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

  // Rate limit to prevent unnatural usage patterns across shared identity
  if (!checkRateLimit(path)) {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Rate limited - too many requests per minute' }))
    log('warn', `Rate limited ${clientName}: ${method} ${path}`)
    return
  }

  // Collect request body
  const startTime = Date.now()
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  let body = Buffer.concat(chunks)

  // OpenAI Chat Completions → Anthropic Messages translation
  const isOpenAI = path === '/v1/chat/completions'
  let openaiModel = ''
  let isOpenAIStream = false
  if (isOpenAI && body.length > 0) {
    try {
      const parsed = JSON.parse(body.toString('utf-8'))
      openaiModel = parsed.model || ''
      isOpenAIStream = !!parsed.stream
      const anthropicBody = openaiToAnthropic(parsed)
      body = Buffer.from(JSON.stringify(anthropicBody), 'utf-8')
      path = '/v1/messages'
    } catch (err) {
      log('error', `OpenAI translation failed: ${err}`)
    }
  }

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
  // Required for OAuth tokens to work on /v1/messages
  rewrittenHeaders['anthropic-beta'] = rewrittenHeaders['anthropic-beta']
    ? rewrittenHeaders['anthropic-beta'] + ',oauth-2025-04-20'
    : 'oauth-2025-04-20'
  if (!rewrittenHeaders['anthropic-version']) {
    rewrittenHeaders['anthropic-version'] = '2023-06-01'
  }

  // Ensure billing header exists with valid fingerprint and cch attestation
  if (!rewrittenHeaders['x-anthropic-billing-header']) {
    let fp = '000'
    try {
      const parsed = JSON.parse(body.toString('utf-8'))
      if (Array.isArray(parsed.messages)) {
        for (const m of parsed.messages) {
          if (m.role === 'user') {
            const txt = typeof m.content === 'string' ? m.content : m.content?.[0]?.text || ''
            const { createHash } = await import('crypto')
            const salt = '59cf53e54c78'
            fp = createHash('sha256').update(salt + (txt[4]||'') + (txt[7]||'') + (txt[20]||'') + config.env.version).digest('hex').slice(0, 3)
            break
          }
        }
      }
    } catch {}
    rewrittenHeaders['x-anthropic-billing-header'] = `cc_version=${config.env.version}.${fp}; cc_entrypoint=cli;`
  }

  // Compute cch attestation on the final body (with cch placeholder first)
  {
    const billingKey = Object.keys(rewrittenHeaders).find(k => k.toLowerCase() === 'x-anthropic-billing-header') || 'x-anthropic-billing-header'
    let billing = rewrittenHeaders[billingKey] || ''
    // Remove existing cch, add placeholder for hash computation
    billing = billing.replace(/\s*cch=[a-f0-9]+;?/g, '')
    billing = billing.replace(/;\s*$/, '') + '; cch=00000;'
    rewrittenHeaders[billingKey] = billing

    // Also inject cch placeholder into body's system prompt billing header
    const bodyStr = body.toString('utf-8')
    const bodyWithPlaceholder = bodyStr.replace(
      /(x-anthropic-billing-header:[^"]*?)(?:;\s*cch=[a-f0-9]+)?;?\s*(?=")/g,
      '$1; cch=00000;'
    )
    const bodyBuf = Buffer.from(bodyWithPlaceholder, 'utf-8')
    const cch = computeCch(bodyBuf)

    // Replace placeholder with real cch
    rewrittenHeaders[billingKey] = rewrittenHeaders[billingKey].replace('cch=00000', `cch=${cch}`)
    body = Buffer.from(bodyWithPlaceholder.replace('cch=00000', `cch=${cch}`), 'utf-8')
  }

  // Forward to upstream (with model fallback on 429)
  const upstreamUrl = new URL(path, upstream)
  const isMessages = path.startsWith('/v1/messages')

  let requestModel: string | undefined
  if (isMessages) {
    try { requestModel = JSON.parse(body.toString('utf-8')).model } catch {}
  }

  type UpstreamResult = { status: number; headers: Record<string, any>; body: Buffer }

  const sendUpstream = (finalBody: Buffer): Promise<UpstreamResult> => new Promise((resolve, reject) => {
    const proxyReq = httpsRequest(upstreamUrl, {
      method,
      headers: { ...rewrittenHeaders, host: upstream.host, 'content-length': String(finalBody.length) },
    }, (proxyRes) => {
      const chunks: Buffer[] = []
      proxyRes.on('data', (c: Buffer) => chunks.push(c))
      proxyRes.on('end', () => resolve({
        status: proxyRes.statusCode || 502,
        headers: { ...proxyRes.headers },
        body: Buffer.concat(chunks),
      }))
    })
    proxyReq.on('error', reject)
    proxyReq.write(finalBody)
    proxyReq.end()
  })

  // Streaming path for OpenAI-compatible requests
  if (isOpenAI && isOpenAIStream) {
    const proxyReq = httpsRequest(upstreamUrl, {
      method,
      headers: { ...rewrittenHeaders, host: upstream.host, 'content-length': String(body.length) },
    }, (proxyRes) => {
      const status = proxyRes.statusCode || 502
      if (status !== 200) {
        // Buffer error response and translate
        const errChunks: Buffer[] = []
        proxyRes.on('data', (c: Buffer) => errChunks.push(c))
        proxyRes.on('end', () => {
          let errBody: any
          try { errBody = JSON.parse(Buffer.concat(errChunks).toString('utf-8')) } catch { errBody = {} }
          const translated = anthropicErrorToOpenai(status, errBody)
          const buf = Buffer.from(JSON.stringify(translated), 'utf-8')
          res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(buf.length) })
          res.end(buf)
          logRequest({ client_name: clientName, method, path, status, latency_ms: Date.now() - startTime })
        })
        return
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        'x-proxy-translated': 'openai-stream',
      })

      let buffer = ''
      let streamModel = openaiModel
      let inputTokens: number | undefined
      let outputTokens: number | undefined

      proxyRes.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8')
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // keep incomplete line

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const data = JSON.parse(raw)
              if (data.message?.model) streamModel = data.message.model
              if (data.usage) {
                inputTokens = data.usage.input_tokens
                outputTokens = data.usage.output_tokens
              }
              const translated = translateSSEChunk(currentEvent, data, streamModel)
              if (translated) res.write(translated)
            } catch {}
          }
        }
      })

      proxyRes.on('end', () => {
        if (!res.writableEnded) res.end()
        logRequest({
          client_name: clientName, method, path, model: streamModel,
          input_tokens: inputTokens, output_tokens: outputTokens,
          status: 200, latency_ms: Date.now() - startTime,
        })
        if (config.logging.audit) audit(clientName, method, path, 200)
      })
    })

    proxyReq.on('error', (err) => {
      log('error', `Upstream stream error: ${err.message}`)
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Bad gateway', detail: err.message }))
      }
      logRequest({ client_name: clientName, method, path, status: 502, latency_ms: Date.now() - startTime })
    })

    proxyReq.write(body)
    proxyReq.end()
    return
  }

  // Non-streaming path (original behavior)

  let result: UpstreamResult
  let fallbackUsed: string | null = null
  try {
    result = await sendUpstream(body)

    // On 429 rate limit, try fallback models
    if (result.status === 429 && isMessages && requestModel) {
      const fallbacks = MODEL_FALLBACKS[requestModel] || []
      for (const fb of fallbacks) {
        log('info', `Model ${requestModel} rate-limited, falling back to ${fb}`)
        const parsed = JSON.parse(body.toString('utf-8'))
        parsed.model = fb
        const fbBody = Buffer.from(JSON.stringify(parsed), 'utf-8')
        result = await sendUpstream(fbBody)
        if (result.status !== 429) { fallbackUsed = fb; break }
      }
    }
  } catch (err: any) {
    log('error', `Upstream error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad gateway', detail: err.message }))
    }
    logRequest({ client_name: clientName, method, path, status: 502, latency_ms: Date.now() - startTime })
    if (config.logging.audit) audit(clientName, method, path, 502)
    return
  }

  // Inject fallback info into response
  if (fallbackUsed && result.status === 200) {
    try {
      const json = JSON.parse(result.body.toString('utf-8'))
      json._fallback = { original_model: requestModel, used_model: fallbackUsed, reason: 'rate_limit' }
      result.body = Buffer.from(JSON.stringify(json), 'utf-8')
    } catch {}
    result.headers['x-model-fallback'] = `${requestModel} -> ${fallbackUsed}`
    log('info', `Fallback: ${requestModel} -> ${fallbackUsed} for ${clientName}`)
  }

  // Send response to client
  delete result.headers['transfer-encoding']
  if (isOpenAI && result.status === 200) {
    try {
      const anthropicRes = JSON.parse(result.body.toString('utf-8'))
      const openaiRes = anthropicToOpenai(anthropicRes, openaiModel)
      const translated = Buffer.from(JSON.stringify(openaiRes), 'utf-8')
      result.body = translated
      result.headers['content-length'] = String(translated.length)
      result.headers['x-proxy-translated'] = 'openai'
    } catch (err: any) {
      result.headers['x-proxy-translation-error'] = err?.message || 'unknown'
    }
  }
  if (isOpenAI && result.status !== 200) {
    try {
      const errBody = JSON.parse(result.body.toString('utf-8'))
      const translated = Buffer.from(JSON.stringify(anthropicErrorToOpenai(result.status, errBody)), 'utf-8')
      result.body = translated
      result.headers['content-length'] = String(translated.length)
    } catch {}
  }
  res.writeHead(result.status, result.headers)
  res.end(result.body)

  // Log
  const latencyMs = Date.now() - startTime
  let model: string | undefined
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  let cacheReadTokens: number | undefined
  let cacheCreationTokens: number | undefined

  try {
    const responseText = result.body.toString('utf-8')
    const lines = responseText.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (line.startsWith('data: ') && line.includes('"usage"')) {
        const data = JSON.parse(line.slice(6))
        if (data.usage) { inputTokens = data.usage.input_tokens; outputTokens = data.usage.output_tokens; cacheReadTokens = data.usage.cache_read_input_tokens; cacheCreationTokens = data.usage.cache_creation_input_tokens }
        if (data.model) model = data.model
        break
      }
      if (line.startsWith('data: ') && line.includes('"model"') && !model) {
        try { const d = JSON.parse(line.slice(6)); if (d.model) model = d.model } catch {}
      }
    }
    if (!inputTokens) {
      try {
        const json = JSON.parse(responseText)
        if (json.usage) { inputTokens = json.usage.input_tokens; outputTokens = json.usage.output_tokens; cacheReadTokens = json.usage.cache_read_input_tokens; cacheCreationTokens = json.usage.cache_creation_input_tokens }
        if (json.model) model = json.model
      } catch {}
    }
  } catch {}

  logRequest({ client_name: clientName, method, path, model: fallbackUsed ? `${requestModel} → ${model || fallbackUsed}` : model, input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, status: result.status, latency_ms: latencyMs })

  const rlHeaders = ['x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']
  for (const h of rlHeaders) { const val = result.headers[h]; if (val) try { setSetting(`ratelimit_${h}`, String(val)) } catch {} }

  if (config.logging.audit) audit(clientName, method, path, result.status)
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
