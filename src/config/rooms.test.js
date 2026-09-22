import { describe, it, expect } from 'vitest'
import {
  ROOMS,
  DEFAULT_ROOM,
  findRoom,
  isRoom,
  isTokenRoom,
  resolveRoom,
  roomToken,
  tokenRoom,
  tokenRoomLabel,
} from './rooms'

/*
 * The room list.
 *
 * Small, but it is the thing an endpoint validates against and the thing the
 * database's slugs have to keep matching, so the shape is worth pinning down.
 * The slug rule matters most: a slug is written into every message and cannot
 * be changed afterwards without orphaning the messages already carrying it.
 */

describe('the list itself', () => {
  it('has rooms', () => {
    expect(ROOMS.length).toBeGreaterThan(0)
  })

  it('gives every room a slug the database will accept', () => {
    // Deliberately stricter than the constraint, which 0014 widened to 64
    // characters so a token room's slug would fit. These five are names
    // somebody typed; a hand-written room called anything approaching 32
    // characters is a mistake whatever the database would tolerate.
    for (const room of ROOMS) {
      expect(room.slug).toMatch(/^[a-z0-9-]{1,32}$/)
    }
  })

  it('gives every room a name and a blurb', () => {
    for (const room of ROOMS) {
      expect(room.name.length).toBeGreaterThan(0)
      expect(room.blurb.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate slugs', () => {
    // Two rooms sharing a slug would show as two tabs over one conversation.
    const slugs = ROOMS.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('defaults to a room that exists', () => {
    expect(isRoom(DEFAULT_ROOM)).toBe(true)
  })
})

describe('lookup', () => {
  it('finds a room by slug', () => {
    expect(findRoom(DEFAULT_ROOM)?.slug).toBe(DEFAULT_ROOM)
  })

  it('answers null for anything else', () => {
    for (const value of ['nope', '', undefined, null, 42, {}]) {
      expect(findRoom(value)).toBeNull()
    }
  })
})

describe('isRoom', () => {
  it('accepts a real room', () => {
    expect(isRoom(DEFAULT_ROOM)).toBe(true)
  })

  it('refuses one that is not on the list', () => {
    // This is the check standing between a request body and a room that exists
    // only in the database - invisible in the sidebar, and unmoderatable
    // through the UI.
    expect(isRoom('invented-by-the-caller')).toBe(false)
    expect(isRoom('')).toBe(false)
    expect(isRoom(undefined)).toBe(false)
  })

  it('accepts a token room, which has no list to be on', () => {
    expect(isRoom(tokenRoom(ADDRESS))).toBe(true)
  })

  it('refuses a slug that only looks like a token room', () => {
    // `token-` on the front is a claim, not a fact. Without the address being
    // checked too, this is exactly the hole the list was closing: any string
    // with the right prefix becomes a room.
    expect(isRoom('token-not-an-address')).toBe(false)
    expect(isRoom('token-0x1234')).toBe(false)
    expect(isRoom('token-')).toBe(false)
    expect(isRoom(`token-${ADDRESS.slice(0, -1)}`)).toBe(false)
    expect(isRoom(`token-${ADDRESS}beef`)).toBe(false)
  })
})

/*
 * Token rooms.
 *
 * A room per token means the slug carries the address, so the two directions
 * have to agree exactly: a slug this app builds must be one it accepts back,
 * and an address must reach the same room whatever casing it arrives in.
 */
const ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'

describe('tokenRoom', () => {
  it('names a room after its token', () => {
    expect(tokenRoom(ADDRESS)).toBe(`token-${ADDRESS}`)
  })

  it('lowercases, so one token is one room', () => {
    // Checksummed addresses are what a URL or an API hands over. Two casings
    // reaching two rooms would split a conversation in half with no sign
    // that it had happened.
    const checksummed = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
    expect(tokenRoom(checksummed)).toBe(tokenRoom(ADDRESS))
  })

  it('is null for anything that is not an address', () => {
    // A page that has not resolved its token yet asks with undefined, and
    // must not end up with a room called `token-undefined`.
    for (const value of [undefined, null, '', 'lounge', '0x', 42, {}, ADDRESS.slice(2)]) {
      expect(tokenRoom(value)).toBeNull()
    }
  })

  it('produces a slug the database will accept', () => {
    // Matches rooms_slug_shape and the widened messages_room_slug, both in
    // 0014_token_rooms.sql.
    expect(tokenRoom(ADDRESS)).toMatch(/^[a-z0-9-]{1,64}$/)
  })

  it('is longer than the limit 0002 set, which is why 0014 raises it', () => {
    // 48 characters. Left as a bare number on purpose: if this ever changes,
    // the constraint on `messages.room` has to change with it, and a test
    // that recomputed the length from the slug would agree with itself while
    // the database refused every post into a token room.
    expect(tokenRoom(ADDRESS)).toHaveLength(48)
    expect(tokenRoom(ADDRESS).length).toBeGreaterThan(32)
  })
})

describe('roomToken', () => {
  it('reads the token back out of the slug', () => {
    expect(roomToken(tokenRoom(ADDRESS))).toBe(ADDRESS)
  })

  it('round-trips whatever casing went in', () => {
    expect(roomToken(tokenRoom('0xA1077a294dDE1B09bB078844df40758a5D0f9a27'))).toBe(ADDRESS)
  })

  it('is null for a room that is not about a token', () => {
    for (const value of ['lounge', 'token-nope', 'token-', '', undefined, null, 42]) {
      expect(roomToken(value)).toBeNull()
    }
  })

  it('agrees with isTokenRoom', () => {
    for (const value of [tokenRoom(ADDRESS), 'lounge', 'token-nope', undefined]) {
      expect(isTokenRoom(value)).toBe(roomToken(value) !== null)
    }
  })
})

describe('tokenRoomLabel', () => {
  it('shortens the address, since a token room has no name', () => {
    expect(tokenRoomLabel(tokenRoom(ADDRESS))).toBe('0xa107…9a27')
  })

  it('hands back anything that is not a token room unchanged', () => {
    expect(tokenRoomLabel('lounge')).toBe('lounge')
  })
})

describe('resolveRoom', () => {
  it('keeps a room that exists', () => {
    expect(resolveRoom('trading')).toBe('trading')
  })

  it('falls back for a stale link rather than erroring', () => {
    // Somebody shares a link to a room that has since been removed. Landing
    // them in the Lounge is a better answer than an error page.
    expect(resolveRoom('removed-last-month')).toBe(DEFAULT_ROOM)
    expect(resolveRoom(undefined)).toBe(DEFAULT_ROOM)
  })
})
