import { describe, expect, it } from 'vitest'
import {
  MAX_OVERLAP,
  SUGGESTION_WEIGHTS,
  followSuggestions,
  suggestionReason,
} from './followSuggestions'

const addr = (c) => `0x${c.repeat(40)}`
const READER = addr('1')
const A = addr('a')
const B = addr('b')
const C = addr('c')

describe('followSuggestions', () => {
  it('suggests somebody whose posts the reader reacted to', () => {
    const out = followSuggestions({ affinity: { reacted: [A] }, viewer: READER })
    expect(out).toHaveLength(1)
    expect(out[0].address).toBe(A)
    expect(out[0].reason).toMatch(/reacted/i)
  })

  /*
   * The strongest suggestion a site can make, because it is not a prediction -
   * it points out something the reader has already demonstrated and simply
   * not acted on.
   */
  it('ranks what the reader did above what the graph guesses', () => {
    const out = followSuggestions({
      affinity: { reacted: [A] },
      overlap: { [B]: 20 },
      viewer: READER,
    })
    expect(out[0].address).toBe(A)
  })

  it('caps the graph below the weakest direct signal, at any overlap', () => {
    expect(MAX_OVERLAP).toBeLessThan(SUGGESTION_WEIGHTS.reacted)

    const out = followSuggestions({ overlap: { [B]: 1000 }, viewer: READER })
    expect(out[0].score).toBe(MAX_OVERLAP)
  })

  it('orders the direct signals by how much they say', () => {
    const out = followSuggestions({
      affinity: { bookmarked: [A], replied: [B], reacted: [C] },
      viewer: READER,
    })
    expect(out.map((s) => s.address)).toEqual([A, B, C])
  })

  it('adds up several signals for the same person', () => {
    const out = followSuggestions({ affinity: { replied: [A], reacted: [A] }, viewer: READER })
    expect(out[0].score).toBeCloseTo(SUGGESTION_WEIGHTS.replied + SUGGESTION_WEIGHTS.reacted, 9)
  })

  it('counts a kind once per person however many rows name them', () => {
    const many = Array.from({ length: 30 }, () => A)
    const out = followSuggestions({ affinity: { reacted: many }, viewer: READER })
    expect(out[0].score).toBe(SUGGESTION_WEIGHTS.reacted)
  })

  it('never suggests somebody already followed', () => {
    const out = followSuggestions({
      affinity: { reacted: [A, B] },
      following: [A],
      viewer: READER,
    })
    expect(out.map((s) => s.address)).toEqual([B])
  })

  /*
   * The exclusion that matters most. Suggesting an account somebody
   * deliberately silenced tells them the mute did not take - and a mute is the
   * one thing the reader has said unambiguously.
   */
  it('never suggests somebody the reader muted', () => {
    const out = followSuggestions({
      affinity: { bookmarked: [A] },
      overlap: { [A]: 10 },
      muted: [A],
      viewer: READER,
    })
    expect(out).toEqual([])
  })

  it('never suggests the reader themselves', () => {
    const out = followSuggestions({
      affinity: { reacted: [READER], replied: [READER] },
      overlap: { [READER]: 5 },
      viewer: READER,
    })
    expect(out).toEqual([])
  })

  it('does not care what case any of it arrived in', () => {
    const out = followSuggestions({
      affinity: { reacted: [A.toUpperCase()] },
      following: [],
      viewer: READER.toUpperCase(),
    })
    expect(out[0].address).toBe(A)
  })

  it('excludes a followed account however the case arrived', () => {
    const out = followSuggestions({
      affinity: { reacted: [A] },
      following: [A.toUpperCase()],
      viewer: READER,
    })
    expect(out).toEqual([])
  })

  /*
   * A list that reshuffles between renders reads as the site changing its mind
   * at somebody. Two candidates with identical scores must come back in the
   * same order every time.
   */
  it('is stable when scores tie', () => {
    const once = followSuggestions({ affinity: { reacted: [A, B, C] }, viewer: READER })
    const twice = followSuggestions({ affinity: { reacted: [C, B, A] }, viewer: READER })
    expect(once.map((s) => s.address)).toEqual(twice.map((s) => s.address))
  })

  it('reads the overlap as a Map as well as an object', () => {
    const out = followSuggestions({ overlap: new Map([[B, 2]]), viewer: READER })
    expect(out[0].address).toBe(B)
    expect(out[0].reason).toMatch(/2 people you follow/)
  })

  it('ignores an overlap count that is not a positive number', () => {
    const out = followSuggestions({
      overlap: { [A]: 0, [B]: -3, [C]: 'many' },
      viewer: READER,
    })
    expect(out).toEqual([])
  })

  it('honours the limit', () => {
    const lots = Array.from({ length: 30 }, (_, i) => addr(String.fromCharCode(97 + (i % 26))))
    const out = followSuggestions({ affinity: { reacted: lots }, viewer: READER, limit: 4 })
    expect(out).toHaveLength(4)
  })

  it('is empty for somebody with no history, rather than guessing', () => {
    expect(followSuggestions({ viewer: READER })).toEqual([])
    expect(followSuggestions()).toEqual([])
    expect(followSuggestions({ affinity: null, overlap: null })).toEqual([])
  })

  // A candidate's own follower count is deliberately not a signal: "lots of
  // people follow them" is what makes early accounts permanent.
  it('reads no popularity signal at all', () => {
    const out = followSuggestions({
      affinity: { reacted: [A] },
      // Even if a caller passed one, there is no parameter for it to land in.
      followers: { [B]: 10_000 },
      viewer: READER,
    })
    expect(out.map((s) => s.address)).toEqual([A])
  })
})

describe('suggestionReason', () => {
  it('always says something, because a suggestion that cannot is one nobody should act on', () => {
    expect(suggestionReason(new Set(), undefined).length).toBeGreaterThan(5)
    expect(suggestionReason(null, null).length).toBeGreaterThan(5)
  })

  it('gives one reason rather than listing every signal', () => {
    const reason = suggestionReason(new Set(['bookmarked', 'replied', 'reacted']), 3)
    expect(reason).toBe('You saved their posts')
  })

  it('reads the singular when one person is involved', () => {
    expect(suggestionReason(new Set(['overlap']), 1)).toBe('Followed by somebody you follow')
  })

  // Who follows whom is public here, so naming them would leak nothing - but a
  // suggestion that names your friends is social pressure, not information.
  it('counts the people you follow without naming them', () => {
    const reason = suggestionReason(new Set(['overlap']), 4)
    expect(reason).toMatch(/4 people/)
    expect(reason).not.toMatch(/0x/)
  })
})
