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

  /** Markets tab. */
  markets: false,

  /** The DEX terminal. When false the DEX tab shows the launch notice instead.
   *  The terminal reads live quotes from the PulseX router, but there is no
   *  signing path anywhere in the app - no wallet client, no approvals, no
   *  swap call - so nothing here can execute a trade. Wiring that up waits on
   *  an explicit go-ahead. */
  dexLive: true,

  /** The Trenches tab shows the live pump.tires bonding-curve board. When
   *  false it falls back to the curated ecosystem link directory, which is
   *  kept intact in EcosystemDirectory.jsx. */
  trenchesLive: true,
}

/** Tabs shown in the main nav, in order. */
export const VISIBLE_TABS = [
  'home',
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
