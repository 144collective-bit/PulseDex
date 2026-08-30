/**
 * Launchpad token artwork resolution.
 *
 * pump.tires stores token images on IPFS and hands back a bare CID. Any gateway
 * can serve that CID, and gateways fail independently — the launchpad's own
 * Bunny CDN is unreachable from some networks even when ipfs.io answers fine.
 * Resolving through an ordered list, then remembering which gateway actually
 * worked, keeps logos appearing quickly and staying put.
 */

/**
 * Gateways tried in order. The launchpad's own CDN leads because it is the
 * fastest when reachable; Pinata is the most reliable second (it answered from
 * both a browser and a plain HTTP client during testing, where ipfs.io was
 * reachable from only one of the two).
 */
export const IPFS_GATEWAYS = [
  'https://ipfs-pump-tires.b-cdn.net/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
]

const GATEWAY_PREF_KEY = 'pulsedex_ipfs_gateway'

// Index of the gateway most recently observed to work. Persisted so a viewer on
// a network that blocks one gateway doesn't pay the failed request every visit.
let preferredGateway = 0
try {
  const saved = Number(localStorage.getItem(GATEWAY_PREF_KEY))
  if (Number.isInteger(saved) && saved >= 0 && saved < IPFS_GATEWAYS.length) {
    preferredGateway = saved
  }
} catch {
  // Storage unavailable (private mode) — the default order still works.
}

/**
 * Token images are identified by a deployer-supplied CID. Only bare content
 * identifiers are accepted, so a crafted value can't escape the gateway path
 * or smuggle in a scheme. Live data is CIDv0 (46 chars); the range also covers
 * base32 CIDv1.
 */
export function isValidCid(cid) {
  return typeof cid === 'string' && /^[a-zA-Z0-9]{40,80}$/.test(cid.trim())
}

/** Every gateway URL for a CID, preferred gateway first. */
export function ipfsCandidates(cid) {
  if (!isValidCid(cid)) return []
  const clean = cid.trim()
  const ordered = [
    IPFS_GATEWAYS[preferredGateway],
    ...IPFS_GATEWAYS.filter((_, i) => i !== preferredGateway),
  ]
  return ordered.map((gateway) => `${gateway}${clean}`)
}

// CID -> the URL that actually rendered. Survives unmounts, so switching tabs
// or scrolling a column back into view redisplays instantly without re-probing.
const resolvedByCid = new Map()

/** The already-working URL for a CID, if one has loaded this session. */
export function getResolvedImage(cid) {
  if (!isValidCid(cid)) return null
  return resolvedByCid.get(cid.trim()) || null
}

/**
 * Record that `url` rendered for `cid`, and promote its gateway so every other
 * logo on the board tries the known-good host first.
 */
export function rememberResolvedImage(cid, url) {
  if (!isValidCid(cid) || !url) return
  resolvedByCid.set(cid.trim(), url)

  const index = IPFS_GATEWAYS.findIndex((gateway) => url.startsWith(gateway))
  if (index >= 0 && index !== preferredGateway) {
    preferredGateway = index
    try {
      localStorage.setItem(GATEWAY_PREF_KEY, String(index))
    } catch {
      // Preference is best-effort; the in-memory order still applies.
    }
  }
}

/**
 * Deterministic accent for the initials placeholder, derived from the token
 * address so the same token always gets the same colour.
 *
 * Returns a hue rather than a finished gradient: the placeholder is rendered as
 * a dark tinted surface with coloured initials, not a solid bright disc. On a
 * board where better than half of new tokens ship without artwork, a wall of
 * saturated circles reads as broken images; a tinted glass chip reads as a
 * token that simply has no logo yet.
 */
export function avatarAccent(seed) {
  const key = String(seed || '')
  const hash = key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const accents = [
    '#00e5ff', // cyan
    '#00ff9d', // mint
    '#d946ef', // magenta
    '#fbbf24', // amber
    '#3b9dff', // blue
    '#a78bfa', // violet
  ]
  return accents[hash % accents.length]
}
