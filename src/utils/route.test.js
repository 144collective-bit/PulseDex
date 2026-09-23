import { describe, it, expect } from 'vitest'
import { readRoute, routePath, routeTab, sameRoute } from './route'

/*
 * One address bar, one answer.
 *
 * The bug this file exists to make impossible: three hooks each reading and
 * pushing `window.location`, none able to assume it was where it last left
 * it. Every test here is really one assertion - that a path has exactly one
 * meaning, and that meaning is not a function of which surface asked.
 */

const ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const TOKEN_ROOM = `token-${ADDRESS}`

describe('readRoute', () => {
  it('reads a token page', () => {
    expect(readRoute(`/token/${ADDRESS}`)).toEqual({ kind: 'token', address: ADDRESS })
  })

  it('reads a profile, by handle and by address', () => {
    expect(readRoute('/u/@satoshi')).toEqual({ kind: 'profile', handle: 'satoshi', address: null })
    expect(readRoute(`/u/${ADDRESS}`)).toEqual({
      kind: 'profile',
      handle: null,
      address: ADDRESS,
    })
  })

  it('reads every social surface', () => {
    expect(readRoute('/feed')?.kind).toBe('social')
    expect(readRoute('/feed')?.tab).toBe('feed')
    expect(readRoute('/r/lounge')?.room).toBe('lounge')
    expect(readRoute('/p/12')?.post).toBe(12)
    expect(readRoute('/notifications')?.tab).toBe('notifications')
  })

  it('carries a message fragment into a room', () => {
    expect(readRoute('/r/lounge', '#m9')).toMatchObject({ kind: 'social', room: 'lounge', message: 9 })
  })

  it('is null for the ordinary tab shell', () => {
    // Home, the screener, the trenches and portfolio are driven from state
    // and always have been. Null is not a failure here; it is the answer.
    for (const path of ['/', '/anything', '/screener', '']) {
      expect(readRoute(path)).toBeNull()
    }
  })

  it('is null for anything that is not a path', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(readRoute(value)).toBeNull()
    }
  })

  describe('one path means one thing', () => {
    /*
     * The heart of it. Every one of these was previously answerable by two
     * different hooks with two different opinions, and the shell believed
     * whichever had most recently written to its own state.
     */
    it('a token path is not a profile or a social surface', () => {
      const seen = readRoute(`/token/${ADDRESS}`)
      expect(seen.kind).toBe('token')
    })

    it('a profile path is not a token', () => {
      expect(readRoute(`/u/${ADDRESS}`).kind).toBe('profile')
    })

    it('a token room is a social surface, not a token page', () => {
      // The one genuinely ambiguous-looking pair: both carry an address.
      expect(readRoute(`/r/${TOKEN_ROOM}`).kind).toBe('social')
      expect(readRoute(`/token/${ADDRESS}`).kind).toBe('token')
    })
  })
})

describe('routePath', () => {
  it('round-trips every surface', () => {
    for (const route of [
      { kind: 'token', address: ADDRESS },
      { kind: 'profile', handle: 'satoshi', address: null },
      { kind: 'profile', handle: null, address: ADDRESS },
      { kind: 'social', tab: 'feed', room: null, message: null, post: null },
      { kind: 'social', tab: 'rooms', room: 'lounge', message: null, post: null },
      { kind: 'social', tab: 'rooms', room: 'lounge', message: 9, post: null },
      { kind: 'social', tab: 'post', room: null, message: null, post: 12 },
      { kind: 'social', tab: 'notifications', room: null, message: null, post: null },
    ]) {
      const built = routePath(route)
      const [path, hash] = built.split('#')
      expect(readRoute(path, hash ? `#${hash}` : '')).toEqual(route)
    }
  })

  it('is home for nothing', () => {
    // Leaving every surface is not a fourth operation. It is going somewhere,
    // and that somewhere is home.
    expect(routePath(null)).toBe('/')
    expect(routePath(undefined)).toBe('/')
    expect(routePath({})).toBe('/')
    expect(routePath('nonsense')).toBe('/')
  })

  it('lowercases a token address', () => {
    // Every explorer shows the checksummed form, and two links to one token
    // should be one link.
    expect(routePath({ kind: 'token', address: ADDRESS.toUpperCase().replace('0X', '0x') })).toBe(
      `/token/${ADDRESS}`,
    )
  })

  it('is home for a surface with nothing to point at', () => {
    expect(routePath({ kind: 'token' })).toBe('/')
    expect(routePath({ kind: 'profile' })).toBe('/')
  })
})

describe('routeTab', () => {
  it('shows the social tab for a social route', () => {
    expect(routeTab({ kind: 'social', tab: 'feed' }, 'home')).toBe('social')
  })

  it('leaves the tab alone under a token or a profile', () => {
    /*
     * Both cover the whole content area, so the tab underneath does not
     * matter - and leaving it is what makes closing one return you to where
     * you were rather than to Home.
     */
    expect(routeTab({ kind: 'token', address: ADDRESS }, 'screener')).toBe('screener')
    expect(routeTab({ kind: 'profile', handle: 'x' }, 'trenches')).toBe('trenches')
  })

  it('falls back to the shell for no route', () => {
    expect(routeTab(null, 'portfolio')).toBe('portfolio')
  })
})

describe('sameRoute', () => {
  it('knows two ways of saying one place', () => {
    expect(sameRoute({ kind: 'social', tab: 'feed' }, { kind: 'social', tab: 'feed' })).toBe(true)
    // A room route with no room is the default room, which is the same place.
    expect(
      sameRoute({ kind: 'social', tab: 'rooms' }, { kind: 'social', tab: 'rooms', room: null }),
    ).toBe(true)
  })

  it('and two different ones', () => {
    expect(sameRoute({ kind: 'social', tab: 'feed' }, { kind: 'social', tab: 'discover' })).toBe(
      false,
    )
    expect(sameRoute(null, { kind: 'token', address: ADDRESS })).toBe(false)
  })

  it('treats nothing and home as the same place', () => {
    expect(sameRoute(null, null)).toBe(true)
  })
})
