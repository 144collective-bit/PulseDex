import {
  PUMP_TIRES_API,
  IPFS_CDN,
  TOKENS_FOR_SALE,
  COLUMN_PAGE_SIZE,
} from '../config/pumptires'
import { isValidCid } from '../utils/tokenImage'

/**
 * Data layer for the pump.tires bonding-curve launchpad.
 *
 * Prices and market values from this API are denominated in PLS, not USD —
 * every consumer multiplies by the live PLS price. The helpers below make that
 * conversion explicit so it can't be forgotten at a call site.
 */

// Short-lived response cache. The board polls three columns plus a trade tape,
// so several components ask for overlapping data inside the same tick.
const cache = new Map()
const CACHE_TTL = 5000

async function fetchWithCache(url, { ttl = CACHE_TTL } = {}) {
  const now = Date.now()
  const hit = cache.get(url)
  if (hit && now - hit.timestamp < ttl) {
    return hit.data
  }

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    cache.set(url, { timestamp: now, data })
    return data
  } catch (err) {
    console.warn(`pump.tires fetch failed for ${url}:`, err.message)
    // Serve stale rather than blanking a live column on one dropped request.
    if (hit) return hit.data
    throw err
  }
}

/**
 * Token images arrive as bare IPFS CIDs chosen by the token deployer. Anything
 * that isn't a plain content identifier is dropped rather than concatenated
 * into a URL, so a crafted `image_cid` can't escape the gateway path.
 */
export function ipfsImageUrl(cid) {
  if (!isValidCid(cid)) return null
  return `${IPFS_CDN}${cid.trim()}`
}

/**
 * Social fields arrive inconsistently: `web` is a full URL, while `twitter` and
 * `telegram` are usually bare handles ("JabroniPulse") and occasionally full
 * links. A bare handle fails URL validation and renders as a dead link, so
 * handles are expanded onto their platform here.
 */
function socialUrl(value, base) {
  const raw = (value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (!base) return `https://${raw.replace(/^\/+/, '')}`
  return `${base}${raw.replace(/^@/, '').replace(/^\/+/, '')}`
}

/** Convert a PLS-denominated value from the API into USD. */
export function plsToUsd(plsValue, plsPrice) {
  const val = parseFloat(plsValue || 0)
  const price = parseFloat(plsPrice || 0)
  if (!isFinite(val) || !isFinite(price)) return 0
  return val * price
}

/**
 * Reshape a raw API token into the camelCase form the UI consumes, deriving the
 * fields the board needs (curve progress, 5-minute momentum, image URL).
 */
export function normalizeToken(raw) {
  if (!raw || !raw.address) return null

  const price = parseFloat(raw.price || 0)
  const price5mAgo = parseFloat(raw.price_5m_ago || 0)
  const tokensSold = parseFloat(raw.tokens_sold || 0)

  // Momentum is only meaningful once there's a prior price to compare against.
  const change5m =
    price5mAgo > 0 ? ((price - price5mAgo) / price5mAgo) * 100 : null

  return {
    address: raw.address,
    name: raw.name || 'Unknown',
    symbol: raw.symbol || '???',
    description: raw.description || '',

    // Socials and counts the detail endpoint carries but nothing consumed yet.
    twitter: socialUrl(raw.twitter, 'https://x.com/'),
    telegram: socialUrl(raw.telegram, 'https://t.me/'),
    website: socialUrl(raw.web, null),
    tradesCount: Number(raw.total_trades_count || 0),
    burnsCount: Number(raw.total_burns_count || 0),
    // Raw CID travels with the token so the avatar can pick a live gateway;
    // imageUrl stays as the single-gateway convenience form.
    imageCid: isValidCid(raw.image_cid) ? raw.image_cid.trim() : null,
    imageUrl: ipfsImageUrl(raw.image_cid),

    // PLS-denominated — run through plsToUsd before display.
    pricePls: price,
    marketValuePls: parseFloat(raw.market_value || 0),

    volumeUsd: parseFloat(raw.total_volume_usd || 0),
    priceAth: parseFloat(raw.price_ath || 0),
    priceAtl: parseFloat(raw.price_atl || 0),
    change5m,

    tokensSold,
    totalSupply: parseFloat(raw.total_supply || 0),
    // Clamped because a graduating token can briefly report sales past the cap.
    bondingProgress: Math.min(100, (tokensSold / TOKENS_FOR_SALE) * 100),

    isLaunched: Boolean(raw.is_launched),
    pairAddress: raw.pair_address || null,
    lockedLp: raw.locked_lp,

    // The deployer arrives as a nested object, not flat creator_* fields - the
    // previous flat reads always resolved to empty, so the deployer panel had
    // nothing to show even where the API supplied a full profile.
    creatorAddress: raw.creator?.address || '',
    creatorUsername: raw.creator?.username || '',
    creatorBio: raw.creator?.bio || '',
    creatorTwitter: socialUrl(raw.creator?.twitter_username, 'https://x.com/'),
    creatorAvatarCid: isValidCid(raw.creator?.avatar_cid)
      ? raw.creator.avatar_cid.trim()
      : null,
    createdAt: Number(raw.created_timestamp || 0),
    launchedAt: Number(raw.launch_timestamp || 0),
    lastActivityAt: Number(raw.latest_activity_timestamp || 0),
  }
}

/**
 * Fetch one page of the token board.
 *
 * `filter` selects the column: `created_timestamp` (new), `top_bonding`
 * (closest to graduating), or `launch_timestamp` (already graduated).
 */
export async function getTokenList(
  filter = 'top_bonding',
  { cursor, search, limit = COLUMN_PAGE_SIZE } = {}
) {
  try {
    const params = new URLSearchParams({
      filter,
      direction: 'next',
      limit: String(limit),
    })
    if (cursor) params.set('cursor', cursor)
    if (search) params.set('search', search)

    const data = await fetchWithCache(`${PUMP_TIRES_API}/api/tokens?${params}`)
    const tokens = Array.isArray(data?.tokens) ? data.tokens : []

    return {
      tokens: tokens.map(normalizeToken).filter(Boolean),
      nextCursor: data?.nextCursor || null,
      hasMore: Boolean(data?.hasMore),
    }
  } catch (err) {
    console.error('getTokenList error:', err)
    return { tokens: [], nextCursor: null, hasMore: false }
  }
}

/** Full detail for one token, including its holder distribution. */
export async function getTokenData(address) {
  if (!address) return null
  try {
    const data = await fetchWithCache(
      `${PUMP_TIRES_API}/api/tokens/${encodeURIComponent(address)}`
    )
    if (!data) return null

    const holders = Array.isArray(data.holders) ? data.holders : []
    return {
      ...(normalizeToken(data.token || data) || {}),
      holders: holders
        .map((h) => ({
          address: h.holder_address,
          balance: parseFloat(h.balance || 0),
          username: h.user_info?.username || '',
        }))
        .sort((a, b) => b.balance - a.balance),
    }
  } catch (err) {
    console.error('getTokenData error:', err)
    return null
  }
}

/**
 * OHLC candles for the curve. `interval` is in seconds; the API windows
 * backwards from `to`, so we always anchor to now.
 */
export async function getCandles(address, interval = 300, limit = 200) {
  if (!address) return []
  try {
    const to = Math.floor(Date.now() / 1000)
    const data = await fetchWithCache(
      `${PUMP_TIRES_API}/api/candles/${encodeURIComponent(address)}?interval=${interval}&to=${to}&limit=${limit}`
    )
    const candles = Array.isArray(data?.candles) ? data.candles : []

    return candles
      .map((c) => ({
        time: Number(c.timestamp),
        open: parseFloat(c.open || 0),
        high: parseFloat(c.high || 0),
        low: parseFloat(c.low || 0),
        close: parseFloat(c.close || 0),
        buyVolume: parseFloat(c.buyVolume || 0),
        sellVolume: parseFloat(c.sellVolume || 0),
      }))
      .filter((c) => c.time > 0 && c.close > 0)
      // The chart library rejects unsorted or duplicated timestamps.
      .sort((a, b) => a.time - b.time)
  } catch (err) {
    console.error('getCandles error:', err)
    return []
  }
}

/** Recent trades against one token's curve, newest first. */
export async function getTransactions(address, { limit = 50, cursor } = {}) {
  const empty = { transactions: [], nextCursor: null, hasMore: false, total: 0 }
  if (!address) return empty

  try {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)

    const data = await fetchWithCache(
      `${PUMP_TIRES_API}/api/transactions/${encodeURIComponent(address)}?${params}`
    )
    const txns = Array.isArray(data?.transactions) ? data.transactions : []

    return {
      transactions: txns.map((t) => ({
        id: t.id,
        txHash: t.txHash,
        type: t.type === 'sell' ? 'sell' : 'buy',
        plsAmount: parseFloat(t.plsAmount || 0),
        tokenAmount: parseFloat(t.tokenAmount || 0),
        usdValue: parseFloat(t.usdValue || 0),
        userAddress: t.userAddress || '',
        username: t.username || '',
        timestamp: Number(t.timestamp || 0),
      })),
      nextCursor: data?.nextCursor || null,
      hasMore: Boolean(data?.hasMore),
      total: Number(data?.total || 0),
    }
  } catch (err) {
    console.error('getTransactions error:', err)
    return empty
  }
}

