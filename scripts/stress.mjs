import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
// The app's own sentences, read from the app, so this check cannot drift
// from what the code can actually say.
import { DB_MESSAGES } from '../src/utils/dbError.js'

/**
 * Drive every surface in the app, on hostile data, and report what breaks.
 *
 * The deeper companion to smoke-browser.mjs. That one asks whether each page
 * comes up on a fair wind; this one asks what happens when the database
 * answers with nulls, when a field is forty thousand characters, when an
 * endpoint 500s, when somebody switches tabs faster than the fetches can
 * settle, and when the viewport is a phone.
 *
 * Usage:
 *
 *   VITE_SUPABASE_URL=https://mock.supabase.co \
 *     VITE_SUPABASE_ANON_KEY=mock npm run build
 *   npx vite preview --port 4319 --host 127.0.0.1 &
 *   node scripts/stress.mjs http://127.0.0.1:4319
 *
 * Nothing leaves localhost: every outbound request is aborted, so a result
 * here is about this app and not about who happened to be reachable.
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4319'
const ONLY = process.argv[3] || null

const SANDBOX_CHROMIUM =
  process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
  args: ['--no-sandbox'],
})

const ADDRESS = '0x1111111111111111111111111111111111111111'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

/*
 * Rows shaped like the worst thing the database can hand back.
 *
 * Every one of these is reachable in production: a handle is nullable until
 * somebody claims one, an embed comes back null when the joined row is gone,
 * a bio is user-typed, and a column added by a migration is null on every row
 * that predates it. Code that only ever sees the happy fixture crashes on the
 * first of these and the page it was on goes blank.
 */
/*
 * Two pairs on the screener.
 *
 * `TOKEN_ROOM` is about ADDRESS and carries 41 messages, so the first of
 * these is a token being talked about and the second is not. Shaped like what
 * dexscreener returns, because the app reads it straight - a fixture in a
 * tidier shape would test a mapping nobody wrote.
 */
