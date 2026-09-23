import { describe, it, expect } from 'vitest'
import { filterRooms, roomHaystack, roomMatches } from './roomFilter'

/*
 * Narrowing the room list.
 *
 * The case that matters is a room somebody can see but cannot find: they read
 * "0xa107…9a27" off the sidebar, type part of it, and get nothing. What is on
 * screen has to be what can be typed.
 */

const ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const TOKEN_ROOM = { slug: `token-${ADDRESS}`, name: null }
const LOUNGE = { slug: 'lounge', name: 'Lounge' }
const GROUP = { slug: 'group-the-trenches', name: 'The Trenches' }

describe('roomHaystack', () => {
  it('finds a fixed room by name or slug', () => {
    const hay = roomHaystack(LOUNGE)
    expect(hay).toContain('lounge')
  })

  it('finds a group by the name somebody gave it', () => {
    expect(roomHaystack(GROUP)).toContain('the trenches')
  })

  it('finds a token room by its full address', () => {
    expect(roomHaystack(TOKEN_ROOM)).toContain(ADDRESS)
  })

  it('and by the shortened form the sidebar draws', () => {
    // A token room shows "0xa107…9a27". Somebody reading that and typing the
    // tail of it must find the room - otherwise the list shows a name that
    // does not work as a search term.
    const hay = roomHaystack(TOKEN_ROOM)
    expect(hay).toContain('0xa107')
    expect(hay).toContain('9a27')
  })

  it('never contains the ellipsis, which nobody types', () => {
    expect(roomHaystack(TOKEN_ROOM)).not.toContain('…')
  })

  it('is lowercased, so the search does not care about casing', () => {
    expect(roomHaystack(GROUP)).toBe(roomHaystack(GROUP).toLowerCase())
  })

  it('is empty for anything that is not a room', () => {
    for (const value of [null, undefined, 42, 'lounge', []]) {
      expect(roomHaystack(value)).toBe('')
    }
  })
})

describe('roomMatches', () => {
  it('matches on a fragment of a name', () => {
    expect(roomMatches(GROUP, 'trench')).toBe(true)
    expect(roomMatches(LOUNGE, 'oun')).toBe(true)
  })

  it('ignores casing and surrounding space', () => {
    expect(roomMatches(GROUP, '  TRENCH  ')).toBe(true)
  })

  it('matches a token room by a pasted address', () => {
    expect(roomMatches(TOKEN_ROOM, ADDRESS.toUpperCase())).toBe(true)
  })

  it('matches a slug pasted out of the address bar', () => {
    expect(roomMatches(GROUP, 'group-the-trenches')).toBe(true)
  })

  it('refuses what does not match', () => {
    expect(roomMatches(LOUNGE, 'trenches')).toBe(false)
    expect(roomMatches(TOKEN_ROOM, 'lounge')).toBe(false)
  })

  it('matches everything on an empty term', () => {
    // So the caller renders one list rather than branching between a
    // filtered and an unfiltered one.
    for (const term of ['', '   ', null, undefined, 42]) {
      expect(roomMatches(LOUNGE, term)).toBe(true)
      expect(roomMatches(TOKEN_ROOM, term)).toBe(true)
    }
  })
})

describe('filterRooms', () => {
  const sections = {
    fixed: [LOUNGE, { slug: 'trading', name: 'Trading' }],
    groups: [GROUP],
    tokens: [TOKEN_ROOM],
  }

  it('narrows every section at once', () => {
    const out = filterRooms(sections, 'trad')
    expect(out.fixed.map((r) => r.slug)).toEqual(['trading'])
    expect(out.groups).toEqual([])
    expect(out.tokens).toEqual([])
    expect(out.matches).toBe(1)
  })

  it('can match across sections', () => {
    // "tren" is in the fixed room Trenches' sibling group name too, so a
    // search is not confined to one kind of room.
    const out = filterRooms({ ...sections, fixed: [{ slug: 'trenches', name: 'Trenches' }] }, 'tren')
    expect(out.fixed).toHaveLength(1)
    expect(out.groups).toHaveLength(1)
    expect(out.matches).toBe(2)
  })

  it('counts nothing when nothing matches', () => {
    const out = filterRooms(sections, 'nothing here')
    expect(out.matches).toBe(0)
    expect(out.fixed).toEqual([])
  })

  it('returns everything on an empty term', () => {
    const out = filterRooms(sections, '')
    expect(out.matches).toBe(4)
  })

  it('survives missing sections', () => {
    // The groups list is empty until somebody makes one, and the token list
    // until somebody talks about a token.
    expect(filterRooms({}, 'x')).toEqual({ fixed: [], groups: [], tokens: [], matches: 0 })
    expect(filterRooms(undefined, '')).toEqual({ fixed: [], groups: [], tokens: [], matches: 0 })
    expect(filterRooms({ fixed: 'not a list' }, '')).toEqual({
      fixed: [],
      groups: [],
      tokens: [],
      matches: 0,
    })
  })
})
