import { describe, it, expect } from 'vitest'
import { findTypedMentions, splitMentions } from './mentions'

describe('findTypedMentions', () => {
  it('finds a mention somebody typed', () => {
    expect(findTypedMentions('gm @degen')).toEqual(['degen'])
    expect(findTypedMentions('@degen gm')).toEqual(['degen'])
    expect(findTypedMentions('ask @degen and @ape')).toEqual(['degen', 'ape'])
  })

  it('lowercases, because that is how the column matches', () => {
    expect(findTypedMentions('gm @DeGen')).toEqual(['degen'])
  })

  it('counts naming somebody three times as mentioning them once', () => {
    expect(findTypedMentions('@ape @ape @ape')).toEqual(['ape'])
  })

  it('does not read an email address as a mention of its domain', () => {
    // The bug this prevents: every "reach me at x@example.com" pinging an
    // account called example.
    expect(findTypedMentions('reach me at someone@example.com')).toEqual([])
  })

  it('does not find a mention inside a longer run of @', () => {
    expect(findTypedMentions('@@degen')).toEqual([])
  })

  it('stops at punctuation, so a sentence still reads', () => {
    expect(findTypedMentions('thanks @degen!')).toEqual(['degen'])
    expect(findTypedMentions('(@degen)')).toEqual(['degen'])
    expect(findTypedMentions('@degen, @ape.')).toEqual(['degen', 'ape'])
  })

  it('stops at a space, which is why a handle with one cannot be typed', () => {
    // Not a gap. There is no rule that says where "@Pulse Trader" ends, so
    // the composer's list is the only way to mention that account - and
    // splitMentions below draws it correctly once it has been.
    expect(findTypedMentions('gm @Pulse Trader')).toEqual(['pulse'])
  })

  it('refuses a handle longer than the column allows', () => {
    expect(findTypedMentions(`@${'a'.repeat(33)}`)).toEqual([`${'a'.repeat(32)}`])
    expect(findTypedMentions('@')).toEqual([])
    expect(findTypedMentions('@ ')).toEqual([])
  })

  it('starts each search from the beginning', () => {
    // A global regex kept at module scope carries lastIndex between calls, so
    // the second call would start wherever the first one stopped and find
    // nothing. Two identical calls must agree.
    const once = findTypedMentions('gm @degen')
    const twice = findTypedMentions('gm @degen')
    expect(twice).toEqual(once)
  })

  it('answers for anything that is not text', () => {
    expect(findTypedMentions(null)).toEqual([])
    expect(findTypedMentions(undefined)).toEqual([])
    expect(findTypedMentions(42)).toEqual([])
    expect(findTypedMentions('')).toEqual([])
  })
})

describe('splitMentions', () => {
  const degen = { handle: 'degen', address: '0xaaa' }
  const ape = { handle: 'ape', address: '0xbbb' }

  it('splits a body around the mention', () => {
    expect(splitMentions('gm @degen wgmi', [degen])).toEqual([
      { type: 'text', value: 'gm ' },
      { type: 'mention', value: '@degen', handle: 'degen', address: '0xaaa' },
      { type: 'text', value: ' wgmi' },
    ])
  })

  it('draws a handle containing a space, which no pattern could have found', () => {
    // The whole reason mentions are stored as rows. The composer recorded who
    // was meant; the exact text is known here, so it is searched for
    // literally rather than matched.
    const trader = { handle: 'Pulse Trader', address: '0xccc' }
    expect(splitMentions('gm @Pulse Trader wgmi', [trader])).toEqual([
      { type: 'text', value: 'gm ' },
      { type: 'mention', value: '@Pulse Trader', handle: 'Pulse Trader', address: '0xccc' },
      { type: 'text', value: ' wgmi' },
    ])
  })

  it('prefers the longer handle where one contains the other', () => {
    const pulse = { handle: 'pulse', address: '0xddd' }
    const pulseTrader = { handle: 'pulse trader', address: '0xeee' }
    const out = splitMentions('gm @pulse trader', [pulse, pulseTrader])
    expect(out).toEqual([
      { type: 'text', value: 'gm ' },
      { type: 'mention', value: '@pulse trader', handle: 'pulse trader', address: '0xeee' },
    ])
    // Taking the shorter one first would have left "trader" stranded beside a
    // link to the wrong person.
    expect(out.some((s) => s.type === 'text' && s.value.includes('trader'))).toBe(false)
  })

  it('matches however it was capitalised', () => {
    const out = splitMentions('gm @DEGEN', [degen])
    expect(out[1]).toMatchObject({ type: 'mention', value: '@DEGEN', address: '0xaaa' })
  })

  it('handles several mentions, and repeats of one', () => {
    const out = splitMentions('@degen and @ape and @degen', [degen, ape])
    expect(out.filter((s) => s.type === 'mention')).toHaveLength(3)
    expect(out.map((s) => s.address).filter(Boolean)).toEqual(['0xaaa', '0xbbb', '0xaaa'])
  })

  it('leaves the body alone when a mention row names somebody the text does not', () => {
    // Reachable: a post is edited and the name taken out, while the row stays.
    expect(splitMentions('nothing here', [degen])).toEqual([
      { type: 'text', value: 'nothing here' },
    ])
  })

  it('treats a handle with regex characters as text, not as a pattern', () => {
    // ".*" in a handle would otherwise match the rest of the post and swallow
    // it into one enormous link.
    const awkward = { handle: 'a.*b', address: '0xfff' }
    const out = splitMentions('gm @a.*b and @aXXb', [awkward])
    expect(out).toEqual([
      { type: 'text', value: 'gm ' },
      { type: 'mention', value: '@a.*b', handle: 'a.*b', address: '0xfff' },
      { type: 'text', value: ' and @aXXb' },
    ])
  })

  it('returns one text segment when there is nothing to mark up', () => {
    expect(splitMentions('plain', [])).toEqual([{ type: 'text', value: 'plain' }])
    expect(splitMentions('plain')).toEqual([{ type: 'text', value: 'plain' }])
  })

  it('answers for anything that is not text', () => {
    expect(splitMentions(null, [degen])).toEqual([])
    expect(splitMentions('', [degen])).toEqual([])
    expect(splitMentions('gm', null)).toEqual([{ type: 'text', value: 'gm' }])
  })

  it('ignores a malformed mention row rather than throwing on it', () => {
    const out = splitMentions('gm @degen', [null, { address: '0x1' }, degen])
    expect(out[1]).toMatchObject({ type: 'mention', address: '0xaaa' })
  })

  it('never loses or invents a character', () => {
    // The segments are the body, split. Anything else is a rendering bug that
    // would show as duplicated or missing text.
    const body = 'gm @degen and @ape, wgmi'
    const joined = splitMentions(body, [degen, ape])
      .map((s) => s.value)
      .join('')
    expect(joined).toBe(body)
  })
})