const QUIET_TOKEN = '0x9999999999999999999999999999999999999999'
const PAIRS = [
  {
    pairAddress: '0xaaa1000000000000000000000000000000000001',
    chainId: 'pulsechain',
    dexId: 'pulsex',
    baseToken: { address: ADDRESS, symbol: 'STRESS', name: 'Stress Token' },
    quoteToken: { address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', symbol: 'WPLS' },
    priceUsd: '0.000123',
    priceChange: { h24: 12.5 },
    volume: { h24: 125000 },
    liquidity: { usd: 90000 },
  },
  {
    pairAddress: '0xaaa1000000000000000000000000000000000002',
    chainId: 'pulsechain',
    dexId: 'pulsex',
    baseToken: { address: QUIET_TOKEN, symbol: 'QUIET', name: 'Nobody Talks' },
    quoteToken: { address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', symbol: 'WPLS' },
    priceUsd: '1.25',
    priceChange: { h24: -3.2 },
    volume: { h24: 4000 },
    liquidity: { usd: 20000 },
  },
]

const HUGE = 'A'.repeat(40_000)
const NASTY_PROFILE = {
  address: ADDRESS,
  handle: null,
  avatar_id: null,
  avatar_url: null,
  banner_url: null,
  bio: null,
  links: null,
  created_at: null,
}
const NASTY_POST = {
  id: 1,
  address: ADDRESS,
  body: HUGE,
  created_at: null,
  parent_id: null,
  profiles: null,
}
const NASTY_MESSAGE = {
  id: 1,
  address: ADDRESS,
  room: 'general',
  body: HUGE,
  created_at: null,
  edited_at: null,
  reply_to: null,
  reply: null,
  profiles: null,
  message_reactions: null,
}

/*
 * A reply whose quoted message is as bad as the row quoting it.
 *
 * Every field in the embed is reachable in production: the join comes back
 * with no profile for somebody who never made one, and `deleted_at` is set on
 * anything a moderator has taken down - at which point the body is still in
 * the row and must not be drawn. A quote that renders 40,000 characters, or
 * that shows the text of a removed message, is the failure this exists to
 * catch.
 */
const NASTY_REPLY = {
  ...NASTY_MESSAGE,
  id: 2,
  reply_to: 1,
  reply: { id: 1, address: ADDRESS, body: HUGE, deleted_at: '2026-01-01T00:00:00Z', profiles: null },
}

/*
 * A token room, and a token room that should never have existed.
 *
 * The slug is what every link is built from and what the address shown beside
 * it is read back out of, so the row that matters here is the second one: a
 * slug that is not an address cannot be linked anywhere, and the service
 * drops it rather than drawing a dead entry. The check constraint in 0014
 * makes it unreachable in the real database, which is exactly why the code
 * that does not depend on that being true needs a row to prove it on.
 */
const TOKEN_ROOM = {
  slug: `token-${ADDRESS}`,
  kind: 'token',
  token_address: ADDRESS,
  name: null,
  blurb: null,
  message_count: 41,
  last_message_at: '2026-01-01T00:00:00Z',
}
/*
 * A group that has been taken down.
 *
 * Archived rather than deleted - 0018 narrowed the anon read policy to live
 * rooms, so in production this row never reaches the browser at all. It is
 * fixtured here anyway, because the fixture answers every select the same way
 * and the sidebar must not draw it even when handed it.
 */
const ARCHIVED_GROUP = {
  slug: 'group-gone',
  kind: 'group',
  token_address: null,
  name: 'Gone',
  blurb: 'Taken down',
  message_count: 12,
  last_message_at: '2026-02-01T00:00:00Z',
  gate_token: null,
  min_balance: null,
  gate_decimals: null,
  gate_symbol: null,
  archived_at: '2026-03-01T00:00:00Z',
  archived_by: ADDRESS,
}
const NASTY_ROOM = {
  slug: 'token-not-an-address',
  kind: 'token',
  token_address: null,
  name: null,
  blurb: null,
  message_count: null,
  last_message_at: null,
}

/*
 * A live dev claim, and one that should never be drawn.
 *
 * The second row is revoked. The select policy in 0015 already hides those,
 * so it can only reach the browser if that policy is ever loosened - which is
 * exactly the change that would silently put a badge back on a token a
 * moderator took it away from. The service states the condition a second time
 * for that reason, and this row is what proves the second statement works.
 */
const TOKEN_CLAIM = {
  token_address: ADDRESS,
  address: ADDRESS,
  claimed_at: '2026-01-01T00:00:00Z',
  revoked_at: null,
}
const REVOKED_CLAIM = {
  ...TOKEN_CLAIM,
  token_address: '0x' + '9'.repeat(40),
  revoked_at: '2026-02-01T00:00:00Z',
}

/*
 * Two groups: one open, one holders-only.
 *
 * The gated one carries a minimum of a thousand tokens at eighteen decimals,
 * which is 10^21 base units - a number no JavaScript number holds exactly,
 * and the reason every comparison in src/utils/gate.js is BigInt. A room
 * whose stated requirement comes out as 1e+21 has lost the arithmetic
 * somewhere.
 */
const OPEN_GROUP = {
  slug: 'group-the-trenches',
  kind: 'group',
  token_address: null,
  name: 'The Trenches',
  blurb: 'Launches, and what went wrong with them',
  message_count: 41,
  last_message_at: '2026-03-01T00:00:00Z',
  gate_token: null,
  min_balance: null,
  gate_decimals: null,
  gate_symbol: null,
}
const GATED_GROUP = {
  ...OPEN_GROUP,
  slug: 'group-whales',
  name: 'Whales',
  blurb: 'Holders only',
  message_count: 0,
  last_message_at: null,
  gate_token: ADDRESS,
  min_balance: '1000000000000000000000',
  gate_decimals: 18,
  gate_symbol: 'PLSX',
}
/* A gate with half of itself missing, and one with a minimum of zero. Both
   are refused by constraints in 0016; neither may render as a restriction. */
const BROKEN_GATE = {
  ...GATED_GROUP,
  slug: 'group-broken',
  name: 'Broken',
  gate_token: ADDRESS,
  min_balance: null,
}
const ZERO_GATE = {
  ...GATED_GROUP,
  slug: 'group-zero',
  name: 'Zero',
  min_balance: '0',
}

const FIXTURES = {
  /** The ordinary case, so a failure elsewhere is known to be the data. */
  healthy: (table) => {
    if (table === 'profiles')
      return [{ ...NASTY_PROFILE, handle: 'degen', bio: 'gm', links: [], created_at: '2026-01-01T00:00:00Z' }]
    if (table === 'posts')
      return [{ ...NASTY_POST, body: 'gm', created_at: '2026-01-01T00:00:00Z', profiles: { handle: 'degen', avatar_id: null, avatar_url: null } }]
    if (table === 'messages')
      return [{ ...NASTY_MESSAGE, body: 'gm', created_at: '2026-01-01T00:00:00Z', profiles: { handle: 'degen', avatar_id: null, avatar_url: null }, message_reactions: [] }]
    if (table === 'rooms') return [TOKEN_ROOM, OPEN_GROUP, GATED_GROUP]
    if (table === 'token_claims') return [TOKEN_CLAIM]
    /*
     * The last change to a room's rule, which the room draws a notice from.
     * A notice rather than a message, because `messages.address` is not null
     * and references `profiles` - so posting one would mean inventing a
     * system account with an address and the standing to be impersonated.
     */
    if (table === 'room_gate_changes')
      return [
        {
          changed_at: '2026-03-01T00:00:00Z',
          changed_by: ADDRESS,
          gate_token: ADDRESS,
          min_balance: '1000000000000000000000',
          gate_decimals: 18,
          gate_symbol: 'PLSX',
        },
      ]
    return []
  },
  /** Nulls everywhere a column is nullable, and a body nobody would type. */
  nasty: (table) => {
    if (table === 'profiles') return [NASTY_PROFILE]
    if (table === 'posts') return [NASTY_POST]
    if (table === 'messages') return [NASTY_MESSAGE, NASTY_REPLY]
    if (table === 'rooms')
      return [NASTY_ROOM, TOKEN_ROOM, BROKEN_GATE, ZERO_GATE, ARCHIVED_GROUP]
    // A revoked claim and one with nothing in it. Neither may draw a badge.
    if (table === 'token_claims')
      return [REVOKED_CLAIM, { token_address: null, address: null, claimed_at: null, revoked_at: null }]
    // A change row with every nullable column null, which is what removing a
    // gate looks like - and one whose date is unreadable.
    if (table === 'room_gate_changes')
      return [
        {
          changed_at: null,
          changed_by: null,
          gate_token: null,
          min_balance: null,
          gate_decimals: null,
          gate_symbol: null,
        },
      ]
    return []
  },
  /** Nothing at all - the state every one of these tables starts in. */
  empty: () => [],
}

/** Answer the database, the session and the app's own endpoints. */
async function wire(page, { fixture = 'healthy', signedIn = true, apiStatus = 200, token = false } = {}) {
  // Nothing leaves localhost, so the run says the same thing everywhere.
  await page.route('**/*', (route) =>
    route.request().url().startsWith(BASE) ? route.continue() : route.abort()
  )

  /*
   * The launchpad, for the scenarios that need a token page with a token on
   * it rather than its "no launchpad token at this address" state.
   *
   * Opt-in rather than always on, so `direct / token page` keeps testing that
   * empty state - it is the ordinary outcome for any address that is not one
   * of the curve's launches, which is most of them.
   */
  if (token) {
    await page.route('**/api2.pump.tires/api/tokens/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: { address: ADDRESS, name: 'Stress Token', symbol: 'STRESS' },
          holders: [],
        }),
      })
    )
  }

  /*
   * The pair list the screener draws.
   *
   * Every outbound request is aborted by the catch-all above, so without this
   * the screener renders an empty list and every scenario about a row on it
   * passes by having nothing to check. That was true until Batch 5 and was a
   * gap rather than a decision: the screener is this app's main surface and
   * had no data-driven coverage at all.
   *
   * One pair is about the token the fixtures put a room on, so the "being
   * talked about" badge has something to attach to; the other is a token
   * nobody is discussing, which is what proves the badge is a signal rather
   * than decoration.
   */
  await page.route('**/api.dexscreener.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pairs: PAIRS }),
    })
  )

  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/rest/v1/')[1]?.split('?')[0] || ''
    if (apiStatus !== 200) {
      return route.fulfill({
        status: apiStatus,
        headers: { 'content-type': 'application/json' },
        // Shaped like the real thing, so a page that prints it is caught
        // saying something it should never say.
        body: JSON.stringify({
          code: '42501',
          message: 'new row violates row-level security policy for table "profiles"',
          details: null,
          hint: null,
        }),
      })
    }
    const rows = FIXTURES[fixture](table)
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      body: JSON.stringify(rows),
    })
  })
  await page.route('**/realtime/**', (route) => route.abort())

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ address: signedIn ? ADDRESS : null }),
    })
  )
  /*
   * The inbox, which unlike everything else social is read through an
   * endpoint rather than from the database - the notifications table has no
   * read policy, because sign-in here is a cookie this app sets and RLS
   * cannot express "your own rows".
   */
  await page.route('**/api/notifications**', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    }
    if (apiStatus !== 200) {
      return route.fulfill({ status: apiStatus, contentType: 'application/json', body: '{"error":"Your notifications could not be loaded."}' })
    }
    const rows =
      fixture === 'empty'
        ? []
        : [
            {
              id: 1,
              kind: 'mention',
              created_at: fixture === 'nasty' ? null : '2026-09-20T10:00:00Z',
              read_at: null,
              post_id: 7,
              message_id: null,
              profiles: fixture === 'nasty' ? null : { address: ADDRESS, handle: 'degen', avatar_id: null, avatar_url: null },
              posts: fixture === 'nasty' ? { id: 7, body: 'A'.repeat(40000), parent_id: null } : { id: 7, body: 'gm', parent_id: null },
            },
            {
              id: 2,
              kind: 'follow',
              created_at: '2026-09-20T09:00:00Z',
              read_at: '2026-09-20T09:30:00Z',
              post_id: null,
              message_id: null,
              profiles: { address: ADDRESS, handle: null, avatar_id: null, avatar_url: null },
              posts: null,
              messages: null,
            },
            /*
             * A reaction, which is the one kind addressed by room and id
             * together. The nasty fixture drops the room, which is what a
             * deployment whose query predates the embed sends - that row must
             * stay as text rather than become a link to nowhere.
             */
            {
              id: 3,
              kind: 'reaction',
              created_at: '2026-09-20T08:00:00Z',
              read_at: '2026-09-20T08:30:00Z',
              post_id: null,
              message_id: 5,
              profiles: { address: ADDRESS, handle: 'degen', avatar_id: null, avatar_url: null },
              posts: null,
              messages: fixture === 'nasty' ? null : { id: 5, room: 'lounge' },
            },
          ]
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ notifications: rows, unread: rows.filter((r) => !r.read_at).length }),
    })
  })

  /*
   * Unread counts, which like the inbox go through an endpoint rather than
   * the database - room_reads has no read policy, because where somebody has
   * read up to is nobody else's business.
   */
  await page.route('**/api/chat/reads**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    }
    if (apiStatus !== 200) {
      return route.fulfill({ status: apiStatus, contentType: 'application/json', body: '{"error":"Unread counts are unavailable right now."}' })
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Deliberately including a three-digit one: the badge has to say "99+"
      // rather than widen the room list until the names no longer fit.
      body: JSON.stringify({ unread: fixture === 'empty' ? {} : { trading: 3, trenches: 140 } }),
    })
  })

  await page.route('**/api/profile', (route) =>
    apiStatus !== 200
      ? route.fulfill({ status: apiStatus, contentType: 'application/json', body: '{"error":"Profiles are unavailable right now."}' })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ address: ADDRESS, handle: null, avatarId: null, avatarUrl: null, bannerUrl: null, bio: null, links: null }),
        })
  )
}

const results = []

