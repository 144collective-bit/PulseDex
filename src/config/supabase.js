import { createClient } from '@supabase/supabase-js'

/**
 * The browser's connection to the chat's database.
 *
 * Read-only, and only by configuration of the database itself. The key below
 * ships inside the JavaScript every visitor downloads - that is what an anon
 * key is for, and it is not a secret - so what stops a visitor writing with it
 * is that no row level security policy permits an insert. The write path is a
 * different route entirely: our own endpoint, holding the service role key,
 * which never leaves the server.
 *
 * Two things live here rather than in the components that use them. The client
 * is a single connection shared by every surface, because Supabase's realtime
 * channel is a websocket and one per component is one per component. And
 * `hasSupabase` is the answer to "is chat configured on this deployment",
 * which the page needs before it renders anything.
 *
 * Absent configuration is handled the way the WalletConnect project id is: the
 * feature is not offered rather than offered broken. A client built from an
 * undefined url throws at construction, which would take the whole page down
 * on a deployment where nobody had set the variables yet - and this code
 * reaches production before the variables do.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Whether this deployment has a database to talk to at all. */
export const hasSupabase = Boolean(url && anonKey)

export const supabase = hasSupabase
  ? createClient(url, anonKey, {
      auth: {
        /*
         * Supabase's own auth is switched off, all of it.
         *
         * Identity here is a wallet signature verified by our sign-in
         * endpoints, and the session it produces is an httpOnly cookie the
         * page cannot read. Leaving Supabase's session handling on would have
         * it writing its own tokens into localStorage and refreshing them
         * forever, for an account system nothing uses - a second, confusing
         * notion of "signed in" sitting beside the real one.
         */
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        // Ten messages a second from the socket is plenty for a chat, and it
        // caps what a flood costs the browser: the limiter drops the excess
        // rather than letting a render queue build up behind it.
        params: { eventsPerSecond: 10 },
      },
    })
  : null
