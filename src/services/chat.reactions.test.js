import { describe, it, expect } from 'vitest'
import { tallyReactions } from './chat'

const ME = '0xaaaa000000000000000000000000000000000000'
const THEM = '0xbbbb000000000000000000000000000000000000'

describe('tallyReactions', () => {
  it('counts each emoji once per person', () => {
    const tally = tallyReactions(
      [
        { emoji: '🔥', address: ME },
        { emoji: '🔥', address: THEM },
        { emoji: '👍', address: THEM },
      ],
      ME,
    )
    expect(tally).toEqual([
      { emoji: '🔥', count: 2, mine: true },
      { emoji: '👍', count: 1, mine: false },
    ])
  })

  it('orders by count, then by emoji so a tie does not reshuffle', () => {
    const reactions = [
      { emoji: '👍', address: ME },
      { emoji: '🔥', address: THEM },
    ]
    const first = tallyReactions(reactions, null)
    const second = tallyReactions([...reactions].reverse(), null)
    expect(first).toEqual(second)
  })

  it('recognises mine whatever case the address arrives in', () => {
    // The same account everywhere except a string compare - and this is the
    // bug that ends with somebody unable to take back their own reaction.
    const tally = tallyReactions([{ emoji: '🔥', address: ME }], ME.toUpperCase())
    expect(tally[0].mine).toBe(true)
  })

  it("is nobody's when signed out", () => {
    const tally = tallyReactions([{ emoji: '🔥', address: ME }], null)
    expect(tally[0].mine).toBe(false)
  })

  it('ignores malformed entries rather than throwing', () => {
    const tally = tallyReactions([null, {}, { emoji: 42 }, { emoji: '🔥', address: ME }], ME)
    expect(tally).toEqual([{ emoji: '🔥', count: 1, mine: true }])
  })

  it('is empty for nothing at all', () => {
    expect(tallyReactions(undefined, ME)).toEqual([])
    expect(tallyReactions([], ME)).toEqual([])
  })
})
