import { SignJWT, jwtVerify } from 'jose'
import { getSetting, setSetting } from '../../src/db'
import { randomBytes, timingSafeEqual } from 'crypto'

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

export async function createSession(): Promise<string> {
  const key = getSigningKey()
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(key)
  return token
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const key = getSigningKey()
    await jwtVerify(token, key, { algorithms: [ALGORITHM] })
    return true
  } catch {
    return false
  }
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  if (input.length !== expected.length) return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  return timingSafeEqual(a, b)
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
