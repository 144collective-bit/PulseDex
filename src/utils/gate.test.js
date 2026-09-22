import { describe, it, expect } from 'vitest'
import {
  BALANCE_GRACE_MS,
  BALANCE_TTL_MS,
  GATE,
  asAmount,
  fromBaseUnits,
  gateDecision,
  isFresh,
  roomGate,
  toBaseUnits,
} from './gate'

/*
 * Holders-only rooms.
 *
 * Two things are being pinned down here. The arithmetic, because token
 * balances are uint256 and every bug in this area comes from somebody
 * reaching for a JavaScript number. And the decision when a node does not
 * answer, because that is where a gate either becomes an open door or becomes
 * a room nobody can post in.
 */

const TOKEN = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const ONE = 10n ** 18n

describe('asAmount', () => {
  it('reads a decimal string as a BigInt', () => {
    expect(asAmount('1000000000000000000')).toBe(ONE)
  })

  it('survives numbers no double could hold', () => {
    // A uint256 max. Through a Number this is Infinity-adjacent nonsense.
    const max = (2n ** 256n - 1n).toString()
    expect(asAmount(max)).toBe(2n ** 256n - 1n)
  })

  it('takes a BigInt back unchanged', () => {
    expect(asAmount(ONE)).toBe(ONE)
  })

  it('refuses a negative, which a balance never is', () => {
    expect(asAmount(-1n)).toBeNull()
    expect(asAmount(-5)).toBeNull()
    expect(asAmount('-1')).toBeNull()
  })

  it('refuses anything that is not base units', () => {
    for (const value of [
      null,
      undefined,
      {},
      [],
      '',
      '1.5',
      '1e18',
      '0x10',
      ' 12 34 ',
      'NaN',
      1.5,
      Number.MAX_SAFE_INTEGER + 2,
    ]) {
      expect(asAmount(value)).toBeNull()
    }
  })

  it('trims, because a database numeric comes back padded sometimes', () => {
    expect(asAmount('  42  ')).toBe(42n)
  })
})

describe('toBaseUnits', () => {
  it('scales a whole amount', () => {
    expect(toBaseUnits('1000', 18)).toBe(1000n * ONE)
  })

  it('scales a fraction exactly', () => {
    // 0.1 * 10**18 through floating point is 100000000000000000.00000001 or
    // thereabouts, depending on the day. This has to be exact.
    expect(toBaseUnits('0.1', 18)).toBe(10n ** 17n)
    expect(toBaseUnits('0.000000000000000001', 18)).toBe(1n)
  })

  it('handles a token with no decimals', () => {
    expect(toBaseUnits('7', 0)).toBe(7n)
  })

  it('handles the six-decimal case, which is most stablecoins', () => {
    expect(toBaseUnits('1.5', 6)).toBe(1_500_000n)
  })

  it('refuses more precision than the token has', () => {
    // Rounding here would silently store a different gate from the one
    // somebody typed.
    expect(toBaseUnits('1.0000001', 6)).toBeNull()
    expect(toBaseUnits('0.1', 0)).toBeNull()
  })

  it('refuses anything that is not a plain decimal', () => {
    for (const value of ['', '-1', '1e6', 'abc', '1.', '.5', '1.2.3', null, {}]) {
      expect(toBaseUnits(value, 18)).toBeNull()
    }
  })

  it('refuses a nonsense decimals', () => {
    for (const d of [-1, 1.5, 99, null, undefined, '18']) {
      expect(toBaseUnits('1', d)).toBeNull()
    }
  })

  it('round-trips through fromBaseUnits', () => {
    for (const [amount, decimals] of [
      ['1000', 18],
      ['0.1', 18],
      ['1.5', 6],
      ['7', 0],
      ['0.000000000000000001', 18],
    ]) {
      expect(fromBaseUnits(toBaseUnits(amount, decimals), decimals)).toBe(amount)
    }
  })
})

describe('fromBaseUnits', () => {
  it('trims trailing zeros, because nobody says 1.000000000000000000', () => {
    expect(fromBaseUnits(ONE, 18)).toBe('1')
    expect(fromBaseUnits(ONE + 10n ** 17n, 18)).toBe('1.1')
  })

  it('keeps leading zeros inside the fraction', () => {
    expect(fromBaseUnits(10n ** 15n, 18)).toBe('0.001')
  })

  it('is null for rubbish', () => {
    expect(fromBaseUnits('x', 18)).toBeNull()
    expect(fromBaseUnits(ONE, 99)).toBeNull()
  })
})