/** Open the app in one configuration, drive it, and collect every failure. */
async function run(name, { viewport = DESKTOP, path = '/', steps, ...opts } = {}) {
  if (ONLY && !name.includes(ONLY)) return
  const page = await browser.newPage({ viewport })
  const errors = []

  page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`.slice(0, 200)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Aborting every outbound request means the app's own fetches fail. That
    // is the harness, not the app.
    if (/net::ERR_|Failed to fetch|NetworkError|WebSocket|blocked by CORS|Access to fetch at/i.test(t)) return
    /*
     * A scenario that answers with an error status gets one of these from the
     * browser per request, whatever the app then does with it. That is the
     * fixture talking, so it is expected here - and the app's own handling is
     * asserted on directly below, by what the page ends up showing.
     */
    if (opts.apiStatus && opts.apiStatus !== 200 && /Failed to load resource/i.test(t)) return
    // The console line dbError writes for whoever is debugging. Wanted.
    if (/^load |^search |^find |failed:/i.test(t)) return
    errors.push(`CONSOLE: ${t.slice(0, 180)}`)
  })

  await wire(page, opts)

  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1200)
    if (steps) await steps(page)
    await page.waitForTimeout(900)
  } catch (err) {
    errors.push(`STEP FAILED: ${err.message}`.slice(0, 200))
  }

  /*
   * What the page ended up as.
   *
   * Read through a retry, and that is not defensiveness for its own sake. A
   * step that fails part-way can leave a navigation in flight, and evaluating
   * into a context that is being torn down throws - which used to take the
   * whole matrix down with it, so one stale expectation at scenario 57 meant
   * the remaining forty were never run at all. A harness that stops at the
   * first surprise reports less than one that keeps going, and the run it
   * does report is the one nobody looks at because it never finished.
   */
  const probe = () =>
    page.evaluate(() => {
      const root = document.getElementById('root')
      const main = document.querySelector('main')
      return {
        mounted: Boolean(root && root.children.length),
        mainLen: (main?.innerText || '').trim().length,
        // A wider page than the viewport is a horizontal scrollbar on a phone.
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })

  let state
  try {
    state = await probe()
  } catch {
    // Once the navigation lands there is a context again. If there still is
    // not, that is itself the finding, and it is recorded rather than thrown.
    await page.waitForTimeout(1200)
    state = await probe().catch((err) => {
      errors.push(`UNREADABLE: ${err.message}`.slice(0, 200))
      return { mounted: false, mainLen: 0, overflow: 0 }
    })
  }

  /*
   * What a failing database looks like to the reader.
   *
   * Two things have to hold: they are told something, and what they are told
   * is not PostgREST's. Its errors name the table, the column, the constraint
   * and sometimes the policy that refused, which describes the shape of the
   * database to anybody who can make it fail.
   */
  if (opts.apiStatus && opts.apiStatus !== 200 && opts.errorState !== false) {
    const text = await page.evaluate(() => document.querySelector('main')?.innerText || '')
    /*
     * Told something, by any of the ways this app says it.
     *
     * This used to accept only the sentences dbError produces, which made it
     * fail on a surface that was behaving perfectly well - the inbox reads
     * through an endpoint rather than the database, so it says something
     * dbError has never heard of. The check is about whether the reader was
     * told, not about which module did the telling.
     */
    const announced = await page.evaluate(() =>
      [...document.querySelectorAll('[role="alert"]')].some((el) => (el.innerText || '').trim().length > 8)
    )
    if (!announced && !DB_MESSAGES.some((m) => text.includes(m))) {
      errors.push(`NO ERROR STATE: a failing database produced no message for the reader - saw ${JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, 160))}`)
    }
    const leak = /relation "|row-level security|violates|permission denied for|column .* does not exist|PGRST\d+|"public\./i.exec(text)
    if (leak) errors.push(`LEAK: the database's own words are on the page - ${JSON.stringify(leak[0])}`)
  }

  if (opts.expectText) {
    const text = await page.evaluate(() => document.querySelector('main')?.innerText || '')
    if (!text.includes(opts.expectText)) {
      errors.push(`MISSING TEXT: expected ${JSON.stringify(opts.expectText)}`)
    }
  }

  if (!state.mounted) errors.push('BLANK: the app unmounted')
  if (state.mainLen < 10) errors.push(`EMPTY: main has ${state.mainLen} characters of text`)
  if (state.overflow > 4) errors.push(`OVERFLOW: page is ${state.overflow}px wider than the viewport`)

  /*
   * Printed as it happens, not gathered for the end. Forty-odd scenarios take
   * minutes, and a run that says nothing until it finishes is one you cannot
   * tell from a hang - and gives you nothing to look at if it does hang.
   */
  console.log(`${errors.length ? 'FAIL' : ' ok '}  ${name}`)
  for (const e of errors) console.log(`        ${e}`)

  results.push({ name, errors })
  await page.close()
}

/* ---------------------------------------------------------------- steps -- */

const tab = (label) => async (page) => {
  const btn = page.locator('.btn-tab', { hasText: label }).first()
  if (!(await btn.count())) throw new Error(`no "${label}" tab`)
  await btn.click()
  await page.waitForTimeout(1400)
}

const mobileTab = (label) => async (page) => {
  const btn = page.locator('.mobile-nav-item', { hasText: label }).first()
  if (!(await btn.count())) throw new Error(`no "${label}" in the bottom nav`)
  await btn.click()
  await page.waitForTimeout(1400)
}

const accountMenu = (label) => async (page) => {
  const btn = page.locator('.account-btn').first()
  if (!(await btn.count())) throw new Error('no account button - is the session mock answering?')
  await btn.click()
  await page.waitForTimeout(350)
  const item = page.locator('.account-menu-item', { hasText: label }).first()
  if (!(await item.count())) throw new Error(`no "${label}" in the account menu`)
  await item.click()
  await page.waitForTimeout(1400)
}

const socialTab = (label) => async (page) => {
  await tab('Social')(page)
  const t = page.locator('.social-tabs .xp-tab', { hasText: label }).first()
  if (!(await t.count())) throw new Error(`no "${label}" social tab`)
  await t.click()
  await page.waitForTimeout(1400)
}

/**
 * The inbox, through the bell.
 *
 * Not `socialTab('Notifications')` any more: the flattening took it out of
 * the row and put the count in the chrome, so the way in is the bell on the
 * nav bar - from whichever tab the reader happens to be on.
 *
 * Driven through the control rather than by going straight to /notifications
 * because the bell being reachable is half of what the move was for. The
 * direct URL is covered separately, by CHROME_SURFACES above.
 */
const bell = async (page) => {
  const b = page.locator('.notif-bell').first()
  if (!(await b.count())) throw new Error('no bell in the chrome')
  await b.click()
  await page.waitForTimeout(1400)
}

/* ------------------------------------------------------------ scenarios -- */

const TABS = ['Home', 'Screener', 'Trenches', 'Social', 'Portfolio']
/*
 * The three the row offers. My Profile and Notifications left it in the
 * flattening - they are reached from the account menu and the bell, and are
 * covered by their own scenarios below rather than by walking the strip.
 */
const SOCIAL = ['Rooms', 'Discover']

// Every tab, signed in, on ordinary data. The floor.
for (const t of TABS) await run(`desktop / ${t}`, { steps: tab(t) })
for (const t of SOCIAL) await run(`desktop / Chat > ${t}`, { steps: socialTab(t) })

// The same on a phone, where the layout is a different one.
for (const t of TABS) await run(`phone / ${t}`, { viewport: PHONE, steps: mobileTab(t) })

// Signed out: every surface that offers something to an account has to say so
// rather than read a field off a session that is not there.
for (const t of TABS) await run(`signed out / ${t}`, { signedIn: false, steps: tab(t) })

// Nulls in every nullable column, and a body of forty thousand characters.
for (const t of TABS) await run(`nasty data / ${t}`, { fixture: 'nasty', steps: tab(t) })
for (const t of SOCIAL) await run(`nasty data / Chat > ${t}`, { fixture: 'nasty', steps: socialTab(t) })

// Nothing in the database at all - the state this app shipped in.
for (const t of SOCIAL) await run(`empty db / Chat > ${t}`, { fixture: 'empty', steps: socialTab(t) })

// The database refusing. A page that cannot load its rows still has to render.
for (const t of SOCIAL) await run(`db 500 / Chat > ${t}`, { apiStatus: 500, steps: socialTab(t) })
/*
 * Profile settings is deliberately quiet about a failed read - somebody who
 * came here to change their slippage does not need an alert about the chat -
 * so the general error-state check does not apply. What does apply is the one
 * part of this form a failed read would otherwise destroy: links live only on
 * the server, and a form that did not manage to read them must say so rather
 * than save the empty set it is holding over the top of them.
 */
