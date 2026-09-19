# PulseDex

A DEX screener, charting and portfolio tracker for [PulseChain](https://pulsechain.com),
live at **[pulsedex.net](https://pulsedex.net)**.

Real-time pair data and candlestick charts, a live board of pump.tires bonding
curves, multi-wallet portfolio tracking, and a wallet-gated chat.

## What's in it

| | |
|---|---|
| **Screener** | Live PulseChain pairs, sortable, with charts and trade history |
| **Trenches** | The pump.tires bonding-curve board: new launches, graduations, quality filters |
| **Chat** | Five rooms. Anyone can read; posting needs a wallet signature |
| **Portfolio** | Balances and holdings across multiple wallets, with a watchlist |
| **Token pages** | Per-token analytics, the one part of the app with its own URL |

Two things are built and deliberately switched off in `src/config/features.js`:
the **swap terminal**, which routes and quotes against PulseX, and the **markets**
overview. Nothing is deleted - the code and its tests are still here, and each
is a flag away from returning.

## Running it

Node 24 (see `.nvmrc`).

```bash
npm ci
npm run dev
```

That starts Vite on port 5173 and also serves the functions in `api/`, so
sign-in and chat work locally rather than only after a deploy.

The app runs without configuration: the screener, charts, trenches and portfolio
all read public APIs. Sign-in and chat need the variables below.

### Configuration

Copy `.env.example` to `.env.local`. Every variable is documented there, with
what it does and which of them are secret. In short:

| Variable | Needed for | Public? |
|---|---|---|
| `SESSION_SECRET` | wallet sign-in | **secret** |
| `VITE_SUPABASE_URL` | chat | public |
| `VITE_SUPABASE_ANON_KEY` | chat, read-only under RLS | public |
| `SUPABASE_SERVICE_ROLE_KEY` | chat writes, server only | **secret** |
| `ADMIN_ADDRESSES` | removing chat messages | public |
| `VITE_WALLETCONNECT_PROJECT_ID` | mobile wallets | public |
| `SITE_PASSWORD` | puts a password over the whole site | **secret** |

Anything named `VITE_*` is inlined into the browser bundle by design. A secret
must never carry that prefix.

Absent configuration is handled the same way throughout: the feature is not
offered rather than offered broken. No `SESSION_SECRET` and sign-in is
unavailable; no Supabase variables and the chat page says so; no WalletConnect
id and that option is simply not listed.

### The chat's database

Chat needs a [Supabase](https://supabase.com) project. Run the SQL in
`supabase/migrations/` against it in order, then set the three Supabase
variables and rebuild - `VITE_*` values are baked in at build time, so setting
them is not enough on its own.

The migrations are the security model, not just a schema. Read
`0001_chat.sql` before changing it: reads are open to the anon key, and there is
deliberately no insert, update or delete policy for any role, which is what
makes the public key safe to ship.

## Tests

```bash
npm test               # once
npm run test:watch     # re-runs only what a change affects
npm run test:changed   # only the tests covering the files you touched
npm run test:coverage  # writes coverage/ and prints a summary
```

Vitest, sharing `vite.config.js` so tests resolve modules exactly as the app
does - the source imports without file extensions, which plain Node cannot
follow.

The suite is deliberately weighted toward logic that has broken before rather
than toward coverage: the swap reconstruction and its explorer field names, the
candle service's distinction between an unreadable response and an empty pool,
the dashboard reducer and its undo stack, the module error boundary's reset
state machine, the request deadline, the explorer retry policy, scoped storage
and the write notification that stops two surfaces overwriting each other, the
SIWE message round trip, the indicator maths, the launch quality filters, the
chat's message rules and rate limits, and a guard that fails if the wallet
connectors ever go back to being extension-only.

Everything runs in Node with no DOM. Anything needing a browser is verified by
driving the real app instead.

Shared fakes live in `src/test/fixtures.js` - responses, a memory
`localStorage`, a `window` complete enough for wallet discovery, candle
builders. They are there because the same three fakes were being rewritten in
every file that needed them, each slightly differently, which is how a test
starts passing for the wrong reason.

Coverage is measured only over the logic these tests aim at - services, utils,
the dashboard reducer, the connector config. Counting components would report a
number near zero and mean nothing, since they are checked by driving the app.

## Layout

```
src/
  components/   views and UI, including dex/ and social/
  dashboard/    a separate widget system, currently unreachable
  services/     every external API and the swap machinery
  hooks/        data loading and wallet interaction
  utils/        pure logic, which is where the tests point
  config/       feature flags, chains, rooms, wagmi connectors
api/            Vercel functions: SIWE sign-in, chat writes, the candle proxy
supabase/       SQL migrations, run by hand
middleware.js   the optional site-wide password, enforced at the edge
```

Rules that a server handler enforces live in `src/utils/` and are imported by
it, because the test runner only collects `src/**/*.test.js`. `middleware.js`
and `src/utils/siteGate.js` are the clearest example of the split.

## Deploying

Vercel builds from `main`. CI runs install, lint, test and build on every push
but does not gate the deploy - a red run means the commit is broken, not that
the site is stuck.

## Stack

React 19, Vite 8, wagmi and viem for wallets, TanStack Query for data,
lightweight-charts for candles, Supabase for the chat, oxlint, Vitest.
