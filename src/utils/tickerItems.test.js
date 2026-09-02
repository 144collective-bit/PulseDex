import { describe, it, expect } from 'vitest'
import { selectTickerItems, TICKER_LIMIT } from './tickerItems'

/*
 * The trending bar's selection.
 *
 * The bug this pins: the bar sliced the first fourteen pairs off the feed, and
 * on PulseChain the deepest pools are almost all WPLS pools, so it scrolled
 * "WPLS" fourteen times at fourteen near-identical prices. Verified live.
 *
 * The bar is a .jsx and this project's tests run in node over
 * `src/**\/*.test.js`, so nothing here renders a component - which is exactly
 * why the deciding is in a .js module and the component only draws it.
 */

const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'

let n = 0
const addr = () => `0x${String(n++).padStart(40, '0')}`

const pair = (over = {}) => ({
  pairAddress: addr(),
  baseToken: { address: addr(), symbol: 'TKN' },
  quoteToken: { address: addr(), symbol: 'WPLS' },
  priceUsd: '1',
  ...over,
})

/** A pool of the one WPLS token, quoted against whatever. */
const wplsPool = (quote) =>
  pair({
    baseToken: { address: WPLS, symbol: 'WPLS' },
    quoteToken: { address: addr(), symbol: quote },
  })

describe('selectTickerItems', () => {
  it('shows one WPLS, not one per WPLS pool', () => {
    const items = selectTickerItems([
      wplsPool('DAI'),
      wplsPool('USDC'),
      wplsPool('USDT'),
    ])

    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('WPLS')
  })

  it('keeps the pool the caller ranked highest', () => {
    // The feed arrives sorted by core rank then market score, so the first
    // pool of a token is already its deepest and busiest. Re-ranking here
    // would put the bar at odds with every other surface.
    const best = wplsPool('DAI')
    const rest = wplsPool('USDC')

    expect(selectTickerItems([best, rest])[0].pair).toBe(best)
  })

  it('matches base addresses whatever their case', () => {
    const checksummed = wplsPool('DAI')
    const lower = pair({
      baseToken: { address: WPLS.toLowerCase(), symbol: 'WPLS' },
      quoteToken: { address: addr(), symbol: 'USDC' },
    })

    expect(selectTickerItems([checksummed, lower])).toHaveLength(1)
  })

  it('leaves genuinely different tokens alone', () => {
    const items = selectTickerItems([
      pair({ baseToken: { address: addr(), symbol: 'HEX' } }),
      pair({ baseToken: { address: addr(), symbol: 'PLSX' } }),
      pair({ baseToken: { address: addr(), symbol: 'INC' } }),
    ])

    expect(items.map((i) => i.label)).toEqual(['HEX', 'PLSX', 'INC'])
  })

  it('deduplicates before cutting, so the cut is fourteen tokens', () => {
    // Twenty WPLS pools ahead of the rest is the shape of the live feed: a
    // slice-then-dedupe would have left one entry.
    const feed = [
      ...Array.from({ length: 20 }, (_, i) => wplsPool(`Q${i}`)),
      ...Array.from({ length: 20 }, () => pair({ baseToken: { address: addr(), symbol: 'X' } })),
    ]

    const items = selectTickerItems(feed)

    expect(items).toHaveLength(TICKER_LIMIT)
    expect(new Set(items.map((i) => i.key)).size).toBe(TICKER_LIMIT)
  })

  it('honours a smaller limit', () => {
    const feed = Array.from({ length: 5 }, () => pair({ baseToken: { address: addr(), symbol: 'X' } }))
    expect(selectTickerItems(feed, 3)).toHaveLength(3)
  })

  it('names both sides when the base is a stablecoin', () => {
    // DAI/WPLS is a pool that matters because of WPLS. Labelled "DAI" it is a
    // $1.00 row that never moves.
    const items = selectTickerItems([
      pair({
        baseToken: { address: addr(), symbol: 'DAI' },
        quoteToken: { address: WPLS, symbol: 'WPLS' },
      }),
    ])

    expect(items[0].label).toBe('DAI/WPLS')
  })

  it('names both sides when two contracts share a ticker', () => {
    const items = selectTickerItems([
      pair({ baseToken: { address: addr(), symbol: 'PEPE' }, quoteToken: { address: addr(), symbol: 'WPLS' } }),
      pair({ baseToken: { address: addr(), symbol: 'PEPE' }, quoteToken: { address: addr(), symbol: 'DAI' } }),
      pair({ baseToken: { address: addr(), symbol: 'HEX' }, quoteToken: { address: addr(), symbol: 'WPLS' } }),
    ])

    expect(items.map((i) => i.label)).toEqual(['PEPE/WPLS', 'PEPE/DAI', 'HEX'])
  })

  it('only counts a ticker clash among the rows on screen', () => {
    // The second PEPE falls outside the cut, so the first needs no qualifying.
    const items = selectTickerItems(
      [
        pair({ baseToken: { address: addr(), symbol: 'PEPE' } }),
        pair({ baseToken: { address: addr(), symbol: 'PEPE' } }),
      ],
      1,
    )

    expect(items.map((i) => i.label)).toEqual(['PEPE'])
  })

  it('drops a pair with no way to identify its token', () => {
    expect(selectTickerItems([pair({ baseToken: { address: '', symbol: '' } })])).toEqual([])
  })

  it('falls back to the ticker when a pair carries no base address', () => {
    // Two address-less pairs are two tokens unless they share a ticker - the
    // empty string must not become a bucket everything lands in.
    const items = selectTickerItems([
      pair({ baseToken: { symbol: 'AAA' } }),
      pair({ baseToken: { symbol: 'BBB' } }),
      pair({ baseToken: { symbol: 'aaa' } }),
    ])

    expect(items.map((i) => i.symbol)).toEqual(['AAA', 'BBB'])
  })

  it('handles nothing at all', () => {
    expect(selectTickerItems([])).toEqual([])
    expect(selectTickerItems(undefined)).toEqual([])
    expect(selectTickerItems(null)).toEqual([])
  })

  it('carries the pair through for the click handler and the numbers', () => {
    const p = pair({ baseToken: { address: WPLS, symbol: 'WPLS' }, priceUsd: '0.000042' })
    const [item] = selectTickerItems([p])

    expect(item.pair).toBe(p)
    expect(item.address).toBe(WPLS)
    expect(item.quote).toBe('WPLS')
  })
})
