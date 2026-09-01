/**
 * Per-account profile storage.
 *
 * Profile data used to live under fixed localStorage keys shared by everyone
 * who used the browser. Signing out of one wallet and into another left the
 * first wallet's display name, bio and private trade notes on screen and in
 * storage - a real leak on any shared or public machine.
 *
 * Every key is now scoped to the signed-in address, so accounts cannot see
 * each other's data, and a signed-out visitor writes to a separate guest
 * scope rather than into whichever account was last used.
 */

const PREFIX = 'pulsedex'
const GUEST = 'guest'

/** Legacy unscoped keys, from before storage was per-account. */
export const LEGACY_KEYS = [
  'pulsedex_user_profile',
  'pulsedex_user_preferences',
  'pulsedex_trade_notes',
]

/** Scope key for an account, or the guest scope when signed out. */
export function scopeFor(address) {
  return address ? String(address).toLowerCase() : GUEST
}

export function storageKey(name, address) {
  return `${PREFIX}_${name}:${scopeFor(address)}`
}

/** Read and parse, falling back on anything unreadable rather than throwing. */
export function readScoped(name, address, fallback) {
  try {
    const raw = localStorage.getItem(storageKey(name, address))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    // A corrupted or hand-edited value must not take down the provider.
    if (parsed === null || typeof parsed !== 'object') return fallback
    return parsed
  } catch {
    return fallback
  }
}

/**
 * Who to tell when a scoped key changes, keyed by name.
 *
 * Several surfaces read the same record - the watchlist is on the screener, the
 * sidebar, the portfolio page and a dashboard module - and each used to load it
 * once and hold it in component state. Two of them open at the same time then
 * disagree, and the damage is not only a stale star: a surface that writes its
 * whole list back from a stale copy silently drops whatever the other one
 * added. Writers announce here, readers re-read.
 *
 * Deliberately not the `storage` event, which fires in *other* tabs only and so
 * misses the case that actually loses data.
 *
 * @type {Map<string, Set<(value: unknown) => void>>}
 */
const listeners = new Map()

/**
 * Listen for writes to one scoped record. Returns the unsubscribe function.
 *
 * @param {string} name
 * @param {(value: unknown) => void} fn
 */
export function subscribeScoped(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set())
  listeners.get(name).add(fn)
  return () => listeners.get(name)?.delete(fn)
}

/**
 * Write, tolerating a full or unavailable store.
 *
 * localStorage throws on quota in every browser and is absent entirely in
 * private modes on some. Losing a preference is acceptable; taking the app
 * down with it is not.
 */
export function writeScoped(name, address, value) {
  try {
    localStorage.setItem(storageKey(name, address), JSON.stringify(value))
  } catch (err) {
    console.warn(`Could not persist ${name}:`, err?.message)
    return false
  }

  // Announced after the write, so a listener that re-reads storage sees the new
  // value rather than the one it is replacing. A throwing listener must not
  // make the write look like it failed.
  const subs = listeners.get(name)
  if (subs) {
    for (const fn of subs) {
      try {
        fn(value)
      } catch (err) {
        console.warn(`A ${name} listener threw:`, err?.message)
      }
    }
  }

  return true
}

/**
 * Remove the unscoped keys once, so one account's data cannot keep surfacing
 * for the next person to sign in on this browser.
 */
export function purgeLegacyKeys() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    // Nothing to do - a store we cannot write to is also one we cannot leak from.
  }
}
