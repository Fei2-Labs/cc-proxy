import { SignJWT, jwtVerify } from 'jose'
import { getSetting, setSetting } from '../../src/db'
import { randomBytes } from 'crypto'

const COOKIE_NAME = 'cc-session'
const JWT_EXPIRY = '7d'
const ALGORITHM = 'HS256'

function getSigningKey(): Uint8Array {
  let keyHex = getSetting('jwt_signing_key')
  if (!keyHex) {
    keyHex = randomBytes(32).toString('hex')
    setSetting('jwt_signing_key', keyHex)
  }
  return new TextEncoder().encode(keyHex)
}

export function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS || ''
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export function isEmailAllowed(email: string): boolean {
  const allowed = getAllowedEmails()
  return allowed.length === 0 || allowed.includes(email.toLowerCase())
}

export async function createSession(email: string): Promise<string> {
  return new SignJWT({ role: 'admin', email })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSigningKey())
}

export async function verifySession(token: string): Promise<{ valid: boolean; email?: string }> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), { algorithms: [ALGORITHM] })
    return { valid: true, email: payload.email as string }
  } catch {
    return { valid: false }
  }
}

export function getSessionCookieConfig(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
}

export { COOKIE_NAME }
