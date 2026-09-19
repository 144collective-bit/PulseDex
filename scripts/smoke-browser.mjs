import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

/**
 * Drive the built app in a real browser and report what it does.
 *
 * The companion to measure-queries.mjs: that one counts round trips, this one
 * asks whether the page came up at all. Between them they cover the thing no
 * other check here can see - lint reads syntax, the suite runs pure
 * functions, check:api imports modules without calling them, the build
 * compiles, and smoke asks a deployment whether it answers. None of them
 * opens a page, so a component that throws on mount passes all five and shows
 * a white screen.
 *
 * Usage:
 *
 *   npm run build && npx vite preview --port 4317 &
 *   node scripts/smoke-browser.mjs http://127.0.0.1:4317
 *
 * Every outbound request fails in a sandbox with no network, so those errors
 * are filtered out by name. What is left is the app's own: an uncaught
 * exception, a component that renders nothing, a local asset that 404s.
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4317'

/*
 * Where Chromium is.
 *
 * Two environments, two answers. A sandbox has one pre-installed at a fixed
 * path and no way to download another; CI runs `playwright install`, which
 * puts it where Playwright looks by default. Pinning the sandbox path
 * unconditionally is why this could not run on GitHub at all - so the path is
 * used only when something is actually there, and otherwise Playwright is left
 * to find its own.
 */
const SANDBOX_CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
  args: ['--no-sandbox'],
})

const results = []

