import { SignJWT, jwtVerify } from 'jose'

/**
 * Session and nonce tokens for wallet sign-in.
 *
 * Both are signed JWTs in httpOnly cookies rather than rows in a database, so
 * sign-in needs no datastore at all.
 *
 * The trade-off is that a nonce cannot be truly consumed. Verification clears
 * the cookie, which stops any normal browser from reusing it, but a caller
 * that replays the original cookie alongside the original signature will be
 * accepted again within the nonce's 10-minute window - there is no server-side
 * record to mark it spent. Exploiting that requires already holding an
 * httpOnly, SameSite=Lax cookie, at which point the session cookie is equally
 * available, so it grants nothing new. Close it properly by recording spent
 * nonces once the database lands with profiles.
 *
 * Never store anything here that isn't already public. The address is; nothing
 * else belongs in a token the browser holds.
 */

export const SESSION_COOKIE = 'pd_session'
export const NONCE_COOKIE = 'pd_nonce'

/*
 * The in-flight X OAuth attempt: its `state`, its PKCE verifier, and the
 * wallet that started it, in one signed token.
 *
 * One cookie rather than three, and signed rather than raw, because the three
 * values are only meaningful together. What the callback has to establish is
 * not "is this state familiar" but "is this the same browser, the same wallet
 * and the same verifier that began this exact attempt" - and a single signed
 * object either answers all of that or fails to verify. Three separate
 * cookies could be mixed and matched.
 */
export const X_OAUTH_COOKIE = 'pd_x_oauth'

const SESSION_TTL = '7d'
const NONCE_TTL = '10m'

/** Long enough to read a consent screen and sign in to X; short enough that a
 *  cookie left on a shared machine is not a standing invitation. */
const X_OAUTH_TTL = '10m'

/** Fail loudly rather than signing with a default nobody changed. */
function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters')
  }
  return new TextEncoder().encode(value)
}

async function sign(payload, ttl) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret())
}

async function read(token) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload
  } catch {
    // Expired, tampered with, or signed by a previous SESSION_SECRET.
    return null
  }
}

export const signSession = (address) => sign({ sub: address.toLowerCase() }, SESSION_TTL)
export const readSession = (token) => read(token)

export const signNonce = (nonce) => sign({ nonce }, NONCE_TTL)
export const readNonce = (token) => read(token)

export const signXOAuth = (payload) => sign(payload, X_OAUTH_TTL)
export const readXOAuth = (token) => read(token)

/** Parse a Cookie header without pulling in a dependency for it. */
export function getCookie(req, name) {
  const header = req.headers?.cookie
  if (!header) return null

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }
  return null
}

/**
 * Build a Set-Cookie value.
 *
 * httpOnly so no script can read the session, SameSite=Lax so it survives a
 * normal navigation but is not sent on cross-site POSTs, and Secure everywhere
 * except local development, where there is no https to attach it to.
 */
export function cookie(name, value, { maxAge, secure = true } = {}) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export const isSecureRequest = (req) =>
  (req.headers['x-forwarded-proto'] || '').includes('https')
