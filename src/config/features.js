/**
 * Feature visibility flags.
 *
 * Everything switched off here is hidden from the UI only — no code is deleted.
 * Flip a flag back to `true` to restore that section exactly as it was.
 */
export const FEATURES = {
  /** Profile tab, profile dropdown, and the profile settings modal. */
  profile: false,

  /** Sign In / Sign Up entry points. Off while `profile` is off — signing in
   *  would otherwise land the user on a page that isn't reachable. */
  auth: false,

  /** Markets tab. */
  markets: false,

  /** The live DEX aggregator. When false the DEX tab shows the launch notice
   *  instead; DexView.jsx is untouched and ready for when you finalise it. */
  dexLive: false,
}

/** Tabs shown in the main nav, in order. */
export const VISIBLE_TABS = [
  'screener',
  'trenches',
  'dex',
  ...(FEATURES.markets ? ['markets'] : []),
  'portfolio',
  'watchlist',
  ...(FEATURES.profile ? ['profile'] : []),
]

export const isTabVisible = (tab) => VISIBLE_TABS.includes(tab)
