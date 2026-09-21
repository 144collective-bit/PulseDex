import { createClient } from '@supabase/supabase-js'

/**
 * The server's connection to the chat's database.
 *
 * This one holds the service role key, which bypasses every row level security
 * policy. It is the reason the anon key in the browser can be read-only: all
 * writing happens here, behind a check that the caller holds a verified
 * sign-in cookie.
 *
 * The key must never be exposed to the browser. In this project that means it
 * must never be named with a `VITE_` prefix - Vite inlines those into the
 * bundle by design, and a service role key in the bundle is the whole database
 * handed to every visitor. It is read from `process.env` here, in a file under
 * `api/`, which the client never imports.
 */

let cached = null

/**
 * Build the client, or say plainly that there isn't one.
 *
 * Returns null rather than throwing, so a handler can answer "chat is not
 * configured on this deployment" with a 503 instead of a stack trace. Sign-in
 * makes the same choice for a missing SESSION_SECRET: unavailable is a better
 * answer than broken, and far better than insecure.
 */
export function serviceClient() {
  if (cached) return cached

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // A serverless function has no user and no session to keep warm; every
    // invocation is its own. Holding a realtime socket open here would be a
    // connection nobody is listening to.
    realtime: { params: { eventsPerSecond: 0 } },
  })
  return cached
}

let cachedAnon = null

/**
 * The same connection a visitor's browser gets.
 *
 * Read-only in practice: the anon key holds no privilege beyond what row-level
 * security grants it, which in this project is reading the public tables and
 * writing nothing.
 *
 * It exists for one caller - api/_routes/health.js - so that a deployment
 * without the service role key can still prove its selects parse and its
 * relationships resolve. That is the check that matters most and the one that
 * has caught real breakage twice: a `profiles` embed that PostgREST cannot
 * disambiguate fails identically whichever key asks, so the anon key is enough
 * to catch it.
 *
 * Which is what lets Preview deployments verify a pull request against the
 * real schema without being handed the production service role key. A branch
 * gets no more reach into the database than any visitor already has.
 */
export function anonClient() {
  if (cachedAnon) return cachedAnon

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null

  cachedAnon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
  })
  return cachedAnon
}
