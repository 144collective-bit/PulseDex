/**
 * The decisions behind the site password.
 *
 * Separated from the middleware that uses them because the middleware runs on
 * Vercel's edge and cannot be exercised here, while these can be - and a gate
 * whose comparison is wrong is worse than no gate, because it looks like one.
 *
 * Worth being plain about what this is for. It is a shutter over the whole site
 * while live trading is tested, so a stranger cannot wander into a swap panel
 * whose execution path has never signed a real transaction. It is not
 * authentication: everyone who gets in shares one password, and nothing
 * downstream learns who they are.
 */

/** The cookie the edge sets once the password has been accepted. */
export const GATE_COOKIE = 'pd_gate'

/** How long one unlock lasts before the password is asked for again. */
export const GATE_TTL_SECONDS = 12 * 60 * 60

/**
 * Is the gate switched on at all?
 *
 * An absent password means an open site. The alternative - refusing everyone
 * when the variable is missing - turns a forgotten environment variable into an
 * outage, and this code reaches production before the variable does.
 *
 * Blank or whitespace-only counts as absent. Somewhere between a dashboard and
 * a shell it is easy to set a variable to nothing, and treating that as a
 * password would admit an empty form submission.
 */
export function gateEnabled(password) {
  return typeof password === 'string' && password.trim().length > 0
}

/**
 * Does the supplied password match?
 *
 * Compared in constant time. A comparison that returns early on the first wrong
 * character leaks how much of a guess was right, and over enough attempts the
 * difference is measurable - which an automated caller has the patience for.
 *
 * Length is folded into the result rather than checked first, for the same
 * reason: an early return on length tells an attacker how long to guess.
 */
export function passwordMatches(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string') return false
  if (expected.length === 0) return false

  let diff = supplied.length ^ expected.length
  const max = Math.max(supplied.length, expected.length)
  for (let i = 0; i < max; i += 1) {
    diff |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0)
  }
  return diff === 0
}

/**
 * The one path the gate must let past unauthenticated: the form's own endpoint.
 *
 * Everything else is closed, assets included - the built JavaScript is the
 * application, and serving it to someone who has not answered the password
 * would make the shutter decorative.
 */
export function isGateEndpoint(pathname) {
  return pathname === '/__gate'
}

/**
 * Where to send someone after they unlock.
 *
 * Their own destination, when it is one, so a shared deep link survives the
 * password. Accepted only when it is a path on this site: an absolute URL here
 * would turn the form into an open redirect, which is a phishing primitive - a
 * genuine link to the genuine site that lands somewhere else.
 */
export function safeRedirect(target) {
  if (typeof target !== 'string' || target.length === 0) return '/'

  // A single leading slash. Both `//evil.com` and `https://evil.com` are
  // absolute, and the first is the one that gets forgotten.
  if (!target.startsWith('/') || target.startsWith('//')) return '/'

  /*
   * Backslash, newline and carriage return are refused too: some clients
   * normalise a backslash into a slash, which turns a path accepted above into
   * a protocol-relative one afterwards, and a line break can split a header.
   *
   * Written by character code so the check cannot be quietly broken by however
   * the next tool to touch this file handles escaping.
   */
  for (const code of [92, 10, 13]) {
    if (target.indexOf(String.fromCharCode(code)) !== -1) return '/'
  }

  return target
}
