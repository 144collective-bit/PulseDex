/**
 * Feature visibility flags.
 *
 * Everything switched off here is hidden from the UI only — no code is deleted.
 * Flip a flag back to `true` to restore that section exactly as it was.
 */
export const FEATURES = {
  /** Profile page, reachable from the account menu.
   *
   *  On while wallet sign-in is live: the account menu offers a Profile item,
   *  and a menu item that leads to a blank page is worse than no menu item.
   *  The page itself still reads from the device-local profile store - the
   *  server-backed version lands with the database. */
  profile: true,

  /** Retired. Password sign-in was replaced by wallet sign-in, which is always
   *  available and needs no flag - the account button is the entry point. This
   *  stays only because the mobile wallet menu still reads it inside a
   *  commented-out block. */
  auth: false,

  /**
   *  Candles built from the pool's own Swap events rather than an aggregator.
   *
   *  An experiment, off by default, and it replaces the series rather than
   *  merging into it - the two are not in the same units. The aggregator quotes
   *  in USD; this quotes in the pool's own quote token, which is what the swaps
   *  actually say. Laying one over the other would put a five-order-of-
   *  magnitude cliff in the middle of the chart.
   *
   *  Converting to USD is possible but not free: it needs the quote token's
   *  price per candle, not now. Measured against GeckoTerminal with a single
   *  spot rate, the error runs about 1% an hour back and 0.15% at the latest
   *  candle - which is the conversion drifting, not the candles.
   *
   *  What it buys, once finished: no rate limit, no third-party outage, candles
   *  for pairs too new to be indexed, and a live tail that updates as swaps
   *  land instead of on a thirty-second poll.
   */
  onchainCandles: false,

  /** Markets tab. */
  markets: false,

  /** The DEX terminal. When false the DEX tab shows the launch notice instead.
   *  The terminal reads live quotes from the PulseX router. Whether it can also
   *  execute a trade is a separate flag - see `dexSwapLive`. */
  dexLive: true,

  /** Signing in the swap panel: approvals and the swap call itself.
   *
   *  Three things had to land before a trader would not pay for them, and all
   *  three now have: a balance check with gas headroom, so selling every last
   *  PLS cannot produce a transaction with nothing left to pay for itself; a
   *  re-quote immediately before signing, since a floor derived from a
   *  twelve-second-old quote reverts against a pool that has moved; and tokens
   *  that tax transfers, which `getAmountsOut` over-quotes - the swap is now
   *  simulated before signing and floored against what will actually arrive.
   *
   *  Now true, deliberately and with the gap named: no transaction has ever
   *  been signed through this path. Everything above is tested, simulated and
   *  mutation-checked, and none of that is the same as a trade made with real
   *  money on a real wallet.
   *
   *  This site is public, so it is on for everyone who visits, not only for
   *  whoever is testing. Setting it back to false is the whole rollback - the
   *  button returns to "Trading not enabled" and nothing can be signed. */
  dexSwapLive: true,

  /** The Trenches tab shows the live pump.tires bonding-curve board. When
   *  false it falls back to the curated ecosystem link directory, which is
   *  kept intact in EcosystemDirectory.jsx. */
  trenchesLive: true,
}

/** Tabs shown in the main nav, in order. */
export const VISIBLE_TABS = [
  'home',
  'dashboard',
  'screener',
  'trenches',
  'dex',
  ...(FEATURES.markets ? ['markets'] : []),
  'portfolio',
  // Profile is deliberately absent. It is reachable from the account button
  // and nowhere else - a nav tab beside it would be a second door to the same
  // room, which is the thing the single account control exists to avoid.
]

export const isTabVisible = (tab) => VISIBLE_TABS.includes(tab)
