import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * The swap tape, which was silently empty for an unknown length of time.
 *
 * Blockscout renamed two fields - `transaction_hash` to `tx_hash`, and
 * `token.address_hash` to `token.address` - and the reconstruction dropped
 * every row for a missing hash. Nothing reported it, because an empty tape and
 * a quiet pool render identically. These tests pin both spellings so the next
 * rename fails here instead of on the screener.
 */

vi.mock('./pulsescan', () => ({
  fetchWithRetry: vi.fn(),
}))

const { fetchWithRetry } = await import('./pulsescan')
const { fetchPoolSwaps } = await import('./poolSwaps')

const POOL = '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65'
const BASE = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39' // HEX
const QUOTE = '0xa1077a294dde1b09bb078844df40758a5d0f9a27' // WPLS

/** One ERC20 transfer leg, in whichever field spelling is being tested. */
function leg({ hash, token, from, to, value, decimals = 18, modern = true }) {
  return {
    [modern ? 'tx_hash' : 'transaction_hash']: hash,
    timestamp: '2026-09-01T04:36:55.000000Z',
    from: { hash: from },
    to: { hash: to },
    token: modern ? { address: token, symbol: 'T', decimals } : { address_hash: token, symbol: 'T', decimals },
    total: { value, decimals: String(decimals) },
  }
}

/** A buy: the base asset leaves the pool, the quote asset goes in. */
function buyTx(hash, modern = true) {
  return [
    leg({ hash, token: BASE, from: POOL, to: '0xtrader', value: '1000000000000000000', modern }),
    leg({ hash, token: QUOTE, from: '0xtrader', to: POOL, value: '2000000000000000000', modern }),
  ]
}

/** A sell: the base asset goes into the pool. */
function sellTx(hash, modern = true) {
  return [
    leg({ hash, token: BASE, from: '0xtrader', to: POOL, value: '3000000000000000000', modern }),
    leg({ hash, token: QUOTE, from: POOL, to: '0xtrader', value: '6000000000000000000', modern }),
  ]
}

beforeEach(() => {
  fetchWithRetry.mockReset()
})

describe('fetchPoolSwaps', () => {
  it('reads the current PulseScan field names', async () => {
    fetchWithRetry.mockResolvedValue({ items: buyTx('0xaaa', true) })

    const swaps = await fetchPoolSwaps(POOL, BASE)

    expect(swaps).toHaveLength(1)
    expect(swaps[0].hash).toBe('0xaaa')
    expect(swaps[0].baseAmount).toBe(1)
  })

  it('still reads the older field names, so an explorer rollback is survivable', async () => {
    fetchWithRetry.mockResolvedValue({ items: buyTx('0xbbb', false) })

    const swaps = await fetchPoolSwaps(POOL, BASE)

    expect(swaps).toHaveLength(1)
    expect(swaps[0].hash).toBe('0xbbb')
  })

  it('calls it a buy when the base asset leaves the pool', async () => {
    fetchWithRetry.mockResolvedValue({ items: buyTx('0xccc') })

    const [swap] = await fetchPoolSwaps(POOL, BASE)

    expect(swap.side).toBe('buy')
    // 2 WPLS paid for 1 HEX.
    expect(swap.price).toBe(2)
  })

  it('calls it a sell when the base asset goes into the pool', async () => {
    fetchWithRetry.mockResolvedValue({ items: sellTx('0xddd') })

    const [swap] = await fetchPoolSwaps(POOL, BASE)

    expect(swap.side).toBe('sell')
    expect(swap.baseAmount).toBe(3)
  })

  it('ignores a transaction with only one leg, which is a transfer not a swap', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [leg({ hash: '0xeee', token: BASE, from: POOL, to: '0xsomeone', value: '1000000000000000000' })],
    })

    expect(await fetchPoolSwaps(POOL, BASE)).toEqual([])
  })

  it('groups legs by transaction rather than treating each transfer as a trade', async () => {
    fetchWithRetry.mockResolvedValue({
      items: [...buyTx('0x111'), ...sellTx('0x222'), ...buyTx('0x333')],
    })

    const swaps = await fetchPoolSwaps(POOL, BASE)

    expect(swaps).toHaveLength(3)
    expect(swaps.map((s) => s.side)).toEqual(['buy', 'sell', 'buy'])
  })

  it('honours the row limit', async () => {
    const items = []
    for (let i = 0; i < 12; i += 1) items.push(...buyTx(`0x${i}`))
    fetchWithRetry.mockResolvedValue({ items })

    expect(await fetchPoolSwaps(POOL, BASE, 5)).toHaveLength(5)
  })

  it('returns nothing rather than throwing when there is no pool', async () => {
    expect(await fetchPoolSwaps(null, BASE)).toEqual([])
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('survives a response that is not shaped like a list', async () => {
    fetchWithRetry.mockResolvedValue({ items: 'nope' })
    expect(await fetchPoolSwaps(POOL, BASE)).toEqual([])
  })

  it('scales raw integer amounts by the token decimals', async () => {
    // HEX has eight decimals; reading it as eighteen understates a balance by
    // ten orders of magnitude and still renders as an ordinary number.
    fetchWithRetry.mockResolvedValue({
      items: [
        leg({ hash: '0xf1', token: BASE, from: POOL, to: '0xt', value: '150000000', decimals: 8 }),
        leg({ hash: '0xf1', token: QUOTE, from: '0xt', to: POOL, value: '2000000000000000000' }),
      ],
    })

    const [swap] = await fetchPoolSwaps(POOL, BASE)

    expect(swap.baseAmount).toBe(1.5)
  })
})
