import { NextRequest, NextResponse } from 'next/server'
import { request as httpsRequest } from 'https'
import { setSetting } from '../../../../../src/db'
import { TOKEN_URL, CLIENT_ID } from '../../../../../src/oauth-constants'

function exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
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
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        if (res.statusCode !== 200) {
          reject(new Error(`OAuth exchange failed (${res.statusCode}): ${JSON.stringify(data)}`))
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/portal/oauth?error=${encodeURIComponent(error)}`, request.url))
  }
  if (!code) {
    return NextResponse.redirect(new URL('/portal/oauth?error=no_code', request.url))
  }

  const codeVerifier = request.cookies.get('oauth_verifier')?.value
  const redirectUri = request.cookies.get('oauth_redirect_uri')?.value

  if (!codeVerifier || !redirectUri) {
    return NextResponse.redirect(new URL('/portal/oauth?error=session_expired', request.url))
  }

  try {
    const data = await exchangeCode(code, codeVerifier, redirectUri)

    // Store refresh token in SQLite and trigger proxy to reinitialize
    setSetting('oauth_refresh_token', data.refresh_token)
    try {
      await fetch(`http://127.0.0.1:${process.env.PORT || 8443}/_reinit-oauth`, { method: 'POST' })
    } catch {
      // Proxy will pick up the token on next refresh cycle
    }
    const response = NextResponse.redirect(new URL('/portal/oauth?success=true', request.url))
    response.cookies.set({ name: 'oauth_verifier', value: '', maxAge: 0, path: '/' })
    response.cookies.set({ name: 'oauth_redirect_uri', value: '', maxAge: 0, path: '/' })
    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(new URL(`/portal/oauth?error=${encodeURIComponent(msg)}`, request.url))
  }
}
