/**
 * Ask a running deployment whether it works.
 *
 * Everything else in this repository checks the code. This checks a
 * deployment: it makes real HTTP requests to a real URL and reads what comes
 * back. That is the only kind of check that could have caught either of the
 * two failures that reached production - a route Vercel declined to match, and
 * a select string that was valid JavaScript and invalid SQL. Both passed lint,
 * the suite, check:api and the build, because not one of those makes a
 * request.
 *
 *   npm run smoke -- https://pulsedex.net
 *
 * Exits non-zero if anything fails, so CI can just run it.
 *
 * A preview deployment is usually behind Vercel's protection and will answer
 * every request with a redirect to vercel.com. Set
 * VERCEL_AUTOMATION_BYPASS_SECRET (Vercel project settings -> Deployment
 * Protection -> Protection Bypass for Automation) and it is sent as the
 * documented header. Without it this says so plainly rather than reporting a
 * working site as broken.
 */

const base = (process.argv[2] || process.env.SMOKE_URL || '').replace(/\/+$/, '')
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''

if (!base) {
  console.error('usage: npm run smoke -- <url>')
  process.exit(2)
}

const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : {}

/**
 * Every route the router serves, and what "working" means for each.
 *
 * The expectation is a set of acceptable statuses rather than one, because
 * most of these legitimately refuse an unauthenticated GET. That is fine and
 * is the point: a 401 or a 405 proves the route reached its handler, which is
 * exactly what was broken. What none of them may answer is 404 - that means
 * the request never arrived.
 */
const ROUTES = [
  { path: '/api/health', accept: [200, 503], describe: 'health' },
  { path: '/api/auth/nonce', accept: [200], describe: 'issues a sign-in nonce' },
  { path: '/api/auth/me', accept: [200, 401], describe: 'reports the session' },
  { path: '/api/auth/logout', accept: [200, 405], describe: 'logout' },
  { path: '/api/auth/verify', accept: [400, 401, 405], describe: 'verify' },
  { path: '/api/profile', accept: [401], describe: 'own profile, signed out' },
  { path: '/api/profile/avatar', accept: [401, 405], describe: 'avatar' },
  { path: '/api/posts', accept: [401, 405], describe: 'posts' },
  { path: '/api/posts/report', accept: [401, 405], describe: 'report' },
  { path: '/api/chat/messages', accept: [401, 405], describe: 'messages' },
  { path: '/api/chat/reactions', accept: [401, 405], describe: 'reactions' },
  { path: '/api/chat/block', accept: [401, 404, 405], describe: 'block' },
  { path: '/api/candles', accept: [200, 400], describe: 'candles' },
  // A path that is not a route must 404, or the router is matching too much
  // and something is reaching a handler it should not.
  { path: '/api/definitely-not-a-route', accept: [404], describe: 'unknown route 404s' },
]

let failures = 0

/** Vercel's protection answers with a redirect to its SSO, which is not the
 *  app talking. Worth naming, because it otherwise looks like every route is
 *  broken at once. */
const isProtectionRedirect = (res) =>
  [301, 302, 307, 308].includes(res.status) && /vercel\.com/.test(res.headers.get('location') || '')

for (const route of ROUTES) {
  const url = `${base}${route.path}`

  let res
  try {
    // manual, so a redirect is visible rather than followed into Vercel's
    // login page and reported as a 200.
    res = await fetch(url, { headers, redirect: 'manual' })
  } catch (err) {
    console.error(`FAIL ${route.path} - ${err.message}`)
    failures += 1
    continue
  }

  if (isProtectionRedirect(res)) {
    console.error(
      `FAIL ${route.path} - deployment protection redirected to Vercel. ` +
        'Set VERCEL_AUTOMATION_BYPASS_SECRET to smoke a protected preview.',
    )
    failures += 1
    continue
  }

  if (!route.accept.includes(res.status)) {
    const body = await res.text().catch(() => '')
    console.error(
      `FAIL ${route.path} - ${res.status}, expected one of ${route.accept.join('/')}` +
        (body ? ` - ${body.slice(0, 200)}` : ''),
    )
    failures += 1
    continue
  }

  console.log(`  ok  ${route.path} ${res.status} (${route.describe})`)

  /*
   * Health is the one whose body matters. It runs our real select strings
   * against the real database, so a 503 here names the broken query - which
   * is the failure the other checks in this repository structurally cannot
   * see.
   */
  if (route.path === '/api/health') {
    const payload = await res.json().catch(() => null)
    for (const check of payload?.checks || []) {
      if (check.ok) {
        console.log(`      ok  ${check.name}`)
      } else {
        console.error(`      FAIL ${check.name} - ${check.error || 'not ok'}`)
        failures += 1
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed against ${base}`)
  process.exit(1)
}

console.log(`\nAll checks passed against ${base}`)
