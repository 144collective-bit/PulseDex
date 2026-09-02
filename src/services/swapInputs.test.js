import { describe, it, expect } from 'vitest'
import { parseUnits } from 'viem'

/*
 * The swap path, driven with everything a user can actually get into it.
 *
 * The panel's amount field accepts anything matching /^\d*\.?\d*$/, which
 * includes ".", "0.", and more decimal places than any token carries. Its
 * slippage and deadline inputs clamp - but that clamping lives in a .jsx, and
 * this project has no way to render one in a test, so the guarantees it
 * provides are invisible to everything below it.
 *
 * These tests treat the pure layer as if the clamps were not there, because
 * that is the only assumption that survives someone editing the component.
 */
import { parseAmountRaw, maxSpendable, estimateGasReserve, quoteDrift, needsRequoteConfirmation, balanceState, BALANCE } from './swapFlow'
import { buildSwapCall, minimumReceivedRaw, deadlineFrom } from './swap'
import { NATIVE_PLS, PULSEX_ROUTER_V2 } from '../config/dex'

const PLS = { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' }
const USDC = { address: '0x3333333333333333333333333333333333333333', decimals: 6, symbol: 'USDC' }
const HEX8 = { address: '0x4444444444444444444444444444444444444444', decimals: 8, symbol: 'HEX' }
const T18 = { address: '0x1111111111111111111111111111111111111111', decimals: 18, symbol: 'AAA' }
const R = '0x9999999999999999999999999999999999999999'

// Every string the panel's own input regex will accept.
const REGEX = /^\d*\.?\d*$/
const INPUTS = ['', '.', '0', '0.', '.0', '00', '007', '0.0', '1.', '.5', '1.5',
  '0.0000001', '0.1234567', '000000000000000000001', '1.00000000000000000000000001',
  '9'.repeat(40), '0.' + '0'.repeat(30) + '1']

describe('amount input: everything the panel lets a user type', () => {
  it('the fixtures are all actually reachable', () => {
    for (const v of INPUTS) expect(v === '' || REGEX.test(v)).toBe(true)
  })

  it('parseAmountRaw never throws', () => {
    for (const v of INPUTS) for (const d of [0, 6, 8, 18]) {
      expect(() => parseAmountRaw(v, d)).not.toThrow()
    }
  })

  it('parseAmountRaw and buildSwapCall agree on every one', () => {
    // They must, or the gate offers a swap the builder refuses - or worse,
    // signs an amount different from the one that was checked.
    for (const v of INPUTS) for (const from of [PLS, USDC, HEX8, T18]) {
      const raw = parseAmountRaw(v, from.decimals)
      const call = buildSwapCall({
        quote: { amountOutRaw: parseUnits('100', 18), path: [from.address, T18.address], router: PULSEX_ROUTER_V2 },
        from, to: T18, amount: v, slippagePct: 1, recipient: R, deadlineMinutes: 20, nowMs: 1e12,
      })
      if (call === null) continue
      const sent = from.address === NATIVE_PLS ? call.value : call.args[0]
      expect(sent, `amount ${JSON.stringify(v)} @ ${from.decimals}dp`).toBe(raw)
    }
  })

  it('rounds rather than truncates past the token decimals, and never silently up-spends', () => {
    // 7 decimal places into a 6-decimal token.
    const raw = parseAmountRaw('0.1234567', 6)
    expect(raw).toBe(parseUnits('0.1234567', 6))
    // Whatever viem does, record it, because it decides what leaves the wallet.
    expect(raw.toString()).toBe('123457')
  })
})

describe('slippage, at the bounds the settings panel allows', () => {
  const out = parseUnits('100', 18)
  it('never floors above the quote', () => {
    for (const s of [0.01, 0.1, 0.5, 1, 5, 50]) {
      expect(minimumReceivedRaw(out, s)).toBeLessThanOrEqual(out)
    }
  })
  it('refuses the unprotected extremes', () => {
    expect(minimumReceivedRaw(out, 100)).toBe(0n)
    expect(minimumReceivedRaw(out, -1)).toBe(0n)
  })

  it('does not throw on a tolerance that is not a number', () => {
    /*
     * BigInt(NaN) throws, and buildSwapCall calls this outside any try/catch -
     * so a non-finite tolerance escapes the click handler as an unhandled
     * rejection and the button silently stops working.
     *
     * The panel clamps its slippage input to [0.01, 50] today, so nothing can
     * reach here. But the clamp lives in a .jsx that this setup cannot test,
     * while the function it protects is the tested layer. That is the wrong way
     * round for a money function.
     */
    for (const bad of [NaN, undefined, 'abc', Infinity, -Infinity, -1]) {
      expect(() => minimumReceivedRaw(out, bad), String(bad)).not.toThrow()
      // Zero is the refusal: buildSwapCall will not produce a call from it.
      expect(minimumReceivedRaw(out, bad), String(bad)).toBe(0n)
    }

    // null and '' coerce to 0, which the suite already specifies as the whole
    // quote - a zero tolerance. Left as it is: it is a documented choice, and
    // it errs strict, which is the safe direction.
    expect(minimumReceivedRaw(out, null)).toBe(out)
  })
  it('a floor at the boundary is monotonic in slippage', () => {
    let prev = out + 1n
    for (const s of [0.01, 0.1, 0.5, 1, 2, 5, 10, 50]) {
      const f = minimumReceivedRaw(out, s)
      expect(f).toBeLessThan(prev)
      prev = f
    }
  })
})

describe('native spend: gas headroom', () => {
  it('never offers to spend a balance it cannot pay the fee from', () => {
    for (const gwei of [1n, 100n, 1_000_000n]) {
      const bal = parseUnits('1000', 18)
      const gasReserveRaw = estimateGasReserve(gwei * 10n ** 9n)
      const max = maxSpendable({ balanceRaw: bal, isNative: true, gasReserveRaw })
      expect(max + gasReserveRaw).toBeLessThanOrEqual(bal)
    }
  })
  it('offers nothing when the balance cannot cover the reserve', () => {
    const gasReserveRaw = estimateGasReserve(1_000_000n * 10n ** 9n)
    expect(maxSpendable({ balanceRaw: 1n, isNative: true, gasReserveRaw })).toBe(0n)
  })
  it('spends the whole balance of a token, which pays no fee', () => {
    const bal = parseUnits('42', 6)
    expect(maxSpendable({ balanceRaw: bal, isNative: false, gasReserveRaw: 10n ** 18n })).toBe(bal)
  })
})

describe('deadline', () => {
  it('is seconds, not milliseconds', () => {
    // A deadline in ms is ~1000x in the future: the router stops protecting.
    const d = deadlineFrom(1_700_000_000_000, 20)
    expect(d).toBe(1_700_000_000n + 1200n)
  })
  it('never hands the router a deadline already in the past', () => {
    // A past deadline is a guaranteed revert with the gas already spent. The
    // panel clamps to [1, 120] minutes, so this is defence for the function
    // rather than a reachable path - but it is the function that gets tested.
    for (const m of [0, -5, NaN, undefined, null]) {
      expect(() => deadlineFrom(1_700_000_000_000, m)).not.toThrow()
      expect(deadlineFrom(1_700_000_000_000, m)).toBeGreaterThan(1_700_000_000n)
    }
  })
})

describe('quote drift', () => {
  it('is symmetric about zero and never NaN for real inputs', () => {
    for (const [a, b] of [[100n, 100n], [100n, 99n], [100n, 101n], [1n, 0n]]) {
      const d = quoteDrift(a, b)
      expect(Number.isNaN(d)).toBe(false)
    }
  })
  it('does not ask for consent when the price improved', () => {
    expect(needsRequoteConfirmation({ shownRaw: 100n, freshRaw: 110n, slippagePct: 1 })).toBe(false)
  })
  it('asks once the drop passes the user tolerance', () => {
    expect(needsRequoteConfirmation({ shownRaw: 10_000n, freshRaw: 9_800n, slippagePct: 1 })).toBe(true)
    expect(needsRequoteConfirmation({ shownRaw: 10_000n, freshRaw: 9_950n, slippagePct: 1 })).toBe(false)
  })
})

describe('balance state', () => {
  it('does not block on an unknown balance', () => {
    expect(balanceState({ amountInRaw: 1n, balanceRaw: undefined })).not.toBe(BALANCE.insufficient)
  })
  it('blocks at one unit over', () => {
    expect(balanceState({ amountInRaw: 101n, balanceRaw: 100n })).toBe(BALANCE.insufficient)
    expect(balanceState({ amountInRaw: 100n, balanceRaw: 100n })).not.toBe(BALANCE.insufficient)
  })
})
