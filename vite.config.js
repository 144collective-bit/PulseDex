import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serve the Vercel functions in `api/` from the dev server.
 *
 * Vite only serves the client, so without this the sign-in endpoints exist
 * only after a deploy - meaning the one part of the app that handles
 * authentication would be the part that never gets exercised locally. The
 * shim adapts Node's raw req/res to the small Express-like surface the
 * handlers use, and reloads them on every request so edits apply immediately.
 */
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        // Underscore-prefixed files are shared helpers, not routes - the same
        // convention Vercel uses. Treating one as a route made the dev server
        // answer a real module request with a 500.
        if (url.pathname.split('/').some((part) => part.startsWith('_'))) return next()

        /*
         * The same single router production uses, rather than mapping the
         * path to a file here.
         *
         * This used to build `./api/<path>.js` and load that, which worked
         * while every route was its own function. It is now one catch-all
         * dispatching from a table, and a dev server resolving routes its own
         * way would be a second routing implementation to keep in step - so a
         * path that 404s on Vercel would work locally, or the reverse, which
         * is the worst place for a difference to live.
         */
        try {
          const mod = await server.ssrLoadModule('./api/[...path].js')

          if (req.method === 'POST' || req.method === 'PUT') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const raw = Buffer.concat(chunks).toString('utf8')
            try {
              req.body = raw ? JSON.parse(raw) : {}
            } catch {
              req.body = {}
            }
          }

          res.status = (code) => {
            res.statusCode = code
            return res
          }
          res.json = (payload) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return res
          }

          await mod.default(req, res)
        } catch (err) {
          // Surfaced rather than swallowed: a 404 from a missing route and a
          // crash inside a handler look identical from the client otherwise.
          server.config.logger.error(`[api] ${url.pathname}: ${err.message}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /*
   * The api handlers read process.env, which Vite does not populate on its
   * own. Loading .env.local here is what lets sign-in and the chat be
   * exercised locally instead of only against a deployment.
   *
   * A named list, never everything. These are the values the handlers read on
   * the server, and two of them - the session secret and the Supabase service
   * role key - are the kind that must never reach the browser. Lifting the
   * whole environment because it is convenient is how one of them ends up in
   * a bundle; Vite only inlines names beginning with VITE_, and the point of
   * this list is that nothing here has to rely on remembering that.
   */
  const env = loadEnv(mode, process.cwd(), '')
  const SERVER_ONLY = ['SESSION_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_ADDRESSES']
  for (const name of SERVER_ONLY) {
    if (env[name]) process.env[name] = env[name]
  }

  // Read by both sides: the browser builds its read-only client from it, and
  // the api pairs it with the service role key. It is public either way.
  if (env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL

  return {
    plugins: [react(), vercelApiDev()],

    /*
     * Tests run through Vite's own resolver.
     *
     * That matters more than it looks: the app imports without file
     * extensions, which Node alone cannot resolve, so a plain `node` test file
     * fails on the first import. Sharing the config means a test sees exactly
     * the module graph the app does.
     */
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],

      // Every spy and stub is undone between tests, so one file cannot leave a
      // mocked Math.random or a fake clock behind for the next.
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,

      deps: { optimizer: { ssr: { enabled: true, include: ['wagmi', 'viem'] } } },

      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'html'],
        reportsDirectory: './coverage',

        /*
         * Only what the tests are actually aimed at.
         *
         * Counting components would report a number near zero and say nothing
         * useful: they are verified by driving the real app, not from Node.
         * The logic below is what these tests exist for, so this is the figure
         * worth watching.
         */
        include: [
          'src/services/**/*.js',
          'src/utils/**/*.js',
          'src/dashboard/state/**/*.js',
          'src/config/wagmi.js',
        ],
        exclude: ['**/*.test.js', 'src/test/**'],
      },
    },
  }
})