await run('db 500 / Profile settings', {
  apiStatus: 500,
  steps: accountMenu('Profile settings'),
  errorState: false,
  expectText: 'could not be loaded, so saving will leave them as they are',
})

// Direct routes, opened cold, with no tab clicked first.
await run('direct / token page', { path: `/token/${ADDRESS}` })

/*
 * A token's own room, on the token's page.
 *
 * The whole point of Batch B: a question about a token asked under the chart
 * of that token. Two things have to hold and both have broken before - the
 * tab has to open the room rather than nothing, and the page has to be
 * styled, which it was not: `trenches.css` was imported only by the board, so
 * /token/<address> reached directly came up as unformatted markup.
 */
const tokenChat = async (page) => {
  const tab = page.locator('.tm-tab', { hasText: 'CHAT' }).first()
  if (!(await tab.count())) throw new Error('no Chat tab on the token page')

  const padding = await page
    .locator('.tm-tab')
    .first()
    .evaluate((el) => getComputedStyle(el).padding)
  if (padding === '0px') throw new Error('the token page loaded without its stylesheet')

  await tab.click()
  await page.waitForTimeout(1600)

  const room = page.locator('.token-room')
  if (!(await room.count())) throw new Error('the Chat tab opened nothing')

  const height = await room.evaluate((el) => el.getBoundingClientRect().height)
  if (height < 100) throw new Error(`the room collapsed to ${Math.round(height)}px`)

  // The composer is the one control a chat cannot do without, and the first
  // thing a container with no height loses.
  if (!(await page.locator('.token-room .chat-composer').isVisible())) {
    throw new Error('the composer is not on screen')
  }
}

await run('token page / the chat tab', {
  path: `/token/${ADDRESS}`,
  token: true,
  steps: tokenChat,
})

await run('token page / the chat tab on a phone', {
  path: `/token/${ADDRESS}`,
  token: true,
  viewport: PHONE,
  steps: tokenChat,
})

await run('token page / chat with nothing said yet', {
  path: `/token/${ADDRESS}`,
  token: true,
  fixture: 'empty',
  steps: tokenChat,
})

await run('token page / chat on rows full of nulls', {
  path: `/token/${ADDRESS}`,
  token: true,
  fixture: 'nasty',
  steps: tokenChat,
})

/*
 * The dev badge, which is the one thing on this site that could be worth
 * money to somebody it should not be.
 *
 * The wording is asserted on rather than the markup, because the wording is
 * the feature. A badge that says "verified" is this site's credibility being
 * spent by whoever claimed a token last, and the person it will be spent by
 * is a rugger. If a future change makes this louder or shorter, this fails.
 */
await run('token page / the dev badge says only what it proves', {
  path: `/token/${ADDRESS}`,
  token: true,
  steps: async (page) => {
    await tokenChat(page)

    const badge = page.locator('.dev-badge').first()
    if (!(await badge.count())) throw new Error('no badge on a claimed token')

    const said = [
      (await badge.innerText()).toLowerCase(),
      ((await badge.getAttribute('title')) || '').toLowerCase(),
    ].join(' ')

    /*
     * Whole words, not substrings. The badge's own disclaimer contains
     * "safety check", and a substring match on "safe" fails the wording for
     * saying exactly the thing that makes it honest.
     */
    for (const forbidden of ['verified', 'official', 'trusted', 'safe', 'audited', 'legit']) {
      if (new RegExp(`\\b${forbidden}\\b`).test(said)) {
        throw new Error(`the badge says "${forbidden}", which it cannot prove`)
      }
    }
    if (!said.includes('creation transaction')) {
      throw new Error('the badge does not say what it actually proves')
    }
    if (!said.includes('not an endorsement')) {
      throw new Error('the badge does not disclaim being an endorsement')
    }
  },
})

await run('token page / a revoked claim draws no badge', {
  path: `/token/${ADDRESS}`,
  token: true,
  fixture: 'nasty',
  steps: async (page) => {
    await tokenChat(page)
    if (await page.locator('.dev-badge').count()) {
      throw new Error('a revoked or malformed claim was drawn as a badge')
    }
  },
})

await run('token page / claiming is offered when nobody has', {
  path: `/token/${ADDRESS}`,
  token: true,
  fixture: 'empty',
  steps: async (page) => {
    await tokenChat(page)
    const strip = page.locator('.token-claim')
    if (!(await strip.count())) throw new Error('no way to claim an unclaimed token')

    const note = (await strip.innerText()).toLowerCase()
    if (!note.includes('creation transaction')) {
      throw new Error('the claim prompt does not say what will be checked')
    }
  },
})

/*
 * Token rooms in the sidebar.
 *
 * They are listed from the `rooms` table rather than from the config file, so
 * unlike the five above them the list is whatever the database returns - and
 * a row whose slug is not an address has nowhere to link to. It must be left
 * out rather than drawn as an entry that goes nowhere.
 */
await run('chat / token rooms in the sidebar', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const listed = await page.locator('.room-item.is-token').count()
    if (listed !== 1) throw new Error(`expected one token room, drew ${listed}`)

    const label = await page.locator('.room-item.is-token .room-name').first().innerText()
    if (!label.startsWith('0x')) throw new Error(`a token room is labelled "${label}"`)
  },
  expectText: '41',
})

/*
 * Finding a room.
 *
 * Three stacked lists read fine at five rooms and stop reading at the first
 * busy week - a token room exists for every address anybody opens. What is
 * being checked here is not that a substring test works, which is in
 * src/utils/roomFilter.test.js, but the thing a unit test cannot see: that
 * what the sidebar *draws* is what can be typed. A token room has no name,
 * only "0xa107…9a27", and a reader typing the tail off the screen has to
 * find it - otherwise the list is showing a label that does not work as a
 * search term.
 */
await run('chat / finding a room by name', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const before = await page.locator('.room-item').count()
    if (before < 6) throw new Error(`only ${before} rooms to narrow`)

    await page.locator('.room-filter-input').fill('trench')
    await page.waitForTimeout(400)

    const names = (await page.locator('.room-name').allInnerTexts()).map((n) => n.trim())
    // The fixed room and the group named for it: a search is not confined to
    // one section.
    if (!names.includes('Trenches')) throw new Error(`the fixed room is gone: ${names.join('|')}`)
    if (!names.includes('The Trenches')) throw new Error(`the group is gone: ${names.join('|')}`)
    if (await page.locator('.room-item.is-token').count()) {
      throw new Error('a token room survived a term that does not match it')
    }
  },
})

await run('chat / finding a token room by what the list shows', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const label = (await page.locator('.room-item.is-token .room-name').first().innerText()).trim()

    // The tail of the shortened address, read off the screen and typed back.
    const tail = label.split('\u2026').pop()
    if (!tail || tail.length < 4) throw new Error(`nothing typeable in "${label}"`)

    await page.locator('.room-filter-input').fill(tail)
    await page.waitForTimeout(400)

    const found = await page.locator('.room-item.is-token').count()
    if (found !== 1) throw new Error(`typing "${tail}" off the screen found ${found} rooms`)
  },
})

await run('chat / a room filter that matches nothing', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    await page.locator('.room-filter-input').fill('nobody has a room called this')
    await page.waitForTimeout(400)

    if (await page.locator('.room-item').count()) throw new Error('something matched')
    if (!(await page.locator('.room-empty').count())) throw new Error('nothing said so')

    /* The hand-off. Somebody typing a person's name into a room filter has
       made a reasonable mistake, and being told only that no rooms matched
       leaves them believing the site cannot find people at all. */
    const out = page.locator('.room-empty-link')
    if (!(await out.count())) throw new Error('no way on to Discover')
    await out.click()
    await page.waitForTimeout(1200)

    const where = new URL(page.url()).pathname
    if (where !== '/discover') throw new Error(`the hand-off landed on ${where}`)

    /* And it carries what was typed. Landing on an empty search box would be
       a worse answer than the empty room list they were already looking at. */
    const carried = await page.locator('.discover-input').inputValue()
    if (!carried.startsWith('nobody has a room')) {
      throw new Error(`the term did not come along: "${carried}"`)
    }
  },
  expectText: 'Discover',
})

