/**
 * Holders-only rooms: deciding whether somebody may post.
 *
 * The rule this file exists to hold is that the check belongs on the write
 * and not on entry. A check on joining is a snapshot that is wrong the moment
 * somebody sells, and a room gated that way is a room where the gate is a
 * formality after the first day.
 *
 * Which means a balance read sits in the posting path, and a posting path now
 * depends on a node answering. Everything below is about that dependency:
 * how long an answer is good for, and what to do when there is no answer at
 * all.
 *
 * Nothing here talks to a chain. It takes what a chain said, or what was said
 * a minute ago, and decides. That separation is the point - the deciding is
 * the part that has to be right, and a function that also makes a network
 * call is a function that cannot be tested.
 */

/** How long a balance read is treated as current. Short, because the whole
 *  argument for checking on write is that balances change. */
export const BALANCE_TTL_MS = 60_000

/**
 * How long a balance that already passed keeps someone posting when the node
 * has stopped answering.
 *
 * This is the fail-open window, and it is deliberately narrow. Ten minutes of
 * a seller still talking is a smaller problem than a gated room that goes
 * silent every time an RPC is slow - but it is still a problem, so it is ten
 * minutes and not an hour.
 */
export const BALANCE_GRACE_MS = 600_000

/**
 * A base-unit amount as a BigInt, or null.
 *
 * Token balances are uint256. They do not fit in a JavaScript number, and a
 * comparison done in floating point is a comparison that starts silently
 * lying somewhere around nine quadrillion base units - which for an 18-decimal
 * token is about 0.009 of it. Everything here is BigInt or it is wrong.
 *
 * @param {unknown} value a decimal string, a BigInt, or a small integer
 * @returns {bigint|null}
 */
export function asAmount(value) {
  if (typeof value === 'bigint') return value >= 0n ? value : null

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null
    return BigInt(value)
  }

  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  // Digits only. No sign, no exponent, no decimal point: this is base units,
  // and anything else arriving here means a conversion was skipped somewhere.
  if (!/^\d+$/.test(trimmed)) return null

  try {
    return BigInt(trimmed)
  } catch {
    return null
  }
}

/**
 * Convert a human amount to base units without touching floating point.
 *
 * "0.1" of an 18-decimal token is 100000000000000000 base units, and getting
 * there via `Number(amount) * 10 ** decimals` produces a number that is close
 * and wrong. Done as string surgery instead: split on the point, pad the
 * fraction to `decimals`, concatenate.
 *
 * Returns null rather than rounding when the input names more precision than
 * the token has. Somebody setting a gate at "1.0000000001" of a 6-decimal
 * token has misunderstood something, and quietly storing 1.000000 hides it.
 *
 * @param {unknown} amount e.g. "1000" or "0.5"
 * @param {unknown} decimals the token's own, from the chain
 * @returns {bigint|null}
 */
export function toBaseUnits(amount, decimals) {
  if (typeof amount !== 'string' && typeof amount !== 'number') return null
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null

  const text = String(amount).trim()
  if (!/^\d+(\.\d+)?$/.test(text)) return null

  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > decimals) return null

  try {
    return BigInt(whole + fraction.padEnd(decimals, '0'))
  } catch {
    return null
  }
}

/**
 * Base units back to something a person reads.
 *
 * Trailing zeros trimmed, because "1.000000000000000000 PLSX" is a number
 * nobody said. Whole amounts lose the point entirely.
 *
 * @param {unknown} base
 * @param {unknown} decimals
 * @returns {string|null}
 */
export function fromBaseUnits(base, decimals) {
  const amount = asAmount(base)
  if (amount === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null
  if (decimals === 0) return amount.toString()

  const unit = 10n ** BigInt(decimals)
  const whole = amount / unit
  const fraction = (amount % unit).toString().padStart(decimals, '0').replace(/0+$/, '')

  return fraction ? `${whole}.${fraction}` : whole.toString()
}

/**
 * Is this room gated, and on what?
 *
 * A room is gated when it names a token and a minimum, and the minimum is
 * above zero. A gate of zero is not a gate - every address holds zero of
 * every token - so it is read as "not gated" rather than as a rule that
 * happens to admit everybody, which is what it would look like in the
 * interface otherwise.
 *
 * @param {unknown} room a row from `rooms`
 * @returns {{token: string, min: bigint}|null}
 */
export function roomGate(room) {
  if (!room || typeof room !== 'object') return null

  const token = typeof room.gate_token === 'string' ? room.gate_token.toLowerCase() : null
  if (!token || !/^0x[0-9a-f]{40}$/.test(token)) return null

  const min = asAmount(room.min_balance)
  if (min === null || min <= 0n) return null

  return { token, min }
}

/** What `gateDecision` can answer. */
export const GATE = {
  /** Holds enough, from a reading that is current. */
  allowed: 'allowed',
  /** Does not hold enough. */
  refused: 'refused',
  /** The node did not answer, but this address passed recently enough that
   *  the benefit of the doubt is cheaper than the silence. */
  stale: 'stale',
  /** The node did not answer and there is nothing to fall back on. */
  unknown: 'unknown',
}

/**
 * Decide, given what is known.
 *
 * `fresh` is a balance just read from a node, or null when the read failed.
 * `cached` is `{ balance, at }` from a previous read, or null.
 *
 * The shape of the answer when a node is down is the whole of this function,
 * and it is asymmetric on purpose:
 *
 *   - Somebody whose last known balance was enough keeps posting for a
 *     while. They were in the room a minute ago; an RPC timeout is not
 *     evidence that they sold.
 *   - Somebody with no cached reading at all is refused. "We could not check"
 *     must never mean "come in" for a person nobody has ever checked, because
 *     that turns every outage into an open door.
 *   - Somebody whose last known balance was *not* enough stays refused. The
 *     grace window is for keeping people in, never for letting them in.
 *
 * @param {{fresh: bigint|null, cached: {balance: bigint, at: number}|null, min: bigint, now?: number}} params
 * @returns {{state: string, balance: bigint|null}}
 */
export function gateDecision({ fresh, cached, min, now = Date.now() }) {
  if (typeof fresh === 'bigint') {
    return { state: fresh >= min ? GATE.allowed : GATE.refused, balance: fresh }
  }

  // No fresh reading. Only a cached one that both passed and is inside the
  // grace window can help, and only to keep somebody in.
  if (
    cached &&
    typeof cached.balance === 'bigint' &&
    cached.balance >= min &&
    now - cached.at <= BALANCE_GRACE_MS
  ) {
    return { state: GATE.stale, balance: cached.balance }
  }

  return { state: GATE.unknown, balance: cached?.balance ?? null }
}

/** Is a cached reading current enough to skip the node entirely? */
export function isFresh(cached, now = Date.now()) {
  return Boolean(cached) && typeof cached.at === 'number' && now - cached.at <= BALANCE_TTL_MS
}
