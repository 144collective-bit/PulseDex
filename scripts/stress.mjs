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
  profiles: null,
  message_reactions: null,
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
    return []
  },
  /** Nulls everywhere a column is nullable, and a body nobody would type. */
  nasty: (table) => {
    if (table === 'profiles') return [NASTY_PROFILE]
    if (table === 'posts') return [NASTY_POST]
    if (table === 'messages') return [NASTY_MESSAGE]
    return []
  },
  /** Nothing at all - the state every one of these tables starts in. */
  empty: () => [],
}

/** Answer the database, the session and the app's own endpoints. */
async function wire(page, { fixture = 'healthy', signedIn = true, apiStatus = 200 } = {}) {
  // Nothing leaves localhost, so the run says the same thing everywhere.
  await page.route('**/*', (route) =>
    route.request().url().startsWith(BASE) ? route.continue() : route.abort()
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
            },
          ]
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ notifications: rows, unread: rows.filter((r) => !r.read_at).length }),
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

