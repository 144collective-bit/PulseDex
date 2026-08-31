/**
 * Telling launches apart from launch spam.
 *
 * Measured against 240 consecutive New Launches, not guessed at:
 *
 *   deployer floods   97 tokens (40%) from 7 wallets
 *   no artwork        82 (34%)
 *   placeholder name  48 (20%)
 *   no description   147 (61%)
 *   anonymous dev    209 (87%)
 *
 * The largest single wallet - 0xbadc0de0… - had minted 41 of those 240: all
 * numerically named, none with artwork, and each seeded with an identical
 * $15.10 of volume. That last detail is why there is no "has any volume"
 * signal here: every token on the board has some, because the bot buys its
 * own, so the figure separates nothing.
 *
 * None of this is rug detection and it is not offered as such. The launchpad
 * locks LP itself - 116 of 120 graduated tokens sit at exactly 100% locked -
 * so an LP pull is not the failure mode on this chain, and a token can be
 * hand-made, well described and still go to zero. What these signals find is
 * effort: whether a person made this or a script did.
 */

/** Tokens from one deployer, within the loaded set, that reads as a farm. */
const FLOOD_MIN_TOKENS = 3

/**
 * Two launches this close together are a batch, whoever made them.
 *
 * The count above needs a decent sample to trigger, and a column starts with
 * fifteen rows. A burst is visible immediately.
 */
const FLOOD_BURST_WINDOW_MS = 10 * 60 * 1000

/** Digits-only names of this length are what the minting scripts produce. */
const PLACEHOLDER_RE = /^\d{3,}$/

/**
 * The signals, in the order they appear in the menu.
 *
 * `label` is written out in full rather than composed from a noun, because
 * "Hide" plus "no artwork" reads as a double negative. The two aggressive ones
 * come last: each removes most of the board on its own, and a reader working
 * down the list should narrow it gradually rather than empty it in one click.
 */
export const QUALITY_SIGNALS = [
  {
    id: 'flood',
    label: 'Deployer floods',
    hint: 'One wallet minting the same token over and over',
  },
  {
    id: 'artwork',
    label: 'Tokens with no artwork',
    hint: 'Nobody who cares about a launch skips the picture',
  },
  {
    id: 'placeholderName',
    label: 'Placeholder names',
    hint: 'Digits where a name should be - a script named this one',
  },
  {
    id: 'duplicateSymbol',
    label: 'Duplicate tickers',
    hint: 'Keeps the most traded of a repeated ticker, drops the copies',
  },
  {
    id: 'noDescription',
    label: 'Tokens with no description',
    hint: 'Aggressive - this is most of the board',
  },
  {
    id: 'anonymousDeployer',
    label: 'Anonymous deployers',
    hint: 'Aggressive - most deployers never set a username',
  },
]

export const DEFAULT_QUALITY = {
  flood: false,
  artwork: false,
  placeholderName: false,
  duplicateSymbol: false,
  noDescription: false,
  anonymousDeployer: false,
}

/** The set worth starting from: strong signals, no collateral damage. */
export const RECOMMENDED_QUALITY = {
  ...DEFAULT_QUALITY,
  flood: true,
  artwork: true,
  placeholderName: true,
  duplicateSymbol: true,
}

export function normalizeQuality(raw) {
  const out = { ...DEFAULT_QUALITY }
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(DEFAULT_QUALITY)) out[key] = Boolean(raw[key])
  return out
}

export function activeQualityCount(quality) {
  if (!quality) return 0
  return Object.values(quality).filter(Boolean).length
}

/**
 * Assess a column's loaded rows.
 *
 * Three of the six signals - floods, duplicate tickers, and which copy of a
 * duplicate to keep - are properties of the set rather than of a token, so
 * this runs over the whole list at once and returns a verdict per address.
 *
 * Always assessed against the unfiltered list: whether a wallet is flooding
 * cannot depend on which of its tokens the current filters happen to be
 * showing.
 */
export function assessTokens(tokens) {
  const list = Array.isArray(tokens) ? tokens : []

  const byDeployer = new Map()
  const bySymbol = new Map()

  for (const token of list) {
    const dev = String(token?.creatorAddress || '').toLowerCase()
    if (dev) {
      if (!byDeployer.has(dev)) byDeployer.set(dev, [])
      byDeployer.get(dev).push(token)
    }

    const symbol = String(token?.symbol || '').trim().toUpperCase()
    if (symbol) {
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, [])
      bySymbol.get(symbol).push(token)
    }
  }

  // Which deployers are farming.
  const flooding = new Set()
  for (const [dev, minted] of byDeployer) {
    if (minted.length >= FLOOD_MIN_TOKENS) {
      flooding.add(dev)
      continue
    }

    if (minted.length < 2) continue

    const times = minted.map((t) => Number(t.createdAt) * 1000).filter(Boolean).sort((a, b) => a - b)
    for (let i = 1; i < times.length; i += 1) {
      if (times[i] - times[i - 1] <= FLOOD_BURST_WINDOW_MS) {
        flooding.add(dev)
        break
      }
    }
  }

  /*
   * For a repeated ticker, the most traded copy is the one kept.
   *
   * Volume is the only thing separating them here, and an impersonator is
   * usually the quiet one. It is a heuristic, which is why the switch says it
   * keeps one rather than claiming to identify the original.
   */
  const keptOfSymbol = new Set()
  for (const [, sharing] of bySymbol) {
    if (sharing.length < 2) continue
    const best = sharing.reduce((a, b) => ((b.volumeUsd || 0) > (a.volumeUsd || 0) ? b : a))
    keptOfSymbol.add(best.address)
  }

  const verdicts = new Map()
  const counts = Object.fromEntries(QUALITY_SIGNALS.map((s) => [s.id, 0]))

  for (const token of list) {
    if (!token?.address) continue

    const dev = String(token.creatorAddress || '').toLowerCase()
    const symbol = String(token.symbol || '').trim()
    const name = String(token.name || '').trim()

    const flags = {
      flood: Boolean(dev) && flooding.has(dev),
      artwork: !token.imageCid,
      placeholderName: PLACEHOLDER_RE.test(symbol) || PLACEHOLDER_RE.test(name),
      duplicateSymbol:
        (bySymbol.get(symbol.toUpperCase())?.length || 0) > 1 && !keptOfSymbol.has(token.address),
      noDescription: !String(token.description || '').trim(),
      anonymousDeployer: !String(token.creatorUsername || '').trim(),
    }

    for (const id of Object.keys(counts)) if (flags[id]) counts[id] += 1

    verdicts.set(token.address, flags)
  }

  return { verdicts, counts }
}

/** True when this token trips any signal the reader has switched on. */
export function failsQuality(address, quality, verdicts) {
  if (!quality || !verdicts) return false
  const flags = verdicts.get(address)
  if (!flags) return false

  for (const id of Object.keys(flags)) {
    if (quality[id] && flags[id]) return true
  }
  return false
}