/** Live PLS price in USD — the denominator for every value on the board. */
export async function getPlsPrice() {
  try {
    const data = await fetchWithCache(`${PUMP_TIRES_API}/api/pls-price`, {
      ttl: 30000,
    })
    const price = parseFloat(data?.plsPrice || 0)
    return price > 0 ? price : null
  } catch (err) {
    console.error('getPlsPrice error:', err)
    return null
  }
}

/** Launchpad-wide totals: volume, launches, fees burned. */
export async function getProtocolStats(days = 7) {
  try {
    const data = await fetchWithCache(
      `${PUMP_TIRES_API}/api/protocol-stats?days=${days}`,
      { ttl: 60000 }
    )
    if (!data?.stats) return null

    return {
      totalTokens: Number(data.stats.totalTokens || 0),
      totalLaunches: Number(data.stats.totalLaunches || 0),
      totalTrades: Number(data.stats.totalTradesCount || 0),
      totalVolumeUsd: parseFloat(data.stats.totalVolumeUsd || 0),
      feesBurnedUsd: parseFloat(data.stats.totalFeesBurnedUsd || 0),
    }
  } catch (err) {
    console.error('getProtocolStats error:', err)
    return null
  }
}

/**
 * Build a global trade tape.
 *
 * The launchpad exposes no cross-token feed, so we merge the per-token trade
 * endpoints for whichever tokens are currently on screen. The target list is
 * capped because this fans out one request per token on every poll.
 */
export async function getGlobalActivity(addresses = [], perToken = 6) {
  const targets = addresses.filter(Boolean).slice(0, 12)
  if (!targets.length) return []

  const results = await Promise.all(
    targets.map(async (address) => {
      try {
        const { transactions } = await getTransactions(address, { limit: perToken })
        return transactions.map((t) => ({ ...t, tokenAddress: address }))
      } catch {
        // One unreachable token shouldn't empty the whole tape.
        return []
      }
    })
  )

  return results
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 60)
}
