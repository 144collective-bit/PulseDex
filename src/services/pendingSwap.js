/**
 * Transactions that have been sent but not yet settled.
 *
 * A submitted transaction is a fact about a wallet, not about a panel. It was
 * held in the swap panel's own state, which meant React owned the only copy:
 * the compact panel in the token page is keyed on the token being viewed, so
 * opening a different token while a swap was in the mempool unmounted the panel
 * and took the hash with it. The trade still settled - the user simply had no
 * way to see that it had, no link to the explorer, and no notice if it reverted.
 *
 * So the record lives out here instead, where no remount can reach it, and any
 * instance of the panel can show what is outstanding.
 *
 * Kept per wallet and chain. Someone who switches accounts must not be shown
 * the previous account's transaction, and a hash from another chain would link
 * to an explorer that has never heard of it.
 *
 * In memory only. A reload starts empty, which is the same as today - carrying
 * these across sessions means writing hashes to storage and deciding when to
 * stop believing them, which is a larger question than the one this answers.
 */

const records = new Map()
const listeners = new Set()

/**
 * How long a record can sit unresolved before it stops being shown.
 *
 * Deliberately generous. The panel allows a deadline of up to two hours, so
 * anything shorter could hide a transaction that is still genuinely live, and
 * hiding a real pending swap is the failure this module exists to prevent. The
 * cost of erring long is a stale row in a session left open for hours; the cost
 * of erring short is the original bug, wearing a timer.
 */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000

/**
 * How long a finished transaction stays readable after its outcome is known.
 *
 * The store exists so a transaction still in the air survives the panel being
 * unmounted. A finished one does not need that, and keeping it for the whole
 * window above was a mistake with a sharp edge: a swap that succeeded left the
 * panel reading "Swap again" for two hours, across reloads, and that press only
 * clears it - so the next trade looked like a dead button and no wallet prompt.
 *
 * Long enough to read a confirmation and follow the explorer link, then gone.
 */
export const SETTLED_GRACE_MS = 90 * 1000

const idOf = (address, chainId) =>
  address && chainId ? `${String(address).toLowerCase()}|${chainId}` : null

function emit() {
  for (const fn of listeners) fn()
}

/** @returns {() => void} unsubscribe */
export function subscribePendingSwap(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * The outstanding transaction for one wallet on one chain, or null.
 *
 * Returns the stored object itself rather than a copy, because this is read
 * through `useSyncExternalStore`: a fresh object on every call would compare
 * unequal to the last one and re-render for ever.
 */
export function readPendingSwap(address, chainId, nowMs = Date.now()) {
  const id = idOf(address, chainId)
  if (!id) return null

  const record = records.get(id)
  if (!record) return null
  if (nowMs - record.startedAt > PENDING_TTL_MS) return null
  /*
   * Finished, and past the window where its result is still worth showing.
   * Compared against null rather than tested for truth: a settledAt of 0 is a
   * real timestamp and a falsy one, and reading it as "never settled" would
   * quietly restore the behaviour this exists to remove.
   */
  if (record.settledAt != null && nowMs - record.settledAt > SETTLED_GRACE_MS) return null

  return record
}

/**
 * Note a hash that has just been sent.
 *
 * Merged into whatever is already there, because an approval and the swap that
 * follows it are two transactions of the same trade and the panel shows both.
 */
export function recordPendingSwap({
  address,
  chainId,
  approveHash,
  swapHash,
  pair,
  nowMs = Date.now(),
}) {
  const id = idOf(address, chainId)
  if (!id) return null

  const prev = records.get(id)
  const next = {
    address,
    chainId,
    approveHash: approveHash ?? prev?.approveHash ?? null,
    swapHash: swapHash ?? prev?.swapHash ?? null,
    pair: pair ?? prev?.pair ?? null,
    startedAt: prev?.startedAt ?? nowMs,
    // A new hash means something is outstanding again.
    settledAt: null,
  }

  records.set(id, next)
  emit()
  return next
}

/** Forget a trade that has finished, or one the user has moved on from. */
export function clearPendingSwap(address, chainId) {
  const id = idOf(address, chainId)
  if (!id || !records.has(id)) return

  records.delete(id)
  emit()
}

/** Every account's records. For a disconnect, and for tests. */
export function clearAllPendingSwaps() {
  if (records.size === 0) return
  records.clear()
  emit()
}

/**
 * How a trade is described on a row that has outlived its inputs.
 *
 * Symbols and the amount as typed, captured at the moment of sending. A record
 * can be read back beside a completely different pair - that is the whole point
 * of it surviving - so "Swap" on its own would name the wrong trade.
 */
export function tradeLabel(from, to, amount) {
  if (!from?.symbol || !to?.symbol) return null
  return { from: from.symbol, to: to.symbol, amount: String(amount ?? '') }
}

/**
 * Note that the transaction has an outcome, so it stops counting as in flight.
 *
 * Kept briefly rather than deleted outright: the panel still has a confirmation
 * to show and an explorer link to offer. What it must not do is greet the next
 * visitor with the last trade's result and a button that only clears it.
 */
export function markPendingSwapSettled(address, chainId, nowMs = Date.now()) {
  const id = idOf(address, chainId)
  if (!id) return

  const record = records.get(id)
  if (!record || record.settledAt != null) return

  records.set(id, { ...record, settledAt: nowMs })
  emit()
}
