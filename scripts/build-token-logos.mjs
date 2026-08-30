/**
 * Regenerate the PulseChain token logo map from plsfolio.
 *
 *   node scripts/build-token-logos.mjs
 *
 * Writes src/data/plsfolioLogos.json: a plain { address: filename } map, used
 * by TokenLogo to fill the gap left by DexScreener's CDN, which has no image
 * for a large share of PulseChain tokens - the stablecoins among them.
 *
 * Generated rather than fetched at runtime because the source endpoint returns
 * every field it holds for every token - prices, liquidity, supply, burn data -
 * which is 1.13MB to obtain filenames that total 53KB. Nobody should download
 * that on page load to see a logo.
 *
 * Keyed by contract address only. Symbols are not unique on this chain: three
 * separate contracts answer to "PRVX", and matching artwork by symbol would
 * confidently show the wrong one.
 *
 * Re-run when tokens look unfamiliar; the map is a snapshot, and DexScreener
 * still covers anything listed after it was taken.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://api.plsfolio.com/coinsData2'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/plsfolioLogos.json')

const ADDRESS_RE = /^0x[a-f0-9]{40}$/
/** The placeholder the source uses when it has no artwork. */
const NO_IMAGE = 'noimg.png'

const res = await fetch(SOURCE)
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`)
  process.exit(1)
}

const { result } = await res.json()
if (!Array.isArray(result)) {
  console.error('Unexpected response shape: expected { result: [...] }')
  process.exit(1)
}

const map = {}
let skippedNoArt = 0
let skippedBadAddress = 0

for (const coin of result) {
  const address = String(coin?.contract || '').toLowerCase()
  const image = String(coin?.image || '')

  if (!ADDRESS_RE.test(address)) {
    skippedBadAddress += 1
    continue
  }
  if (!image || image === NO_IMAGE) {
    skippedNoArt += 1
    continue
  }
  // A filename only - the base URL lives in the consuming module, so the map
  // does not have to be rewritten if the host ever changes.
  map[address] = image
}

// Sorted so regenerating produces a reviewable diff rather than a reshuffle.
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, `${JSON.stringify(sorted, null, 0)}\n`, 'utf8')

console.log(`tokens in source      ${result.length}`)
console.log(`written with artwork  ${Object.keys(sorted).length}`)
console.log(`skipped, no artwork   ${skippedNoArt}`)
console.log(`skipped, bad address  ${skippedBadAddress}`)
console.log(`-> ${OUT}`)
