/**
 * Request guards for the sign-in endpoints.
 *
 * These are defence in depth rather than the primary control. SameSite=Lax
 * already stops a browser sending the session or nonce cookie on a cross-site
 * POST, and the signature checks in verify.js are what actually establish
 * identity. But leaning on a single mechanism is how one browser quirk or one
 * cookie-policy change turns into an incident, so the obvious second checks
 * are here too.
 */

/** Hosts a request is allowed to originate from. */
export function allowedHosts(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  return new Set(
    [host, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean)
  )
}

/**
 * Reject a state-changing request that did not come from our own pages.
 *
 * Origin is present on every cross-origin POST a browser makes; Referer is the
 * fallback for the few contexts that omit it. A request with neither is
 * allowed through, because non-browser callers (our own tests, curl) have no
 * Origin to send and are not what CSRF protects against - the cookie is what
 * an attacker cannot obtain, and they still cannot.
 */
export function isSameOrigin(req) {
  const allowed = allowedHosts(req)
  const source = req.headers.origin || req.headers.referer
  if (!source) return true

  try {
    return allowed.has(new URL(source).host)
  } catch {
    return false
  }
}

/**
 * Best-effort rate limit.
 *
 * In-memory, so it is per serverless instance rather than global - a spread
 * attack across cold starts sidesteps it. It still blunts the case that
 * actually happens, which is one client hammering one endpoint, and it costs
 * nothing. Replace with a shared counter when the database lands.
 */
const buckets = new Map()

export function rateLimit(req, { key, limit, windowMs }) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'

  const id = `${key}:${ip}`
  const now = Date.now()
  const hits = (buckets.get(id) || []).filter((t) => now - t < windowMs)

  hits.push(now)
  buckets.set(id, hits)

  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k)
    }
  }

  return {
    ok: hits.length <= limit,
    retryAfter: Math.ceil(windowMs / 1000),
  }
}
