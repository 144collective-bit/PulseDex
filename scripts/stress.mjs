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
    return []
  },
  /** Nulls everywhere a column is nullable, and a body nobody would type. */
  nasty: (table) => {
    if (table === 'profiles') return [NASTY_PROFILE]
    if (table === 'posts') return [NASTY_POST]
    if (table === 'messages') return [NASTY_MESSAGE, NASTY_REPLY]
    if (table === 'rooms') return [NASTY_ROOM, TOKEN_ROOM, BROKEN_GATE, ZERO_GATE]
    // A revoked claim and one with nothing in it. Neither may draw a badge.
    if (table === 'token_claims')
      return [REVOKED_CLAIM, { token_address: null, address: null, claimed_at: null, revoked_at: null }]
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

  const state = await page.evaluate(() => {
    const root = document.getElementById('root')
    const main = document.querySelector('main')
    return {
      mounted: Boolean(root && root.children.length),
      mainLen: (main?.innerText || '').trim().length,
      // A wider page than the viewport is a horizontal scrollbar on a phone.
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })

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
  await tab('Chat')(page)
  const t = page.locator('.social-tabs .xp-tab', { hasText: label }).first()
  if (!(await t.count())) throw new Error(`no "${label}" social tab`)
  await t.click()
  await page.waitForTimeout(1400)
}

/* ------------------------------------------------------------ scenarios -- */

const TABS = ['Home', 'Screener', 'Trenches', 'Chat', 'Portfolio']
const SOCIAL = ['My Profile', 'Chat Rooms', 'Discover', 'Notifications']

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
    await socialTab('Chat Rooms')(page)
    const listed = await page.locator('.room-item.is-token').count()
    if (listed !== 1) throw new Error(`expected one token room, drew ${listed}`)

    const label = await page.locator('.room-item.is-token .room-name').first().innerText()
    if (!label.startsWith('0x')) throw new Error(`a token room is labelled "${label}"`)
  },
  expectText: '41',
})

await run('chat / a token room that cannot be linked to', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Chat Rooms')(page)
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
    await socialTab('Chat Rooms')(page)
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
    await socialTab('Chat Rooms')(page)
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
    await socialTab('Chat Rooms')(page)
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
    await socialTab('Chat Rooms')(page)

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
    await mobileTab('Chat')(page)
    const t = page.locator('.social-tabs .xp-tab', { hasText: 'Chat Rooms' }).first()
    if (!(await t.count())) throw new Error('no Chat Rooms tab on a phone')
    await t.click()
    await page.waitForTimeout(1500)

    const whales = page.locator('.room-item', { hasText: 'Whales' }).first()
    if (!(await whales.count())) throw new Error('the gated group is not listed on a phone')
  },
})

await run('chat / an ordinary account cannot make a group', {
  steps: async (page) => {
    await socialTab('Chat Rooms')(page)
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
    await socialTab('Chat Rooms')(page)
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
    await tab('Chat')(page)
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
  steps: socialTab('Chat Rooms'),
  expectText: '99+',
})

/*
 * Opening a room is reading it, and the badge has to go straight away -
 * waiting for the server to agree would leave a count over a conversation
 * plainly already open.
 */
await run('chat / opening a room clears its badge', {
  steps: async (page) => {
    await socialTab('Chat Rooms')(page)
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
  steps: socialTab('Chat Rooms'),
})

await run('chat / signed out has no badges to fetch', {
  signedIn: false,
  steps: socialTab('Chat Rooms'),
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
  steps: socialTab('Chat Rooms'),
  expectText: 'message removed',
})

await run('chat / the quote never shows a removed message', {
  fixture: 'nasty',
  steps: async (page) => {
    await socialTab('Chat Rooms')(page)
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
    await mobileTab('Chat')(page)
    const t = page.locator('.social-tabs .xp-tab', { hasText: 'Chat Rooms' }).first()
    if (!(await t.count())) throw new Error('no Chat Rooms tab on a phone')
    await t.click()
    await page.waitForTimeout(1400)
  } else {
    await socialTab('Chat Rooms')(page)
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
await run('notifications / signed out', {
  signedIn: false,
  steps: socialTab('Notifications'),
  expectText: 'Sign in',
})

await run('notifications / with unread', {
  steps: socialTab('Notifications'),
  expectText: 'mentioned you',
})

await run('notifications / empty inbox', {
  fixture: 'empty',
  steps: socialTab('Notifications'),
  expectText: 'Nothing yet',
})

await run('notifications / phone', {
  viewport: PHONE,
  steps: async (page) => {
    await mobileTab('Chat')(page)
    const t = page.locator('.social-tabs .xp-tab', { hasText: 'Notifications' }).first()
    if (!(await t.count())) throw new Error('no Notifications tab on a phone')
    await t.click()
    await page.waitForTimeout(1400)
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

