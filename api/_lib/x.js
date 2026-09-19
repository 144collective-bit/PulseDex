/**
 * Where X's OAuth lives, and whether this deployment is set up to use it.
 *
 * Hostnames in one place because they have moved once already - twitter.com
 * to x.com - and a flow with the authorize host updated but not the token host
 * fails at the exchange, which reads like a credentials problem rather than a
 * URL problem. Overridable by environment for the same reason.
 */

export const AUTHORIZE_URL = process.env.X_AUTHORIZE_URL || 'https://x.com/i/oauth2/authorize'
export const TOKEN_URL = process.env.X_TOKEN_URL || 'https://api.x.com/2/oauth2/token'
export const ME_URL = process.env.X_ME_URL || 'https://api.x.com/2/users/me'

/**
 * The least this can ask for.
 *
 * `users.read` is what reads the profile. `tweet.read` comes with it because X
 * requires it alongside `users.read` - not because anything here reads a post.
 *
 * `offline.access` is deliberately absent. It is what would return a refresh
 * token, and a refresh token is a long-lived credential to somebody's X
 * account. This feature takes one snapshot at link time and throws the tokens
 * away, so asking for the ability to come back later would be asking for
 * something there is no plan to use and a great deal to lose.
 */
export const SCOPES = ['users.read', 'tweet.read']

/** The fields worth asking for, and no more. */
export const USER_FIELDS = 'created_at,public_metrics,verified,verified_type'

/**
 * The credentials, or null when this deployment has none.
 *
 * Null rather than throwing, matching how serviceClient() answers a missing
 * Supabase key: the page can then say "X linking is not available here"
 * instead of showing a button that 500s. This code reaches a deployment
 * before its variables do.
 *
 * The secret is read from process.env in a file under api/, which the client
 * never imports. It must never be given a VITE_ prefix - Vite inlines those
 * into the bundle by design, and a client secret in the bundle means anybody
 * can impersonate this application to X.
 */
export function xConfig() {
  const clientId = process.env.X_CLIENT_ID
  const clientSecret = process.env.X_CLIENT_SECRET
  const callbackUrl = process.env.X_CALLBACK_URL

  if (!clientId || !clientSecret || !callbackUrl) return null
  return { clientId, clientSecret, callbackUrl }
}

/**
 * The Authorization header for the token endpoint.
 *
 * X's confidential clients authenticate with HTTP Basic, which is the client
 * id and secret joined by a colon and base64'd - not base64url, and padded,
 * because this is RFC 7617 rather than a JWT.
 */
export function basicAuth({ clientId, clientSecret }) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}