/** Open one route, do something, and report every error and request. */
async function visit(name, steps, setup, expect = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  const failed = []
  const requests = []

  /*
   * Every request that would leave localhost is aborted below, so the app's
   * outbound calls all fail. Those errors say something about the harness and
   * nothing about the app, and left in they drown out the ones that matter.
   * This stays as a backstop for anything that slips past the block - a
   * request issued by the browser itself rather than by the page, say.
   */
  const environmental =
    /ERR_TUNNEL_CONNECTION_FAILED|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|Failed to fetch|NetworkError|net::ERR_|WebSocket connection to|tunnel via proxy|blocked by CORS policy|Access to fetch at|Access-Control-Allow-Origin/i

  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (environmental.test(text)) return
    errors.push(text.slice(0, 240))
  })
  // An uncaught exception is always the app's, whatever caused it - this is
  // what a white screen looks like from the outside.
  page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`.slice(0, 240)))
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText || ''
    // The sandbox has no outbound network, so anything leaving localhost is
    // expected to fail and says nothing about the app.
    if (r.url().startsWith(BASE)) failed.push(`${r.url().replace(BASE, '')} ${why}`)
  })
  page.on('request', (r) => requests.push(r.url()))

  /*
   * Nothing leaves localhost.
   *
   * Registered before setup's own routes, which Playwright then matches first,
   * so a case can still answer a specific request - this only catches what is
   * left. It is what makes the harness say the same thing everywhere: in a
   * sandbox with no network the app's outbound calls fail as connection
   * errors, and on a CI runner, which does have network, the very same calls
   * reach real hosts and come back as CORS failures instead. Filtering by the
   * wording of the failure meant the check passed here and failed on GitHub.
   * Not making the calls at all leaves one behaviour to reason about, and the
   * external services out of a result that is supposed to be about this app.
   */
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith(BASE)) return route.continue()
    return route.abort()
  })

  if (setup) await setup(page)

  const started = Date.now()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 })
  // Let React mount and any on-mount effects fire.
  await page.waitForTimeout(1500)

  if (steps) {
    try {
      await steps(page)
    } catch (err) {
      errors.push(`STEP FAILED: ${err.message}`.slice(0, 240))
    }
  }
  await page.waitForTimeout(1200)

  const rendered = await page.evaluate(() => {
    const root = document.getElementById('root')
    const text = root?.innerText || ''
    return { hasContent: Boolean(root && root.children.length), text: text.slice(0, 120), full: text }
  })

  results.push({
    name,
    ms: Date.now() - started,
    // A case that provokes a failure on purpose says which one, so the noise it
    // creates is not read as the app breaking - and anything else still is.
    errors: expect.allow ? errors.filter((e) => !expect.allow.test(e)) : errors,
    failed: expect.allow ? failed.filter((f) => !expect.allow.test(f)) : failed,
    local: requests.filter((u) => u.startsWith(BASE)).length,
    rendered,
    missing: expect.text && !rendered.full.includes(expect.text) ? expect.text : null,
  })

  await page.close()
}

const clickTab = (label) => async (page) => {
  const tab = page.locator('.btn-tab', { hasText: 'Chat' }).first()
  if (await tab.count()) await tab.click()
  await page.waitForTimeout(700)
  if (label) {
    const t = page.locator('.social-tabs .xp-tab', { hasText: label }).first()
    if (await t.count()) await t.click()
  }
}

/*
 * A signed-in session, faked at the network layer.
 *
 * Profile settings lives behind the account menu and the account menu needs a
 * session, so without this there is no way in - which is exactly how a blank
 * Profile settings page reached production while every check here passed. The
 * app decides it is signed in from /api/auth/me and nothing else, so answering
 * that one request is the whole of it. No wallet, no key, no signature.
 */
const ADDRESS = '0x1111111111111111111111111111111111111111'

const signedIn = async (page) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: ADDRESS }) })
  )
  /*
   * And the database, so the public page has a profile to draw rather than the
   * "could not load" state every fetch gets in a sandbox with no network. The
   * rows are the shape PostgREST returns, which is all these surfaces read.
   */
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const table = path.split('/rest/v1/')[1]?.split('?')[0] || ''
    const body =
      table === 'profiles'
        ? [{
            address: ADDRESS,
            handle: 'smoketest',
            avatar_id: null,
            avatar_url: null,
            banner_url: null,
            bio: 'gm',
            links: [],
            created_at: '2025-01-01T00:00:00.000Z',
          }]
        : []
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/1' },
      body: JSON.stringify(body),
    })
  })
  await page.route('**/realtime/**', (route) => route.abort())

  await page.route('**/api/profile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: ADDRESS,
        handle: 'smoketest',
        avatarId: null,
        avatarUrl: null,
        bannerUrl: null,
        bio: 'gm',
        links: [{ url: 'https://example.com', host: 'example.com' }],
      }),
    })
  )
}

/** Open the account menu and pick an item from it. */
const fromAccountMenu = (label) => async (page) => {
  const button = page.locator('.account-btn').first()
  if (!(await button.count())) throw new Error('no account button - is the session mock answering?')
  await button.click()
  await page.waitForTimeout(400)
  const item = page.locator('.account-menu-item', { hasText: label }).first()
  if (!(await item.count())) throw new Error(`no "${label}" in the account menu`)
  await item.click()
}

/*
 * A tab left open across a deployment.
 *
 * Every chunk carries a content hash, so a deploy replaces the whole set and
 * the already-loaded index.html names files the domain no longer serves. The
 * next tab the reader opens 404s. Before src/utils/lazyRetry.js this unmounted
 * the entire app - a white screen on a click that worked a minute earlier -
 * which is the bug this case exists to keep fixed.
 */
const staleDeployment = async (page) => {
  await signedIn(page)
  await page.route(/\/assets\/(ProfileView|profile)-[^/]*\.js$/, (route) =>
    route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html>' })
  )
}

await visit('home (cold load)', null)
await visit('social: Feed', clickTab(null))
await visit('social: My Profile', clickTab('My Profile'))
await visit('social: Chat Rooms', clickTab('Chat Rooms'))
await visit('social: Discover', clickTab('Discover'))
// Each asserts on text only that surface renders, so "it came up" cannot be
// satisfied by the shell around it staying on screen.
await visit('account: Profile settings', fromAccountMenu('Profile settings'), signedIn, {
  text: 'Identity & Profile',
})
await visit('account: My public profile', fromAccountMenu('My public profile'), signedIn, {
  text: 'Followers',
})

/*
 * The recovery, end to end.
 *
 * First click: the chunk 404s twice, so lazyRetry reloads - which lands back
 * on Home with the guard set. Second click: it 404s again, the guard says the
 * reload has been spent, and the boundary says so in words. What must never
 * happen at either step is the thing that shipped - the whole app unmounting
 * and leaving an empty <div id="root">.
 */
await visit(
  'stale deploy: chunk 404 recovers',
  async (page) => {
    await fromAccountMenu('Profile settings')(page)
    await page.waitForTimeout(3000)

    /*
     * The first failure must be recovered from, not reported. lazyRetry tries
     * again and then reloads, which lands back on Home with a working build's
     * index.html - so what the reader sees is a blink, not an error. Showing
     * the boundary here instead would mean the retry never ran.
     */
    const afterReload = await page.locator('#root').innerText()
    if (!afterReload.trim()) throw new Error('blank page after the first failure')
    if (afterReload.includes('This page has been updated')) {
      throw new Error('gave up on the first failure - no retry, no reload')
    }

    // Second time, with the reload already spent, it has to say so in words.
    await fromAccountMenu('Profile settings')(page)
    await page.waitForTimeout(1800)
  },
  staleDeployment,
  {
    text: 'This page has been updated',
    allow: /404|dynamically imported module|Importing a module script failed|Route failed to render|ProfileView|profile-/i,
  }
)

await browser.close()

let bad = 0
for (const r of results) {
  const ok = r.errors.length === 0 && r.failed.length === 0 && r.rendered.hasContent && !r.missing
  if (!ok) bad += 1
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms, ${r.local} local requests)`)
  console.log(`      rendered: ${JSON.stringify(r.rendered.text.replace(/\n/g, ' | ').slice(0, 90))}`)
  if (!r.rendered.hasContent) console.log('      RENDERED NOTHING - blank page')
  if (r.missing) console.log(`      EXPECTED TEXT NOT FOUND: ${JSON.stringify(r.missing)}`)
  for (const e of r.errors) console.log(`      console error: ${e}`)
  for (const f of r.failed) console.log(`      request failed: ${f}`)
}

console.log(bad ? `\n${bad} surface(s) with problems` : '\nAll surfaces rendered with no console errors')
process.exit(bad ? 1 : 0)
