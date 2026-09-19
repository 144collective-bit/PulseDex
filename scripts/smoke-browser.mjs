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

const browser = await chromium.launch({
  // Overridable, because this path belongs to one environment and nobody else's.
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

const results = []

/** Open one route, do something, and report every error and request. */
async function visit(name, steps) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  const failed = []
  const requests = []

  /*
   * This sandbox has no outbound network, so every external fetch fails.
   * Those errors say something about the environment and nothing about the
   * app, and left in they drown out the ones that matter.
   */
  const environmental =
    /ERR_TUNNEL_CONNECTION_FAILED|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|Failed to fetch|NetworkError|net::ERR_|WebSocket connection to|tunnel via proxy/i

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

  const started = Date.now()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 })
  // Let React mount and any on-mount effects fire.
  await page.waitForTimeout(1500)

  if (steps) await steps(page)
  await page.waitForTimeout(1200)

  const rendered = await page.evaluate(() => {
    const root = document.getElementById('root')
    return { hasContent: Boolean(root && root.children.length), text: (root?.innerText || '').slice(0, 120) }
  })

  results.push({
    name,
    ms: Date.now() - started,
    errors,
    failed,
    local: requests.filter((u) => u.startsWith(BASE)).length,
    rendered,
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

await visit('home (cold load)', null)
await visit('social: Feed', clickTab(null))
await visit('social: My Profile', clickTab('My Profile'))
await visit('social: Chat Rooms', clickTab('Chat Rooms'))
await visit('social: Discover', clickTab('Discover'))

await browser.close()

let bad = 0
for (const r of results) {
  const ok = r.errors.length === 0 && r.failed.length === 0 && r.rendered.hasContent
  if (!ok) bad += 1
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms, ${r.local} local requests)`)
  console.log(`      rendered: ${JSON.stringify(r.rendered.text.replace(/\n/g, ' | ').slice(0, 90))}`)
  if (!r.rendered.hasContent) console.log('      RENDERED NOTHING - blank page')
  for (const e of r.errors) console.log(`      console error: ${e}`)
  for (const f of r.failed) console.log(`      request failed: ${f}`)
}

console.log(bad ? `\n${bad} surface(s) with problems` : '\nAll surfaces rendered with no console errors')
process.exit(bad ? 1 : 0)