/*
 * A link to one message.
 *
 * `/r/<slug>#m<id>` is the shape a shared link takes, and the two halves fail
 * differently: the message is on this page, or it is further back than the
 * page reaches. The second is the one worth a scenario - somebody who
 * followed a link and landed on an ordinary-looking room believes the link
 * was broken, when what happened is the conversation moved on past it.
 */
await run('chat / a link to a message', {
  path: '/r/lounge#m1',
  steps: async (page) => {
    await page.waitForTimeout(1600)
    if (!(await page.locator('[data-message-id="1"]').count())) {
      throw new Error('the linked message is not on the page')
    }
  },
})

await run('chat / a link to a message further back', {
  path: '/r/lounge#m999999',
  steps: async (page) => {
    await page.waitForTimeout(1800)
    if (!(await page.getByText('further back').count())) {
      throw new Error('a link to a message nobody can see said nothing about it')
    }
  },
})

await run('chat / a fragment that is not a message id', {
  // Nonsense after the hash is a link to the room, not a broken page.
  path: '/r/lounge#mnope',
  steps: async (page) => {
    await page.waitForTimeout(1600)
    if (await page.getByText('further back').count()) {
      throw new Error('nonsense in the fragment was taken for a message')
    }
  },
})

await run('chat / a link to a message on a phone', {
  viewport: PHONE,
  path: '/r/lounge#m1',
})

await run('chat / a token room that cannot be linked to', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const listed = await page.locator('.room-item.is-token').count()
    // Two rows come back; one of them has a slug that is not an address.
    if (listed !== 1) throw new Error(`expected the unlinkable room to be dropped, drew ${listed}`)
  },
})

/*
 * Groups, and the holders-only rule.
 *
 * The rule is enforced on the write, server-side, so nothing a browser does
 * can be trusted to keep anybody out - which means what is being checked
 * here is the other half: that the room says what it requires before
 * somebody types, and says it in units a person recognises.
 */
await run('chat / groups are listed above the token rooms', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const headings = (await page.locator('.room-group').allInnerTexts()).map((h) => h.toLowerCase())
    if (!headings.includes('groups')) throw new Error('no Groups heading')

    const names = await page.locator('.room-item').allInnerTexts()
    if (!names.some((n) => n.includes('The Trenches'))) throw new Error('a group is missing')

    // The five are always first: they are the same on every deployment, and
    // a list whose top entries move is a list nobody learns.
    if (!names[0].includes('Lounge')) throw new Error(`the list starts with "${names[0]}"`)
  },
})

await run('chat / a gated group says so without saying how much', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const whales = page.locator('.room-item', { hasText: 'Whales' }).first()
    if (!(await whales.count())) throw new Error('the gated group is not listed')
    if (!(await whales.locator('.room-lock').count())) throw new Error('no padlock on a gated room')

    /*
     * A sidebar listing minimum holdings reads as a price list, so the
     * entry says "gated" and not "gated on this much". Asserted on the
     * room's own entry rather than on the whole column, which also holds
     * shortened addresses full of digits.
     */
    const entry = await whales.innerText()
    for (const leaked of ['1000', 'PLSX', ADDRESS.slice(0, 8)]) {
      if (entry.includes(leaked)) throw new Error(`the sidebar entry says "${leaked}"`)
    }
  },
})

await run('chat / a gated room states its rule in human units', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    await page.locator('.room-item', { hasText: 'Whales' }).first().click()
    await page.waitForTimeout(1500)

    const gate = page.locator('.chat-gate')
    if (!(await gate.count())) throw new Error('a gated room says nothing about its gate')

    const said = await gate.innerText()
    if (!said.includes('1000 PLSX')) throw new Error(`the gate reads "${said}"`)
    // 10^21 through a JavaScript number comes out as 1e+21.
    if (said.includes('e+')) throw new Error('the amount went through a float')

    // The composer stays: the check is on the write, so somebody who holds
    // the token must not be shut out of typing by a rule drawn in a browser.
    if (!(await page.locator('.chat-input').isVisible())) {
      throw new Error('a gated room hid the composer')
    }
  },
})

await run('chat / a broken gate is not drawn as a rule', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Rooms')(page)

    // Half a gate, and a gate of zero. Every address holds zero of every
    // token, so neither restricts anybody and neither may claim to.
    for (const name of ['Broken', 'Zero']) {
      const item = page.locator('.room-item', { hasText: name }).first()
      if (!(await item.count())) continue
      if (await item.locator('.room-lock').count()) {
        throw new Error(`"${name}" drew a padlock for a gate that gates nobody`)
      }

      await item.click()
      await page.waitForTimeout(1200)
      if (await page.locator('.chat-gate').count()) {
        throw new Error(`"${name}" stated a requirement it does not have`)
      }
    }
  },
})

await run('chat / groups on a phone', {
  viewport: PHONE,
  steps: async (page) => {
    await mobileTab('Social')(page)
    const t = page.locator('.social-tabs .xp-tab', { hasText: 'Rooms' }).first()
    if (!(await t.count())) throw new Error('no Rooms tab on a phone')
    await t.click()
    await page.waitForTimeout(1500)

    const whales = page.locator('.room-item', { hasText: 'Whales' }).first()
    if (!(await whales.count())) throw new Error('the gated group is not listed on a phone')
  },
})

await run('chat / an ordinary account cannot make a group', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    // The endpoint refuses one too, with a 404. This is only about not
    // drawing a control nobody can use.
    if (await page.locator('.room-new').count()) {
      throw new Error('a non-moderator was offered a way to create a group')
    }
  },
})

await run('chat / no token rooms yet', {
  fixture: 'empty',
  steps: async (page) => {
    await socialTab('Rooms')(page)
    if (await page.locator('.room-group').count()) {
      throw new Error('a "Tokens" heading over an empty list')
    }
  },
})
await run('direct / profile by address', { path: `/u/${ADDRESS}` })
await run('direct / profile by handle', { path: '/u/@degen' })
await run('direct / profile, nasty row', { path: `/u/${ADDRESS}`, fixture: 'nasty' })
await run('direct / profile, no such person', { path: `/u/${ADDRESS}`, fixture: 'empty' })
await run('direct / unknown path', { path: '/no/such/page' })

/*
 * A cold load of every social surface.
 *
 * The scenario the navigation work exists for, and the one that would have
 * caught every routing bug this codebase has had: a path typed into a fresh
 * tab has to render the right surface, not the home page with the address bar
 * insisting otherwise. Nothing is clicked - if the URL alone does not get
 * there, a link somebody shared does not work.
 */
const SURFACES = [
  ['/feed', 'Feed'],
  ['/discover', 'Discover'],
  ['/r/lounge', 'Rooms'],
  ['/r/trading', 'Rooms'],
  [`/r/token-${ADDRESS}`, 'Rooms'],
  ['/r/group-the-trenches', 'Rooms'],
]

/*
 * The two surfaces that are not tabs.
 *
 * They still have URLs and still render inside the section - they are just
 * reached from the chrome now. Checked separately because the assertion is
 * the opposite: the header names them and *no* tab is selected.
 */
const CHROME_SURFACES = [
  ['/notifications', 'Notifications'],
  ['/me', 'My Profile'],
  // One post, at /p/<id>. Reached from a notification and from a shared
  // link, so it is the same kind of surface as those two: no tab selected.
  ['/p/7', 'Post'],
]

for (const [path, expected] of CHROME_SURFACES) {
  await run(`direct / ${path}`, {
    path,
    steps: async (page) => {
      if (!(await page.locator('.social-tabs').count())) {
        throw new Error('the URL did not reach the social section')
      }

      const title = (await page.locator('.social-head-title h1').innerText()).trim()
      if (title !== expected) throw new Error(`the header says "${title}"`)

      if (await page.locator('.social-tabs .xp-tab.active').count()) {
        throw new Error('a tab is selected on a surface that is not one of the three')
      }

      // The row stays so there is a way back in. Without it, somebody on
      // their own inbox has only the browser's Back button.
      if ((await page.locator('.social-tabs .xp-tab').count()) !== 3) {
        throw new Error('the tab row is missing or the wrong size')
      }
    },
  })
}

