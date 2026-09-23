import { describe, it, expect } from 'vitest'
import { byToken, talkLabel } from './talkedAbout'

/*
 * The signal that closes the loop between the screener and the chat.
 *
 * The case that matters is the lookup missing: an address arrives checksummed
 * from one API and lowercased from another, and a map keyed on whichever the
 * room happened to store would badge about half the rows and look like the
 * feature was broken rather than absent.
 */

const A = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const B = '0xb7c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6'

describe('byToken', () => {
  it('indexes rooms by the token they are about', () => {
    const found = byToken([{ address: A, messageCount: 12, lastMessageAt: '2026-01-01T00:00:00Z' }])
    expect(found.get(A)).toEqual({ count: 12, at: '2026-01-01T00:00:00Z' })
  })

  it('keys on the lowercased address, whatever case it arrived in', () => {
    const found = byToken([{ address: A.toUpperCase().replace('0X', '0x'), messageCount: 3 }])
    expect(found.get(A)?.count).toBe(3)
  })

  it('leaves out a room nobody has said anything in', () => {
    // One can exist: note_room_message creates a room with a count of one,
    // and a moderator removing that message leaves the room behind.
    expect(byToken([{ address: A, messageCount: 0 }]).size).toBe(0)
    expect(byToken([{ address: A }]).size).toBe(0)
  })

  it('leaves out a room with no address to match on', () => {
    expect(byToken([{ address: null, messageCount: 9 }]).size).toBe(0)
  })

  it('keeps the busiest of a duplicate rather than the last seen', () => {
    // Two rooms cannot be about one token - the slug is the primary key and
    // carries the address - but picking arbitrarily would make the badge
    // flicker between two numbers if that ever stopped being true.
    const found = byToken([
      { address: A, messageCount: 4 },
      { address: A, messageCount: 40 },
      { address: A, messageCount: 7 },
    ])
    expect(found.get(A)?.count).toBe(40)
  })

  it('indexes several', () => {
    const found = byToken([
      { address: A, messageCount: 1 },
      { address: B, messageCount: 2 },
    ])
    expect(found.size).toBe(2)
  })

  it('is empty for anything that is not a list', () => {
    for (const value of [null, undefined, 42, {}, 'rooms']) {
      expect(byToken(value).size).toBe(0)
    }
  })
})

describe('talkLabel', () => {
  it('says how much has been said', () => {
    expect(talkLabel({ count: 7 })).toBe('7')
    expect(talkLabel({ count: 99 })).toBe('99')
  })

  it('caps, so a number cannot push the price off the row', () => {
    expect(talkLabel({ count: 100 })).toBe('99+')
    expect(talkLabel({ count: 41234 })).toBe('99+')
  })

  it('is nothing for nothing', () => {
    // A badge showing 0 is a badge that has stopped meaning anything.
    for (const value of [{ count: 0 }, {}, null, undefined, { count: -2 }]) {
      expect(talkLabel(value)).toBeNull()
    }
  })
})
