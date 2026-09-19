import { chromium } from 'playwright-core'

/**
 * Count the database queries each surface fires on load.
 *
 * Written after a page-load complaint that nothing else here could explain.
 * The server was clean - no 5xx at all - and the bundle had barely moved,
 * because the cost was not in what was served but in how many times the page
 * then asked the database for something. Discover was firing forty-four
 * queries to draw twenty rows, forty of them for follower counts the row does
 * not display.
 *
 * Supabase is mocked at the network layer rather than reached, so this needs
 * no credentials and no outbound network. It measures the thing that matters:
 * round trips before the page settles. A browser runs about six at a time, so
 * forty-four is seven or eight serial waits stacked in front of the reader.
 *
 * Usage - build, serve, measure:
 *
 *   VITE_SUPABASE_URL=https://mock.supabase.co \
 *     VITE_SUPABASE_ANON_KEY=mock npm run build
 *   npx vite preview --port 4318 &
 *   node scripts/measure-queries.mjs http://127.0.0.1:4318
 *
 * The mock URL matters: without it `hasSupabase` is false, the app asks for
 * nothing, and that measures as a perfect score while meaning nothing.
 *
 * Exits non-zero when a surface goes back over budget, so this can be a check
 * and not only a diagnostic.
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4318'

const PEOPLE = Array.from({ length: 20 }, (_, i) => ({
  address: `0x${String(i).padStart(2, '0')}${'ab'.repeat(19)}`,
  handle: `trader${i}`,
  avatar_id: null,
  avatar_url: null,
  bio: 'Trading PulseChain since the fork.',
  links: [],
  created_at: '2025-01-01T00:00:00.000Z',
}))

const browser = await chromium.launch({
  // Overridable, because this path belongs to one environment and nobody else's.
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

async function measure(name, steps) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const byTable = new Map()
  const errors = []

  page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`.slice(0, 200)))

  // Every PostgREST call, answered with something plausible and counted.
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0] || 'unknown'
    byTable.set(table, (byTable.get(table) || 0) + 1)

    const body =
      table === 'profiles' ? PEOPLE : table === 'posts' ? PEOPLE.map((p, i) => ({
        id: i + 1, address: p.address, body: 'gm', created_at: p.created_at,
        parent_id: null, profiles: { handle: p.handle, avatar_id: null, avatar_url: null },
      })) : []

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-19/20' },
      body: JSON.stringify(body),
    })
  })

  // The realtime socket has nothing to say here and would only hang.
  await page.route('**/realtime/**', (route) => route.abort())

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(1200)
  if (steps) await steps(page)
  await page.waitForTimeout(1800)

  const total = [...byTable.values()].reduce((a, b) => a + b, 0)
  const detail = [...byTable.entries()].map(([t, n]) => `${t}=${n}`).join(' ')
  console.log(`${String(total).padStart(3)} queries  ${name.padEnd(22)} ${detail}`)
  for (const e of errors) console.log(`             ${e}`)

  await page.close()
  return total
}

const toSocial = async (page, label) => {
  const social = page.locator('.btn-tab', { hasText: 'Chat' }).first()
  if (await social.count()) await social.click()
  await page.waitForTimeout(600)
  if (label) {
    const t = page.locator('.social-tabs .xp-tab', { hasText: label }).first()
    if (await t.count()) {
      await t.click()
    } else {
      console.log(`             (tab "${label}" not found - did the strip render?)`)
    }
  }
}

console.log('\nDatabase round trips per surface\n')
await measure('Feed', (p) => toSocial(p, null))
const discover = await measure('Discover (20 people)', (p) => toSocial(p, 'Discover'))
await measure('Chat Rooms', (p) => toSocial(p, 'Chat Rooms'))

await browser.close()

console.log(
  `\nDiscover fired ${discover} queries for 20 people.` +
    (discover > 25
      ? ' TOO MANY - a per-row fetch is back.'
      : ' Batched: one follow query for the whole list.'),
)
process.exit(discover > 25 ? 1 : 0)
