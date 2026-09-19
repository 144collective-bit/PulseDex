/**
 * Load every serverless handler the way Vercel's runtime will.
 *
 * The handlers in `api/` run in plain Node, but they import shared logic from
 * `src/` - which is otherwise only ever loaded by Vite, and Vite resolves an
 * extensionless relative import that Node refuses outright. So a perfectly
 * ordinary `import { x } from './y'` added to a file under src/utils can pass
 * lint, pass the test suite, build clean, and still take down every endpoint
 * that imports it, with a module-not-found at the first request after deploy.
 *
 * That is exactly what happened while the text-cleaning helpers were being
 * shared out, and nothing in the existing checks noticed: vitest resolves
 * through Vite too. This is the check that would have.
 *
 * It imports rather than calls. A handler that loads has no missing modules
 * and no syntax errors, which is the whole class of failure being caught here
 * - what it does once called is what the unit tests are for.
 */

import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const API_DIR = new URL('../api/', import.meta.url).pathname

/** Every .js file under api/, minus the underscore-prefixed shared helpers -
 *  the same convention Vercel uses to tell a route from a module. */
async function handlers(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await handlers(full)))
    else if (entry.name.endsWith('.js')) found.push(full)
  }
  return found
}

const files = (await handlers(API_DIR)).sort()
const failures = []

for (const file of files) {
  const name = relative(process.cwd(), file)
  try {
    const module = await import(pathToFileURL(file).href)
    // A route with no default export is a file Vercel will answer 500 from.
    if (typeof module.default !== 'function') {
      failures.push(`${name}: no default export`)
      continue
    }
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures.push(`${name}: ${err.message}`)
  }
}

if (failures.length) {
  console.error(`\n${failures.length} handler(s) would fail to load in production:\n`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`\n${files.length} handlers load cleanly.`)
