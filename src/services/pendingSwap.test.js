import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readPendingSwap,
  recordPendingSwap,
  clearPendingSwap,
  clearAllPendingSwaps,
  subscribePendingSwap,
  tradeLabel,
  PENDING_TTL_MS,
  SETTLED_GRACE_MS,
  markPendingSwapSettled,
} from './pendingSwap'

/*
 * A sent transaction outliving the panel that sent it.
 *
 * The compact swap panel on the token page is keyed on the token being viewed,
 * so opening a different token unmounts it. While the hash lived in React
 * state, that took it with them: the swap still settled, but the user was left
 * with no link to the explorer, no confirmation, and no notice if it reverted.
 *
 * These are the properties the panel depends on. The reference stability one is
 * not a nicety - it is read through useSyncExternalStore, which compares
 * snapshots by identity and will re-render for ever if handed a new object
 * every time.
 */

const A = '0xAaAa000000000000000000000000000000000001'
const B = '0xBbBb000000000000000000000000000000000002'
const HASH = '0xdeadbeef'
const PAIR = { from: 'PLS', to: 'PLSX', amount: '1000' }

beforeEach(() => clearAllPendingSwaps())

describe('a record outliving its panel', () => {
  it('is still there after the component that made it is gone', () => {
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, pair: PAIR })
    // Nothing unmounts a module. This is the whole fix.
    expect(readPendingSwap(A, 369)?.swapHash).toBe(HASH)
  })

  it('returns the same object every read, so a subscriber can compare it', () => {
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH })
    expect(readPendingSwap(A, 369)).toBe(readPendingSwap(A, 369))
  })

  it('returns a stable null when there is nothing, rather than a fresh object', () => {
    expect(readPendingSwap(A, 369)).toBeNull()
    expect(readPendingSwap(A, 369)).toBeNull()
  })
})

describe('whose transaction it is', () => {
  it('does not show one account the other account’s transaction', () => {
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH })
    expect(readPendingSwap(B, 369)).toBeNull()
  })

  it('matches an address whatever case it arrives in', () => {
    // Wallets disagree about checksum casing, and the same account read two
    // ways must not become two accounts.
    recordPendingSwap({ address: A.toLowerCase(), chainId: 369, swapHash: HASH })
    expect(readPendingSwap(A.toUpperCase().replace('0X', '0x'), 369)?.swapHash).toBe(HASH)
  })

  it('does not carry a hash across chains', () => {
    // The explorer for one chain has never heard of the other's transactions.
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH })
    expect(readPendingSwap(A, 1)).toBeNull()
  })

  it('records nothing without an account or a chain', () => {
    expect(recordPendingSwap({ address: null, chainId: 369, swapHash: HASH })).toBeNull()
    expect(recordPendingSwap({ address: A, chainId: null, swapHash: HASH })).toBeNull()
    expect(readPendingSwap(null, null)).toBeNull()
  })
})

describe('an approval and the swap that follows it', () => {
  it('are held together, as two transactions of one trade', () => {
    recordPendingSwap({ address: A, chainId: 369, approveHash: '0xapprove', pair: PAIR })
    recordPendingSwap({ address: A, chainId: 369, swapHash: '0xswap' })

    const rec = readPendingSwap(A, 369)
    expect(rec.approveHash).toBe('0xapprove')
    expect(rec.swapHash).toBe('0xswap')
  })

  it('keep the label from whichever arrived with one', () => {
    recordPendingSwap({ address: A, chainId: 369, approveHash: '0xa', pair: PAIR })
    recordPendingSwap({ address: A, chainId: 369, swapHash: '0xs' })
    expect(readPendingSwap(A, 369).pair).toEqual(PAIR)
  })

  it('age from the first of them, not the latest', () => {
    /*
     * Otherwise each new hash renews the clock, and a trade that keeps being
     * retried never grows old enough to be cleaned up.
     */
    recordPendingSwap({ address: A, chainId: 369, approveHash: '0xa', nowMs: 1000 })
    recordPendingSwap({ address: A, chainId: 369, swapHash: '0xs', nowMs: 9999 })
    expect(readPendingSwap(A, 369, 9999).startedAt).toBe(1000)
  })
})

describe('growing stale', () => {
  it('stops showing a record older than the window', () => {
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    expect(readPendingSwap(A, 369, PENDING_TTL_MS + 1)).toBeNull()
  })

  it('keeps showing one that has not aged out', () => {
    // Erring long is deliberate: hiding a transaction that is still live is the
    // bug this module exists to prevent, so the window outlasts any deadline
    // the panel can set.
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    expect(readPendingSwap(A, 369, PENDING_TTL_MS - 1)?.swapHash).toBe(HASH)
  })

  it('outlasts the longest deadline the panel offers', () => {
    expect(PENDING_TTL_MS).toBeGreaterThanOrEqual(120 * 60 * 1000)
  })
})