for (const [path, expected] of SURFACES) {
  await run(`direct / ${path}`, {
    path,
    steps: async (page) => {
      /*
       * The sub-tab strip, not `.social-view` - ProfilePage carries that
       * class too, so a check on it passes on a page that is not the social
       * section at all. That mistake was made once while writing these.
       */
      if (!(await page.locator('.social-tabs').count())) {
        throw new Error('the URL did not reach the social section')
      }

      const active = (await page.locator('.social-tabs .xp-tab.active').first().innerText()).trim()
      if (active !== expected) throw new Error(`landed on "${active}" rather than "${expected}"`)

      // The address bar must still say what was asked for. A surface that
      // renders under a path it then rewrites is a link that changes when
      // somebody opens it.
      const pathname = new URL(page.url()).pathname
      if (pathname !== path) throw new Error(`the URL became ${pathname}`)
    },
  })
}

/*
 * A link to a room that is no longer there.
 *
 * Shared links outlive the things they point at, so this is the ordinary case
 * rather than the odd one. It has to land on the rooms surface - answering
 * with the home page would be answering a different question - and it has to
 * correct the address bar, so that whoever copies it next passes on a link
 * that works.
 */
await run('direct / a room that is not a room', {
  path: '/r/a-room-that-was-deleted',
  steps: async (page) => {
    if (!(await page.locator('.social-tabs').count())) {
      throw new Error('a dead room link left the social section')
    }

    const pathname = new URL(page.url()).pathname
    if (pathname !== '/r/lounge') {
      throw new Error(`the address bar still claims to be at ${pathname}`)
    }
  },
})

/*
 * Leaving the section has to take the URL with it.
 *
 * This once shipped with the section mounted over the home page: three hooks
 * shared one address bar, `closeToken` had already pushed `/`, and the check
 * here concluded there was nothing to do. There is one route now - see
 * src/utils/route.js - so leaving is arriving somewhere else rather than
 * three surfaces each shutting themselves. The scenario stays because the
 * symptom is what matters, whatever is underneath it.
 */
/*
 * The bell.
 *
 * The unread count used to be a badge on a sub-tab, which meant it was only
 * visible once you had already opened the section it was counting. The whole
 * point of moving it is that it is legible from the screener, so that is what
 * is checked: it is there on a tab that has nothing to do with the social
 * section, and pressing it lands on the inbox.
 */
await run('chrome / the bell is visible outside the social section', {
  steps: async (page) => {
    await tab('Screener')(page)

    const bell = page.locator('.notif-bell')
    if (!(await bell.isVisible())) throw new Error('no bell on the screener')

    // The count is in the label as well as the badge. A screen reader gets
    // nothing from a number in a span beside an icon called "Bell".
    const label = (await bell.getAttribute('aria-label')) || ''
    if (!/notification/i.test(label)) throw new Error(`the bell is labelled "${label}"`)
  },
})

await run('chrome / the bell opens the inbox', {
  steps: async (page) => {
    await tab('Screener')(page)
    await page.locator('.notif-bell').click()
    await page.waitForTimeout(1800)

    const pathname = new URL(page.url()).pathname
    if (pathname !== '/notifications') throw new Error(`landed on ${pathname}`)
    if (!(await page.locator('.social-tabs').count())) {
      throw new Error('the bell left the social section')
    }
  },
})

await run('chrome / no bell when signed out', {
  signedIn: false,
  steps: async (page) => {
    await tab('Screener')(page)
    // A bell that is always empty teaches people to ignore the one control
    // on this bar that is allowed to demand attention.
    if (await page.locator('.notif-bell').count()) {
      throw new Error('a signed-out visitor was shown a notification bell')
    }
  },
})

await run('chat / the row is three, and none of them is the inbox', {
  steps: async (page) => {
    await socialTab('Rooms')(page)

    const names = (await page.locator('.social-tabs .xp-tab').allInnerTexts()).map((n) => n.trim())
    if (names.length !== 3) throw new Error(`the row has ${names.length} tabs: ${names.join('/')}`)
    if (names.join('|') !== 'Feed|Rooms|Discover') throw new Error(names.join('|'))

    // The badge moved to the chrome. One left behind here would mean two
    // places claiming to be the count, which is how they drift apart.
    if (await page.locator('.social-tabs .xp-tab-badge').count()) {
      throw new Error('an unread badge is still on a sub-tab')
    }
  },
})

await run('chat / leaving the section clears the URL', {
  path: '/r/trading',
  steps: async (page) => {
    await tab('Home')(page)
    const pathname = new URL(page.url()).pathname
    if (pathname !== '/') throw new Error(`the URL is still ${pathname}`)
    if (await page.locator('.social-tabs').count()) {
      throw new Error('the social section is still on screen over Home')
    }
  },
})

// Behind the account menu.
await run('account / Profile settings', { steps: accountMenu('Profile settings') })
await run('account / My public profile', { steps: accountMenu('My public profile') })

/*
 * Switching faster than the fetches settle.
 *
 * Each tab mounts, fires its queries and subscribes to a realtime channel; a
 * fast switch unmounts it mid-flight. A setState after unmount, a channel that
 * outlives its tab or a response landing on a dead component all show up here
 * and nowhere else.
 */
await run('races / hammer the tabs', {
  steps: async (page) => {
    for (let i = 0; i < 3; i += 1) {
      for (const t of TABS) {
        const btn = page.locator('.btn-tab', { hasText: t }).first()
        if (await btn.count()) await btn.click()
        await page.waitForTimeout(60)
      }
    }
    await page.waitForTimeout(2500)
  },
})

await run('races / hammer the social tabs', {
  steps: async (page) => {
    await tab('Social')(page)
    for (let i = 0; i < 4; i += 1) {
      for (const t of ['Feed', ...SOCIAL]) {
        const el = page.locator('.social-tabs .xp-tab', { hasText: t }).first()
        if (await el.count()) await el.click()
        await page.waitForTimeout(50)
      }
    }
    await page.waitForTimeout(2500)
  },
})

/*
 * The room list, which used to be five identical words.
 *
 * A badge has to appear on a room with something in it, never on the room
 * being read - that one is being read - and a big number has to stay inside
 * the sidebar rather than pushing the names out of it.
 */
await run('chat / unread badges', {
  steps: socialTab('Rooms'),
  expectText: '99+',
})

/*
 * Opening a room is reading it, and the badge has to go straight away -
 * waiting for the server to agree would leave a count over a conversation
 * plainly already open.
 */
await run('chat / opening a room clears its badge', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const trading = page.locator('.room-item', { hasText: 'Trading' }).first()
    if (!(await trading.count())) throw new Error('no Trading room in the list')

    const before = await trading.locator('.room-unread').count()
    if (before === 0) throw new Error('Trading had no badge to clear')

    await trading.click()
    await page.waitForTimeout(1200)

    if (await trading.locator('.room-unread').isVisible().catch(() => false)) {
      throw new Error('the room being read is still badged')
    }
  },
})

await run('chat / no badges when nothing is unread', {
  fixture: 'empty',
  steps: socialTab('Rooms'),
})

await run('chat / signed out has no badges to fetch', {
  signedIn: false,
  steps: socialTab('Rooms'),
})

/*
 * Replying, on rows where everything that can be null is.
 *
 * The quote above a reply is a join, so it arrives null for a hard-deleted
 * original and with a null profile for an author who never made one. Drawing
 * it is the only place in the chat that renders one message inside another,
 * and the check that matters is the one below: a removed original must show
 * that it was removed and not its text.
 */
await run('chat / a quoted message with nothing in it', {
  fixture: 'nasty',
  steps: socialTab('Rooms'),
  expectText: 'message removed',
})

await run('chat / the quote never shows a removed message', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const quoted = await page.locator('.chat-quote-body').first().innerText()
    if (quoted.length > 200) throw new Error('a removed message was quoted in full')
  },
})

/*
 * Searching a room.
 *
 * The term is whatever somebody typed, and both the query and the highlight
 * are built from it - so the scenarios that matter are the ones where that
 * text is a wildcard, a regular expression, or longer than the box.
 */
