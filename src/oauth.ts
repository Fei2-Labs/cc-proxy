import { request as httpsRequest } from 'https'
import { log } from './logger.js'
import { getSetting, setSetting } from './db.js'
import { TOKEN_URL, AUTHORIZE_URL, CLIENT_ID, DEFAULT_SCOPES } from './oauth-constants.js'

export { TOKEN_URL, AUTHORIZE_URL, CLIENT_ID, DEFAULT_SCOPES }

type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

type OAuthStatus = {
  status: 'valid' | 'expired' | 'error' | 'not_configured'
  expiresAt: number | null
}

let cachedTokens: OAuthTokens | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

export async function initOAuth(refreshToken: string): Promise<void> {
  log('info', 'Refreshing OAuth token...')
  cachedTokens = await refreshOAuthToken(refreshToken)
  setSetting('oauth_refresh_token', cachedTokens.refreshToken || refreshToken)
  log('info', `OAuth token acquired, expires at ${new Date(cachedTokens.expiresAt).toISOString()}`)
  scheduleRefresh(cachedTokens.refreshToken || refreshToken)
}

export async function reinitOAuth(refreshToken: string): Promise<void> {
  if (refreshTimer) clearTimeout(refreshTimer)
  setSetting('oauth_refresh_token', refreshToken)
  await initOAuth(refreshToken)
}

export function getOAuthStatus(): OAuthStatus {
  if (!cachedTokens) {
    const stored = getSetting('oauth_refresh_token')
    if (!stored) return { status: 'not_configured', expiresAt: null }
    return { status: 'expired', expiresAt: null }
  }
  if (Date.now() >= cachedTokens.expiresAt) {
    return { status: 'expired', expiresAt: cachedTokens.expiresAt }
  }
  return { status: 'valid', expiresAt: cachedTokens.expiresAt }
}

export function getAccessToken(): string | null {
  if (!cachedTokens) return null
  if (Date.now() >= cachedTokens.expiresAt) {
    log('warn', 'OAuth token expired, waiting for refresh...')
    return null
  }
  return cachedTokens.accessToken
}

function scheduleRefresh(refreshToken: string) {
  if (!cachedTokens) return
  const msUntilExpiry = cachedTokens.expiresAt - Date.now()
  const refreshIn = Math.max(msUntilExpiry - 5 * 60 * 1000, 10_000)
  refreshTimer = setTimeout(async () => {
    try {
      log('info', 'Auto-refreshing OAuth token...')
      cachedTokens = await refreshOAuthToken(cachedTokens?.refreshToken || refreshToken)
      setSetting('oauth_refresh_token', cachedTokens.refreshToken || refreshToken)
      log('info', `OAuth token refreshed, expires at ${new Date(cachedTokens.expiresAt).toISOString()}`)
      scheduleRefresh(cachedTokens.refreshToken || refreshToken)
    } catch (err) {
      log('error', `OAuth refresh failed: ${err}. Retrying in 30s...`)
      setTimeout(() => scheduleRefresh(refreshToken), 30_000)
    }
  }, refreshIn)
}

function refreshOAuthToken(refreshToken: string): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      scope: DEFAULT_SCOPES.join(' '),
    })
    const url = new URL(TOKEN_URL)
    const req = httpsRequest({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        if (res.statusCode !== 200) {
          reject(new Error(`OAuth refresh failed (${res.statusCode}): ${JSON.stringify(data)}`))
          return
        }
        resolve({
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        })
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export function exchangeCodeForTokens(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
    })
    const url = new URL(TOKEN_URL)
    const req = httpsRequest({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        if (res.statusCode !== 200) {
          reject(new Error(`OAuth token exchange failed (${res.statusCode}): ${JSON.stringify(data)}`))
          return
        }
        resolve({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        })
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}
