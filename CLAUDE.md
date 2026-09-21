# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server, also serves api/ (see "The api shim" below)
npm test               # full suite, once
npm run test:watch     # re-runs what a change affects
npm run test:changed   # only the tests covering the files you touched
npm run test:coverage  # writes coverage/ and prints a summary
npm run lint           # oxlint
npm run build          # production build into dist/
npm run logos          # regenerates src/data/plsfolioLogos.json from plsfolio
```

One test file, or one test:

```bash
npx vitest run src/utils/chatMessage.test.js
npx vitest run -t "refuses a message past the limit"
```

Node 24, per `.nvmrc`, matching the Vercel project. `npm ci` can fail on npm 10
with `Missing: ox@... from lock file` where npm 11 succeeds - that is the Node
major, not a broken lockfile.

## Architecture

A React SPA built by Vite, deployed on Vercel, with a handful of serverless
functions in `api/`. There is no framework router and no server rendering.

**Navigation is state, not routes.** `App.jsx` holds `activeTab` and renders one
view per value. The single exception is the token page, which uses
`history.pushState` via `src/hooks/useTokenRoute.js` so a token can be linked to;
`vercel.json` rewrites every non-`/api` path to `index.html` to make that work on
reload. Anything else - including which chat room is open - is not linkable.

**Features are flags.** `src/config/features.js` decides what exists. The
convention stated at the top of that file is that switching something off hides
it and deletes nothing, which is why the entire swap terminal (`DexTerminal`,
`SwapPanel`, `src/services/swap*.js` and ~2,000 lines of tests) is still present
and still tested while being unreachable.

**Logic lives in `src/`, handlers stay thin.** The vitest config only collects
`src/**/*.test.js`, so anything under `api/` or `middleware.js` is untestable
where it sits. The pattern is to put the decisions in `src/utils/` and import
them:

| Thin caller | Tested logic it imports |
|---|---|
| `middleware.js` | `src/utils/siteGate.js` |
| `api/chat/messages.js` | `src/utils/chatMessage.js`, `chatAdmin.js`, `chatRate.js`, `src/config/rooms.js` |
| `api/auth/me.js` | `src/utils/chatAdmin.js` |

Follow it when adding server code. A rule that only exists inside a handler is a
rule nothing checks.

### Auth

Wallet sign-in (SIWE). `api/auth/nonce` issues a nonce in a signed cookie,
`api/auth/verify` checks the signature against it, and the session is a JWT in an
httpOnly cookie - no datastore. `api/_lib/session.js` has the details, including
why a nonce cannot be truly consumed. `api/_lib/guard.js` holds the CSRF check
and an in-memory per-IP rate limiter.

The session cookie is the only source of identity on the server. Never read an
address from a request body.

### Chat

Reads and writes go to different places on purpose:

- **Read**: the browser queries Supabase directly with the anon/publishable key.
  Row level security grants `select` and defines no insert, update or delete
  policy for any role, so the key that ships in the bundle can only read.
  Realtime delivers new messages, filtered server-side by room.
- **Write**: `POST /api/chat/messages` verifies the sign-in cookie, validates,
  rate-limits, then inserts with the service-role key, which never reaches the
  browser.

Rooms are a fixed list in `src/config/rooms.js`, validated on every write.
Removal is a `deleted_at` timestamp, not a delete. Moderators come from
`ADMIN_ADDRESSES` and are resolved server-side by `api/auth/me`.

Schema changes are SQL files in `supabase/migrations/`, **run by hand** against
the Supabase project. Nothing applies them automatically, so a change needing one
is not finished when the code merges.

### Market data

`src/services/` wraps DexScreener, GeckoTerminal, PulseScan and pump.tires.
Candles go through `api/candles.js` rather than being fetched from the browser:
GeckoTerminal drops its CORS header when rate-limited, which is indistinguishable
from being offline, and proxying means one upstream request serves every visitor
through the CDN.

### Wallets

`src/config/wagmi.js` builds the connector list at module load. Four targeted
`injected` connectors plus generic discovery, and WalletConnect only when
`VITE_WALLETCONNECT_PROJECT_ID` is set - a connector with no id fails the moment
someone taps it, so it is left out rather than shipped broken. MetaMask was
deliberately removed. There are three connector tests in separate files because
the list is decided at load time and they cannot share a module registry.

### The site gate

`middleware.js` puts a password over everything at the edge when `SITE_PASSWORD`
is set, assets included. Unset, every request passes through.

## Testing

Node environment, no DOM. Components are not unit-tested - they are verified by
driving the real app. When a change touches a component, a wallet or a chart, run
it in a browser; the suite cannot see those.

Shared fakes are in `src/test/fixtures.js`. Coverage is measured only over
services, utils, the dashboard reducer and the wagmi config, because counting
components would report a number near zero and mean nothing.

The suite has been green and broken at the same time before: an unhandled
rejection makes vitest exit non-zero while reporting every test passed. Check the
exit code, not just the output.

## Deployment

Vercel builds from `main` and deploys to pulsedex.net. CI (`.github/workflows/ci.yml`)
runs install, lint, test and build but does **not** gate the deploy.

`VITE_`-prefixed variables are inlined into the bundle at build time. Two
consequences that have both bitten:

1. Changing one in the Vercel dashboard does nothing until a **new build**. Code
   behind an unset flag is tree-shaken out entirely, so the path is not merely
   inactive, it is absent.
2. Anything secret must not carry the prefix. `SUPABASE_SERVICE_ROLE_KEY` is
   named the way it is for exactly this reason.

`vite.config.js` lifts a named list of server-only variables into `process.env`
for local development rather than everything, so the rule does not depend on
remembering it.

### The api shim

`vite.config.js` includes a plugin that serves `api/` from the dev server,
adapting Node's req/res to the small Express-like surface the handlers use.
Without it the auth and chat endpoints would only exist after a deploy. It skips
underscore-prefixed files, matching Vercel's convention, and only parses a body
for POST and PUT - which is why `api/chat/messages.js` takes the id for a DELETE
from the query string.

## Gotchas

- **`VISIBLE_TABS` and `isTabVisible` in `features.js` are exported and used by
  nothing.** The nav is hardcoded in three places: `Navbar.jsx`,
  `MobileBottomNav.jsx`, and the conditional rendering in `App.jsx`. Adding a tab
  means editing all three. The list also still contains `'dashboard'`, which was
  removed from the app - `src/dashboard/` remains, unreachable.
- Lint reports ~121 warnings on a clean tree. Check that a change does not add
  to the count rather than expecting zero. They are worth reading: the React
  Compiler rules have caught a real would-be blank page here.
- Commit messages in this repository explain why, not what, and are written in
  prose. Match the surrounding style.
