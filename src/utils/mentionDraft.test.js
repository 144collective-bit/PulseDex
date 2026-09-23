import { describe, it, expect } from 'vitest'
import { readMentionQuery, applyMention, keepPicked } from './mentionDraft'

/*
 * Typing a mention.
 *
 * The reason this exists at all: a handle here may contain spaces, so
 * "@Pulse Trader" cannot be parsed out of a post by any rule, and those
 * accounts are mentionable only by being picked from a list. So the query
 * allows spaces - a picker that stopped at the first one could never offer
 * the accounts it is the only way to reach.
 */

describe('readMentionQuery', () => {
  it('finds a mention being typed at the caret', () => {
    expect(readMentionQuery('hello @sat', 10)).toEqual({ at: 6, query: 'sat' })
  })

  it('finds an empty one, the moment the @ is typed', () => {
    // The picker opens on "@" and shows who is around, rather than waiting
    // for a letter and making somebody guess that it exists.
    expect(readMentionQuery('hello @', 7)).toEqual({ at: 6, query: '' })
  })

  it('at the very start of a post', () => {
    expect(readMentionQuery('@sat', 4)).toEqual({ at: 0, query: 'sat' })
  })

  it('allows spaces, which is the whole point', () => {
    expect(readMentionQuery('hi @Pulse Trad', 14)).toEqual({ at: 3, query: 'Pulse Trad' })
  })

  it('reads only as far as the caret', () => {
    // Somebody editing the middle of a post is typing where the caret is, not
    // at the end of what is on screen.
    expect(readMentionQuery('hi @sat and more', 7)).toEqual({ at: 3, query: 'sat' })
  })

  describe('knows when nobody is typing one', () => {
    it('no @ at all', () => {
      expect(readMentionQuery('hello there', 11)).toBeNull()
    })

    it('an email address', () => {
      // Otherwise every "you@example.com" opens a picker for "example".
      expect(readMentionQuery('mail me at you@example', 22)).toBeNull()
    })

    it('a doubled @', () => {
      expect(readMentionQuery('@@name', 6)).toBeNull()
    })

    it('after a line break', () => {
      // A mention is written on one line even when a post is not. Without
      // this, pressing Enter leaves the picker searching two paragraphs.
      expect(readMentionQuery('@sat\nand then', 13)).toBeNull()
    })

    it('when what follows the @ is longer than any handle', () => {
      expect(readMentionQuery(`@${'a'.repeat(33)}`, 34)).toBeNull()
    })

    it('when the caret is before the @', () => {
      expect(readMentionQuery('hello @sat', 3)).toBeNull()
    })

    it('for anything that is not text', () => {
      for (const value of [null, undefined, 42, []]) {
        expect(readMentionQuery(value, 3)).toBeNull()
      }
    })
  })

  it('does not walk the whole post looking', () => {
    // Bounded to a handle's length behind the caret. A two-thousand character
    // draft is exactly where a scan per keystroke would be noticed.
    const long = `@sat${' '.repeat(500)}x`
    expect(readMentionQuery(long, long.length)).toBeNull()
  })
})

describe('applyMention', () => {
  it('replaces what was typed with the handle picked', () => {
    expect(applyMention('hello @sat', 10, 'satoshi')).toEqual({
      text: 'hello @satoshi ',
      caret: 15,
    })
  })

  it('puts the caret after the name, not at the end of the post', () => {
    // A textarea whose value changes without its selection jumps to the end,
    // which on a long post is somewhere else entirely.
    const out = applyMention('hi @sat and more', 7, 'satoshi')
    expect(out.text).toBe('hi @satoshi and more')
    // Past the space, ready to keep typing - the same place it lands when the
    // mention is at the end of the draft and the space had to be added.
    expect(out.caret).toBe(12)
    expect(out.text.slice(out.caret)).toBe('and more')
  })

  it('does not double a space that is already there', () => {
    expect(applyMention('hi @sat more', 7, 'satoshi').text).toBe('hi @satoshi more')
  })

  it('handles a name with a space in it', () => {
    // The case the picker exists for.
    expect(applyMention('hi @Pul', 7, 'Pulse Trader').text).toBe('hi @Pulse Trader ')
  })

  it('changes nothing when no mention is being typed', () => {
    expect(applyMention('hello there', 11, 'satoshi')).toEqual({
      text: 'hello there',
      caret: 11,
    })
  })

  it('changes nothing for an empty handle', () => {
    expect(applyMention('hi @sat', 7, '').text).toBe('hi @sat')
  })
})

describe('keepPicked', () => {
  const SAT = { handle: 'satoshi', address: '0x1111111111111111111111111111111111111111' }
  const PT = { handle: 'Pulse Trader', address: '0x2222222222222222222222222222222222222222' }

  it('keeps a picked name the draft still contains', () => {
    expect(keepPicked('hello @satoshi', [SAT])).toEqual([SAT])
  })

  it('drops one that was deleted again', () => {
    /*
     * The case that matters. Without this, picking a name and then deleting
     * it still notifies that person about a post that does not mention them -
     * which, done deliberately, puts a message in somebody's inbox with no
     * trace of it anywhere they can see.
     */
    expect(keepPicked('hello there', [SAT])).toEqual([])
  })

  it('ignores capitalisation, the way the renderer does', () => {
    expect(keepPicked('hello @SATOSHI', [SAT])).toEqual([SAT])
  })

  it('keeps a handle with a space', () => {
    expect(keepPicked('hi @Pulse Trader', [PT])).toEqual([PT])
  })

  it('keeps each person once, however many times they are named', () => {
    expect(keepPicked('@satoshi @satoshi @satoshi', [SAT, SAT])).toEqual([SAT])
  })

  it('survives rubbish in the list', () => {
    expect(keepPicked('@satoshi', [null, undefined, {}, { handle: 'satoshi' }, SAT])).toEqual([SAT])
  })

  it('is empty for anything that is not a draft', () => {
    expect(keepPicked(null, [SAT])).toEqual([])
    expect(keepPicked('@satoshi', null)).toEqual([])
  })
})
