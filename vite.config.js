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

        const modulePath = `./api${url.pathname.slice(4)}.js`

        try {
          const mod = await server.ssrLoadModule(modulePath)

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
  // The api handlers read process.env, which Vite does not populate on its
  // own. Loading .env.local here is what lets sign-in be exercised locally
  // instead of only against a deployment. Only SESSION_SECRET is lifted -
  // nothing here should ever reach the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.SESSION_SECRET) process.env.SESSION_SECRET = env.SESSION_SECRET

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
