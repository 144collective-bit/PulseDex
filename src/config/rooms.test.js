import { describe, it, expect } from 'vitest'
import { ROOMS, DEFAULT_ROOM, findRoom, isRoom, resolveRoom } from './rooms'

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
    // Matches the check constraint in 0002_rooms.sql. A slug that passes here
    // and fails there is a room nobody can post in, discovered in production.
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
