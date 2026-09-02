import { SignJWT, jwtVerify } from 'jose'
import {
  GATE_COOKIE,
  GATE_TTL_SECONDS,
  gateEnabled,
  isGateEndpoint,
  passwordMatches,
  safeRedirect,
} from './src/utils/siteGate.js'
import { gatePage } from './src/gate/gatePage.js'

/**
 * A password over the whole site, enforced before anything is served.
 *
 * This runs at the edge, ahead of the static files, which is the only place it
 * is worth doing. A password screen built inside the React app would be
 * decorative: the bundle containing it has already been downloaded by the time
 * it renders, and anyone can read it, disable JavaScript, or request the asset
 * URLs directly. Here, an unauthenticated request never receives the
 * application at all.
 *
 * It exists so live trading can be tested on the real site without a stranger
 * finding a swap panel whose execution path has never signed a real
 * transaction. It is one shared password, not accounts - it answers "is this
 * site open yet", nothing more.
 *
 * Set SITE_PASSWORD to switch it on. Unset, every request passes straight
 * through, so deploying this changes nothing until the variable exists.
 */

export const config = {
  /*
   * Everything except Vercel's own internals. Assets are deliberately included:
   * the built JavaScript is the application, so leaving /assets open would let
   * anyone reconstruct the site without ever seeing the form.
   */
  matcher: ['/((?!_vercel|_next/static).*)'],
}

const COOKIE_BASE = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${GATE_TTL_SECONDS}`

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) return null
  return new TextEncoder().encode(value)
}

async function hasValidTicket(request) {
  const key = secret()
  if (!key) return false

  /*
   * Split rather than matched. A regex built from a template literal has to
   * escape its own backslashes, and getting that wrong fails in the quiet
   * direction - the cookie is simply never found, so everyone is asked for the
   * password again on every request and the gate looks broken rather than
   * strict.
   */
  const header = request.headers.get('cookie') || ''
  const ticket = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GATE_COOKIE}=`))
    ?.slice(GATE_COOKIE.length + 1)

  if (!ticket) return false

  try {
    await jwtVerify(ticket, key, { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

async function issueTicket() {
  const key = secret()
  if (!key) return null
  return new SignJWT({ gate: 'open' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${GATE_TTL_SECONDS}s`)
    .sign(key)
}

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD

  // Not configured: the site is open, exactly as before this existed.
  if (!gateEnabled(password)) return undefined

  const url = new URL(request.url)

  if (isGateEndpoint(url.pathname)) {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } })
    }

    const form = await request.formData().catch(() => null)
    const supplied = form?.get('password')
    const next = safeRedirect(form?.get('next'))

    if (!passwordMatches(typeof supplied === 'string' ? supplied : '', password)) {
      /*
       * Answered on the form rather than by status code, and deliberately
       * without saying which part was wrong - there is only one field, so any
       * detail is a hint. The delay is a small brake on scripted guessing; it
       * is not a rate limiter and does not pretend to be.
       */
      await new Promise((resolve) => setTimeout(resolve, 600))
      return new Response(gatePage({ next, error: true }), {
        status: 401,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    }

    const ticket = await issueTicket()
    if (!ticket) {
      return new Response(gatePage({ next, misconfigured: true }), {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    }

    return new Response(null, {
      status: 303,
      headers: {
        location: next,
        'set-cookie': `${GATE_COOKIE}=${ticket}; ${COOKIE_BASE}`,
        'cache-control': 'no-store',
      },
    })
  }

  if (await hasValidTicket(request)) return undefined

  /*
   * 401 rather than 200, so the shutter is legible to anything that is not a
   * person - a crawler, a preview scraper, an uptime check - and never cached.
   */
  return new Response(gatePage({ next: url.pathname + url.search }), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
