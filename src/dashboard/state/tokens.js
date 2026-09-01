/**
 * Token references for the dashboard.
 *
 * Modules and the global context both persist whole `TokenRef` objects rather
 * than bare addresses. They are small, they survive a token dropping off the
 * curated list, and they mean a saved dashboard can draw its own headers
 * without first resolving every address it mentions.
 *
 * Everything here is pinned by contract address. Symbols are not unique on
 * PulseChain, so a saved dashboard that remembered "HEX" rather than
 * 0x2b59… could silently come back pointing at a different contract.
 */

import { KNOWN_PULSE_TOKENS } from '../../config/pulsechain'
import { NATIVE_PLS } from '../../config/dex'

/** @typedef {import('../types/dashboard.js').TokenRef} TokenRef */
/** @typedef {import('../types/dashboard.js').PairRef} PairRef */

const logoFor = (address) =>
  `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${String(address).toLowerCase()}.png`

/** Native PLS has no contract, so it carries the sentinel the swap layer uses. */
export const PLS = {
  address: NATIVE_PLS,
  symbol: 'PLS',
  name: 'Pulse',
  decimals: 18,
  verified: true,
  logo: logoFor('0xA1077a294dDE1B09bB078844df40758a5D0f9a27'),
}

/**
 * Build a TokenRef from the curated list by address.
 *
 * @param {string} address
 * @returns {TokenRef | null}
 */
export function tokenRefFor(address) {
  if (!address) return null
  if (address === NATIVE_PLS) return PLS
  const hit = KNOWN_PULSE_TOKENS.find(
    (t) => t.address.toLowerCase() === String(address).toLowerCase(),
  )
  if (!hit) return null
  return {
    address: hit.address,
    symbol: hit.symbol,
    name: hit.name,
    decimals: hit.decimals,
    logo: hit.logo || logoFor(hit.address),
    verified: true,
  }
}

/** Normalise anything token-shaped into a TokenRef the modules can rely on. */
export function toTokenRef(token) {
  if (!token) return null
  if (token.address === NATIVE_PLS) return PLS
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name ?? token.symbol,
    decimals: token.decimals ?? 18,
    logo: token.logo || (token.address ? logoFor(token.address) : undefined),
    verified: Boolean(token.verified),
  }
}

/** The assets the default dashboard and the "popular" list lead with. */
export const WPLS = tokenRefFor('0xA1077a294dDE1B09bB078844df40758a5D0f9a27')
export const HEX = tokenRefFor('0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39')
export const PLSX = tokenRefFor('0x95B303987A60C71504D99Aa1b13B4DA07b0790ab')
export const INC = tokenRefFor('0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d')
export const USDC = tokenRefFor('0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07')
export const DAI = tokenRefFor('0xefD766cCb38EaF1dfd701853BFCe31359239F305')

export const POPULAR_TOKENS = [PLS, HEX, PLSX, INC, USDC, DAI].filter(Boolean)

/**
 * Compose a pair from two tokens.
 *
 * `pairAddress` stays optional on purpose. A pair is two assets someone wants
 * to look at; whether a direct pool exists for them is a separate question the
 * data layer answers, and forcing a pool address here would make it impossible
 * to express a pair before one has been found.
 *
 * @param {TokenRef} base
 * @param {TokenRef} quote
 * @param {string} [pairAddress]
 * @returns {PairRef}
 */
export function makePair(base, quote, pairAddress) {
  return {
    base,
    quote,
    pairAddress,
    label: `${base?.symbol ?? '?'} / ${quote?.symbol ?? '?'}`,
  }
}

/** The pair a fresh dashboard opens on. */
export const DEFAULT_PAIR = makePair(HEX, WPLS)