describe('clearing', () => {
  it('forgets one account without touching another', () => {
    recordPendingSwap({ address: A, chainId: 369, swapHash: '0xa' })
    recordPendingSwap({ address: B, chainId: 369, swapHash: '0xb' })

    clearPendingSwap(A, 369)
    expect(readPendingSwap(A, 369)).toBeNull()
    expect(readPendingSwap(B, 369)?.swapHash).toBe('0xb')
  })
})

describe('telling the panel something changed', () => {
  it('notifies on a record and on a clear', () => {
    const seen = vi.fn()
    const off = subscribePendingSwap(seen)

    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH })
    expect(seen).toHaveBeenCalledTimes(1)

    clearPendingSwap(A, 369)
    expect(seen).toHaveBeenCalledTimes(2)

    off()
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('does not notify for a clear that changed nothing', () => {
    // A no-op emit re-renders every panel for no reason.
    const seen = vi.fn()
    const off = subscribePendingSwap(seen)
    clearPendingSwap(A, 369)
    expect(seen).not.toHaveBeenCalled()
    off()
  })
})

describe('tradeLabel', () => {
  it('captures what the trade was at the moment of sending', () => {
    expect(tradeLabel({ symbol: 'PLS' }, { symbol: 'PLSX' }, '1000')).toEqual(PAIR)
  })

  it('has nothing to say without both symbols', () => {
    expect(tradeLabel({ symbol: 'PLS' }, null, '1')).toBeNull()
    expect(tradeLabel(null, { symbol: 'PLSX' }, '1')).toBeNull()
  })
})

describe('once a transaction has a result', () => {
  it('stops being offered after a short grace, not after the full window', () => {
    /*
     * The regression this fixes, reported from the live site: a swap succeeded,
     * and on the next visit the panel still showed it. The button then reads
     * "Swap again", whose press only clears state - so the next trade looked
     * like a dead button with no wallet prompt and no transaction.
     *
     * In flight, a record has to outlive an unmount. Settled, it must not
     * outlive the confirmation it is there to show.
     */
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    markPendingSwapSettled(A, 369, 0)

    expect(readPendingSwap(A, 369, SETTLED_GRACE_MS - 1)?.swapHash).toBe(HASH)
    expect(readPendingSwap(A, 369, SETTLED_GRACE_MS + 1)).toBeNull()
  })

  it('leaves an unsettled record alone for the full window', () => {
    // A transaction still in the air is exactly what the store is for.
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    expect(readPendingSwap(A, 369, SETTLED_GRACE_MS + 1)?.swapHash).toBe(HASH)
    expect(readPendingSwap(A, 369, PENDING_TTL_MS - 1)?.swapHash).toBe(HASH)
  })

  it('starts the grace at the outcome, not at the send', () => {
    // A slow transaction must not have its confirmation cut short.
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    markPendingSwapSettled(A, 369, 60_000)
    expect(readPendingSwap(A, 369, 60_000 + SETTLED_GRACE_MS - 1)?.swapHash).toBe(HASH)
    expect(readPendingSwap(A, 369, 60_000 + SETTLED_GRACE_MS + 1)).toBeNull()
  })

  it('does not restart the grace once it has been set', () => {
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    markPendingSwapSettled(A, 369, 0)
    markPendingSwapSettled(A, 369, 80_000)
    expect(readPendingSwap(A, 369, SETTLED_GRACE_MS + 1)).toBeNull()
  })

  it('counts as in flight again when a new hash arrives', () => {
    // The approval that follows a settled swap is a live transaction, and the
    // record has to go back to protecting it.
    recordPendingSwap({ address: A, chainId: 369, swapHash: HASH, nowMs: 0 })
    markPendingSwapSettled(A, 369, 0)
    recordPendingSwap({ address: A, chainId: 369, approveHash: '0xnew', nowMs: 10 })
    expect(readPendingSwap(A, 369, SETTLED_GRACE_MS + 1000)?.approveHash).toBe('0xnew')
  })

  it('does nothing for an account with no record', () => {
    markPendingSwapSettled(B, 369, 0)
    expect(readPendingSwap(B, 369, 0)).toBeNull()
  })

  it('keeps the grace shorter than the in-flight window', () => {
    expect(SETTLED_GRACE_MS).toBeLessThan(PENDING_TTL_MS)
  })
})