const search = (term, { phone = false } = {}) => async (page) => {
  // The room is reached through the bottom nav on a phone: the tab strip
  // along the top is not on screen at that width, so the desktop route here
  // would time out waiting for a button nobody can press.
  if (phone) {
    await mobileTab('Social')(page)
    const t = page.locator('.social-tabs .xp-tab', { hasText: 'Rooms' }).first()
    if (!(await t.count())) throw new Error('no Rooms tab on a phone')
    await t.click()
    await page.waitForTimeout(1400)
  } else {
    await socialTab('Rooms')(page)
  }
  const box = page.locator('.chat-search-input').first()
  if (!(await box.count())) throw new Error('no search box in the room')
  await box.fill(term)
  await page.waitForTimeout(1200)
  if (await page.locator('.chat-scroll').isVisible()) {
    throw new Error('the conversation is still on screen under the results')
  }
}

await run('chat / searching a room', { steps: search('gm') })
await run('chat / searching on a phone', { viewport: PHONE, steps: search('gm', { phone: true }) })
await run('chat / searching for a wildcard', { steps: search('%_%') })
await run('chat / searching with a regular expression', { steps: search('(a|b)[c-z]*+?$') })
await run('chat / searching a room with nothing in it', {
  fixture: 'empty',
  steps: search('anything'),
  expectText: 'Nothing in this room matches',
})
await run('chat / searching for something absurd', { steps: search(HUGE.slice(0, 500)) })
/*
 * Not here: a search the database refuses.
 *
 * With the database answering 500 the room itself never loads, so the panel
 * is a failure notice and there is no search box to type in - the scenario
 * would be asserting on a control that correctly does not exist. The case
 * that would be worth covering is a room that loaded and a search that then
 * failed, and this harness fails the two together.
 */

/*
 * The inbox, which is the one surface here that is about one person.
 *
 * Signed out it must offer a reason to sign in rather than an empty list or a
 * crash; signed in with nothing in it, the empty state has to say what would
 * fill it, because on a new account that is the ordinary state and not a
 * failure.
 */
/*
 * Signed out there is no bell to press - which is the point of it, and is
 * asserted just below - so the inbox is reached by its URL, as somebody
 * following a link they were sent would reach it.
 */
await run('notifications / signed out', {
  signedIn: false,
  path: '/notifications',
  expectText: 'Sign in',
})

await run('notifications / signed out has no bell to press', {
  signedIn: false,
  steps: async (page) => {
    if (await page.locator('.notif-bell').count()) {
      throw new Error('a bell nobody can have notifications for')
    }
  },
})

await run('notifications / with unread', {
  steps: bell,
  expectText: 'mentioned you',
})

await run('notifications / empty inbox', {
  fixture: 'empty',
  path: '/notifications',
  expectText: 'Nothing yet',
})

/*
 * From a phone, and from another tab entirely.
 *
 * Both halves matter: the bell is in the nav bar rather than in the section,
 * so it has to survive the phone layout, and it has to work from the tab
 * somebody is actually on - which on a screener is not the social one.
 */
/*
 * A notification that opens what it is about.
 *
 * The thing an inbox is for, and the last of it to be built: until the
 * surfaces had URLs, "somebody mentioned you" could only open that person's
 * profile - which answers who and not what.
 *
 * The row that matters most here is the one that is NOT a link. A reaction is
 * addressed by room and id together, and a deployment whose query predates the
 * room embed sends the id alone; that row has to stay as text, because a
 * button that does nothing reads as the site being broken rather than as the
 * thing being gone.
 */
await run('notifications / a mention opens its post', {
  steps: async (page) => {
    await bell(page)
    const open = page.locator('.notif-row').first().locator('.notif-open').first()
    if (!(await open.count())) throw new Error('the mention is not a link')
    await open.click()
    await page.waitForTimeout(1600)

    const where = new URL(page.url()).pathname
    if (where !== '/p/7') throw new Error(`a mention opened ${where}`)
  },
  expectText: 'Post',
})

await run('notifications / a reaction opens its message, in its room', {
  steps: async (page) => {
    await bell(page)
    const row = page.locator('.notif-row').nth(2)
    const open = row.locator('.notif-open').first()
    if (!(await open.count())) throw new Error('the reaction is not a link')
    await open.click()
    await page.waitForTimeout(1800)

    const url = new URL(page.url())
    if (url.pathname !== '/r/lounge') throw new Error(`a reaction opened ${url.pathname}`)
    if (url.hash !== '#m5') throw new Error(`without naming the message: ${url.hash || '(none)'}`)
  },
})

await run('notifications / a row with nowhere to go is not a button', {
  fixture: 'nasty',
  steps: async (page) => {
    await bell(page)
    // The nasty fixture's reaction carries no room, so it cannot be located.
    const row = page.locator('.notif-row').nth(2)
    if (!(await row.count())) throw new Error('the reaction row is missing')
    if (await row.locator('.notif-open').count()) {
      throw new Error('a row with nothing to open was drawn as a link')
    }
    // It still has to say what happened.
    const said = await row.innerText()
    if (!/reacted/i.test(said)) throw new Error(`it says "${said.trim()}"`)
  },
})

/*
 * A post that is not there.
 *
 * A shared link outlives what it points at, so this is the ordinary case
 * rather than the odd one. Removed and never-existed are answered the same
 * way on purpose: telling a stranger which would say that something was
 * deleted, and who deleted a post is not a fact this page owes anybody.
 */
await run('direct / a post that is gone', {
  fixture: 'empty',
  path: '/p/7',
  expectText: 'not here',
})

await run('direct / a post id that is not one', {
  // bigserial starts at one, so a zero in a link is a broken link. It lands
  // on the feed rather than on the home page or a blank surface.
  path: '/p/0',
  steps: async (page) => {
    const where = new URL(page.url()).pathname
    if (where !== '/feed') throw new Error(`/p/0 settled on ${where}`)
  },
})

await run('direct / a post on a phone', {
  viewport: PHONE,
  path: '/p/7',
})

/*
 * Handing over a link.
 *
 * What three batches of URL work were for. Until this control existed only
 * somebody who thought to read the address bar could take a link, which on a
 * phone - where most of this is read - means almost nobody.
 */
/*
 * A room whose rule changed says so.
 *
 * The other half of being able to change a gate. Somebody who could post
 * yesterday and cannot today is owed a reason, and a composer that silently
 * stops working is not one. Drawn for everybody in the room rather than only
 * for the people it locked out - somebody who still qualifies is entitled to
 * know the room now has a requirement.
 */
await run('rooms / a changed rule is said out loud', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const group = page.locator('.room-item', { hasText: 'Whales' }).first()
    if (!(await group.count())) throw new Error('the gated group is not listed')
    await group.click()
    await page.waitForTimeout(1800)

    const said = await page.locator('main').innerText()
    if (!/changed/i.test(said)) throw new Error('the room says nothing about the change')
  },
})

await run('rooms / a change with nothing in it is not drawn as a rule', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const group = page.locator('.room-item', { hasText: 'Trenches' }).first()
    if (await group.count()) {
      await group.click()
      await page.waitForTimeout(1600)
    }
    /* The nasty row has every column null, which means the gate was removed.
       It must read as opening the room, never as a requirement of nothing -
       "holders of null" is the shape of bug that gates a room against
       everybody. */
    const said = await page.locator('main').innerText()
    if (/null|undefined|NaN/i.test(said)) throw new Error(`the room says "${said.slice(0, 120)}"`)
  },
})

/*
 * A room that has been taken down.
 *
 * In production the anon read policy hides it, so this never reaches the
 * browser. Checked anyway, because a fixture that answers every select the
 * same way is exactly the deployment where the policy has not been run - and
 * a room nobody can post in sitting in everybody's sidebar is the failure
 * archiving exists to prevent.
 */
await run('rooms / an archived group is not listed', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const names = (await page.locator('.room-name').allInnerTexts()).map((n) => n.trim())
    if (names.includes('Gone')) throw new Error(`the sidebar lists it: ${names.join('|')}`)
  },
})

/*
 * Managing a room is a moderator's, and the control is not the permission.
 *
 * ADMIN_ADDRESSES is not set in this harness, so nobody here is a moderator -
 * which makes this the check that matters: the controls must be absent for an
 * ordinary account. The endpoint refuses them again regardless; a button that
 * is not drawn is not a permission, it is a request somebody can send without
 * it.
 */