describe('roomGate', () => {
  it('reads a gate off a room row', () => {
    expect(roomGate({ gate_token: TOKEN, min_balance: '1000' })).toEqual({
      token: TOKEN,
      min: 1000n,
    })
  })

  it('lowercases the token, since balances are looked up by it', () => {
    const mixed = TOKEN.toUpperCase().replace('0X', '0x')
    expect(roomGate({ gate_token: mixed, min_balance: '1' })?.token).toBe(TOKEN)
  })

  it('treats a minimum of zero as no gate at all', () => {
    // Every address holds zero of every token, so a gate at zero admits
    // everybody - which in the interface should read as "open", not as a
    // rule that happens to let everyone through.
    expect(roomGate({ gate_token: TOKEN, min_balance: '0' })).toBeNull()
  })

  it('is null for an ungated room', () => {
    for (const room of [
      null,
      undefined,
      {},
      { gate_token: null, min_balance: null },
      { gate_token: TOKEN },
      { min_balance: '1000' },
      { gate_token: 'not-a-token', min_balance: '1000' },
      { gate_token: TOKEN, min_balance: 'lots' },
    ]) {
      expect(roomGate(room)).toBeNull()
    }
  })
})

describe('gateDecision', () => {
  const min = 1000n
  const now = 1_000_000_000

  it('allows a fresh balance that is enough', () => {
    expect(gateDecision({ fresh: 1000n, cached: null, min, now })).toEqual({
      state: GATE.allowed,
      balance: 1000n,
    })
  })

  it('refuses a fresh balance that is not', () => {
    expect(gateDecision({ fresh: 999n, cached: null, min, now }).state).toBe(GATE.refused)
  })

  it('refuses on a fresh reading even when a cached one passed', () => {
    // Somebody who has just sold. The fresh answer is the answer.
    const out = gateDecision({
      fresh: 0n,
      cached: { balance: 5000n, at: now },
      min,
      now,
    })
    expect(out.state).toBe(GATE.refused)
  })

  describe('when the node does not answer', () => {
    it('keeps somebody in who passed recently', () => {
      const out = gateDecision({
        fresh: null,
        cached: { balance: 5000n, at: now - 1000 },
        min,
        now,
      })
      expect(out.state).toBe(GATE.stale)
      expect(out.balance).toBe(5000n)
    })

    it('stops keeping them in once the grace window is past', () => {
      const out = gateDecision({
        fresh: null,
        cached: { balance: 5000n, at: now - BALANCE_GRACE_MS - 1 },
        min,
        now,
      })
      expect(out.state).toBe(GATE.unknown)
    })

    it('refuses somebody nobody has ever checked', () => {
      // The case that matters most: an outage must not be an open door.
      expect(gateDecision({ fresh: null, cached: null, min, now }).state).toBe(GATE.unknown)
    })

    it('does not let somebody in whose cached balance was too small', () => {
      // The grace window is for keeping people in, never for letting them in.
      const out = gateDecision({
        fresh: null,
        cached: { balance: 1n, at: now },
        min,
        now,
      })
      expect(out.state).toBe(GATE.unknown)
    })

    it('ignores a cached entry that is not a BigInt', () => {
      const out = gateDecision({
        fresh: null,
        cached: { balance: 5000, at: now },
        min,
        now,
      })
      expect(out.state).toBe(GATE.unknown)
    })
  })

  it('treats exactly the minimum as enough', () => {
    // "At least this much" - an off-by-one here turns a round number gate
    // into one nobody can satisfy by holding the round number.
    expect(gateDecision({ fresh: min, cached: null, min, now }).state).toBe(GATE.allowed)
  })
})

describe('isFresh', () => {
  const now = 1_000_000_000

  it('is true inside the window', () => {
    expect(isFresh({ balance: 1n, at: now - 1 }, now)).toBe(true)
  })

  it('is false outside it', () => {
    expect(isFresh({ balance: 1n, at: now - BALANCE_TTL_MS - 1 }, now)).toBe(false)
  })

  it('is false for nothing at all', () => {
    expect(isFresh(null, now)).toBe(false)
    expect(isFresh({ balance: 1n }, now)).toBe(false)
  })
})