await run('rooms / an ordinary account cannot manage a room', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const group = page.locator('.room-item', { hasText: 'Trenches' }).first()
    if (await group.count()) {
      await group.click()
      await page.waitForTimeout(1400)
    }
    const said = await page.locator('main').innerText()
    if (/Take down/i.test(said)) throw new Error('an ordinary account is offered a way to take a room down')
    if (await page.locator('.room-admin').count()) throw new Error('the manage form is on screen')
  },
})

/*
 * The screener says which tokens anybody is talking about.
 *
 * The last thing closing the loop between the two halves of this app. The
 * token page has had a Chat tab since token rooms existed; until now the
 * screener could not say which of a hundred rows was being discussed,
 * although `rooms` has carried the count since 0014 for exactly this.
 */
await run('screener / a token being talked about says so', {
  steps: async (page) => {
    await tab('Screener')(page)
    await page.waitForTimeout(1800)

    const badges = page.locator('.sidebar-talk')
    if (!(await badges.count())) throw new Error('no row says anything is being discussed')

    // Never a zero. A badge on every row is a column of zeroes, and one that
    // is always there has stopped being a signal.
    for (const text of await badges.allInnerTexts()) {
      const said = text.trim()
      if (!said || said === '0') throw new Error(`a row is badged "${said}"`)
    }

    /*
     * And only the row it is about. Two pairs are fixtured and only one has a
     * room, so a badge on both would mean the lookup is matching everything -
     * which is the failure that looks like the feature working.
     */
    const rows = await page.locator('.sidebar-pair-item').count()
    if (rows < 2) throw new Error(`only ${rows} rows to tell apart`)
    if ((await badges.count()) >= rows) {
      throw new Error(`every one of ${rows} rows is badged`)
    }
  },
})

await run('screener / the badge opens the room, not the chart', {
  steps: async (page) => {
    await tab('Screener')(page)
    await page.waitForTimeout(1800)

    const badge = page.locator('.sidebar-talk').first()
    if (!(await badge.count())) throw new Error('nothing to press')
    await badge.click()
    await page.waitForTimeout(1800)

    const where = new URL(page.url()).pathname
    if (!where.startsWith('/r/token-')) throw new Error(`the badge opened ${where}`)
    if (!(await page.locator('.social-tabs').count())) {
      throw new Error('it did not land in the social section')
    }
  },
})

await run('screener / no badges when nothing is being said', {
  fixture: 'empty',
  steps: async (page) => {
    await tab('Screener')(page)
    await page.waitForTimeout(1600)
    if (await page.locator('.sidebar-talk').count()) {
      throw new Error('a badge was drawn for a room with nothing in it')
    }
  },
})

await run('share / a room, a message and a post', {
  steps: async (page) => {
    await socialTab('Rooms')(page)

    const room = page.locator('.social-head .share-button')
    if ((await room.count()) !== 1) throw new Error('the room offers no link')

    const rows = await page.locator('.chat-row').count()
    const onRows = await page.locator('.chat-row .share-button').count()
    if (rows > 0 && onRows !== rows) {
      throw new Error(`${onRows} of ${rows} messages offer a link`)
    }

    // Pressing it must answer, whether or not this browser allows the copy.
    await room.click()
    await page.waitForTimeout(400)
    const copied = await room.evaluate((el) => el.classList.contains('is-copied'))
    const title = (await room.getAttribute('title')) || ''
    if (!copied && !title.includes('/r/')) {
      throw new Error(`pressing it said nothing: title="${title}"`)
    }
  },
})

await run('share / a post offers one too', {
  path: '/p/7',
  steps: async (page) => {
    if (!(await page.locator('.feed-post .share-button').count())) {
      throw new Error('a post offers no link')
    }
  },
})

/*
 * Picking somebody to mention.
 *
 * The only way to name an account whose handle contains a space, which is why
 * `post_mentions` stores addresses rather than parsing text. Offered in the
 * post composer and deliberately not in the chat one, where a mention
 * notifies nobody.
 */
await run('mentions / the composer offers names', {
  steps: async (page) => {
    await tab('Social')(page)
    const box = page.locator('.feed-input').first()
    if (!(await box.count())) throw new Error('no composer')

    await box.click()
    await box.type('hey @deg')
    await page.waitForTimeout(900)

    const list = page.locator('.mention-options')
    if (!(await list.count())) throw new Error('typing a name offered nobody')

    const handles = await page.locator('.mention-handle').allInnerTexts()
    if (!handles.some((h) => h.toLowerCase().includes('deg'))) {
      throw new Error(`offered ${handles.join('|')}`)
    }

    // Every option names the address as well. A handle is chosen, and being
    // mistaken for somebody trusted is worth money on a site like this.
    if ((await page.locator('.mention-address').count()) !== handles.length) {
      throw new Error('a name was offered without its address')
    }

    await page.locator('.mention-option').first().click()
    await page.waitForTimeout(500)

    const value = await box.inputValue()
    if (!value.startsWith('hey @')) throw new Error(`picking produced "${value}"`)
    if (value.includes('\n')) throw new Error('picking added a paragraph')
    if (await list.count()) throw new Error('the list stayed open after a pick')
  },
})

await run('mentions / an email address is not one', {
  steps: async (page) => {
    await tab('Social')(page)
    const box = page.locator('.feed-input').first()
    await box.click()
    await box.type('mail me at someone@example')
    await page.waitForTimeout(900)
    if (await page.locator('.mention-options').count()) {
      throw new Error('an email address opened a picker')
    }
  },
})

await run('mentions / the chat composer offers none', {
  steps: async (page) => {
    await socialTab('Rooms')(page)
    const box = page.locator('.chat-composer textarea, .chat-composer input').first()
    if (!(await box.count())) return

    await box.click()
    await box.type('hey @deg')
    await page.waitForTimeout(900)
    /* A chat message records no mentions and notifies nobody, so a list here
       would invite naming somebody who would never be told. */
    if (await page.locator('.mention-options').count()) {
      throw new Error('the chat composer offered a mention list')
    }
  },
})

await run('notifications / phone', {
  viewport: PHONE,
  steps: bell,
  expectText: 'mentioned you',
})

await run('notifications / from the screener', {
  steps: async (page) => {
    await tab('Screener')(page)
    await bell(page)
  },
  expectText: 'mentioned you',
})

/*
 * A phone with no wallet on it.
 *
 * The commonest way anybody reaches this app from a phone, and it used to end
 * at a sentence telling the reader to open the page inside their wallet app
 * with nothing to tap that would do it: the links that do live in the wallet
 * modal, and nothing on a phone opened that. A dead end describing the way out
 * is still a dead end.
 */
await run('phone / no wallet has a way out', {
  viewport: PHONE,
  signedIn: false,
  steps: async (page) => {
    const btn = page.locator('.account-btn').first()
    if (!(await btn.count())) throw new Error('no sign-in button on a phone')
    await btn.click()
    await page.waitForTimeout(2500)

    const route = page.locator('.account-wallet-route').first()
    if (!(await route.count())) throw new Error('no wallet found, and no way offered to get one')
    await route.click()
    await page.waitForTimeout(1200)

    const offers = await page.locator('.wallet-option-item').count()
    if (offers === 0) throw new Error('the way out opens on an empty list')
  },
})

/* Back and forward across a route that takes over the content area. */
await run('history / back out of a profile', {
  steps: async (page) => {
    await page.goto(`${BASE}/u/${ADDRESS}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.goBack()
    await page.waitForTimeout(900)
    await page.goForward()
    await page.waitForTimeout(1200)
  },
})

await browser.close()

/* --------------------------------------------------------------- report -- */

const failed = results.filter((r) => r.errors.length)
const bad = failed.length

if (bad) {
  console.log('\n--- failures ---')
  for (const r of failed) {
    console.log(`\nFAIL  ${r.name}`)
    for (const e of r.errors) console.log(`      ${e}`)
  }
}

console.log(
  bad
    ? `\n${bad} of ${results.length} scenarios have problems`
    : `\nAll ${results.length} scenarios came up clean`
)
process.exit(bad ? 1 : 0)

