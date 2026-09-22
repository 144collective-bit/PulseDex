import { describe, it, expect } from 'vitest'
import { DEFAULT_ROOM } from '../config/rooms'
import { isSocialPath, readSocialPath, socialPath } from './socialPath'

/*
 * Where a URL lands.
 *
 * This is the file that decides what somebody gets when they paste a link, so
 * the cases worth pinning down are the ones nobody types on purpose: a room
 * that no longer exists, a slug with a slash in it, the paths belonging to the
 * two routers that already existed.
 */

const TOKEN_ROOM = 'token-0xa1077a294dde1b09bb078844df40758a5d0f9a27'

describe('readSocialPath', () => {
  it('reads each surface', () => {
    expect(readSocialPath('/feed')).toEqual({ tab: 'feed', room: null })
    expect(readSocialPath('/me')).toEqual({ tab: 'profile', room: null })
    expect(readSocialPath('/discover')).toEqual({ tab: 'discover', room: null })
    expect(readSocialPath('/notifications')).toEqual({ tab: 'notifications', room: null })
  })

  it('tolerates a trailing slash', () => {
    expect(readSocialPath('/feed/')).toEqual({ tab: 'feed', room: null })
    expect(readSocialPath('/r/lounge/')).toEqual({ tab: 'rooms', room: 'lounge' })
  })

  it('reads all three kinds of room from one path shape', () => {
    expect(readSocialPath('/r/lounge')).toEqual({ tab: 'rooms', room: 'lounge' })
    expect(readSocialPath('/r/group-whales')).toEqual({ tab: 'rooms', room: 'group-whales' })
    expect(readSocialPath(`/r/${TOKEN_ROOM}`)).toEqual({ tab: 'rooms', room: TOKEN_ROOM })
  })

  it('keeps the rooms surface when the slug is not a room', () => {
    // `/r/nonsense` is still a request for the rooms surface. Answering it
    // with the home page would be answering a different question.
    expect(readSocialPath('/r/nonsense')).toEqual({ tab: 'rooms', room: null })
    expect(readSocialPath('/r/group--bad')).toEqual({ tab: 'rooms', room: null })
    expect(readSocialPath('/r/token-0xdeadbeef')).toEqual({ tab: 'rooms', room: null })
    expect(readSocialPath('/r')).toEqual({ tab: 'rooms', room: null })
    expect(readSocialPath('/r/')).toEqual({ tab: 'rooms', room: null })
  })

  it('survives a slug that cannot be decoded', () => {
    // A malformed percent sequence throws inside decodeURIComponent, and a
    // bad link is not a reason to take the page down.
    expect(() => readSocialPath('/r/%E0%A4%A')).not.toThrow()
    expect(readSocialPath('/r/%E0%A4%A')).toEqual({ tab: 'rooms', room: null })
  })

  it('leaves the other two routers alone', () => {
    // These paths belong to useProfileRoute and useTokenRoute. Claiming one
    // here would put the social section over a profile page.
    for (const path of [
      '/',
      '/u/@satoshi',
      '/u/0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      '/token/0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      '/no/such/page',
      '/feedback',
      '/rooms',
      '/mexican',
    ]) {
      expect(readSocialPath(path)).toBeNull()
    }
  })

  it('is null for anything that is not a path', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(readSocialPath(value)).toBeNull()
    }
  })
})

describe('socialPath', () => {
  it('builds each surface', () => {
    expect(socialPath({ tab: 'feed' })).toBe('/feed')
    expect(socialPath({ tab: 'profile' })).toBe('/me')
    expect(socialPath({ tab: 'discover' })).toBe('/discover')
    expect(socialPath({ tab: 'notifications' })).toBe('/notifications')
  })

  it('spells out the room rather than leaving it implicit', () => {
    // A link somebody copies should say which room they were in.
    expect(socialPath({ tab: 'rooms', room: 'trading' })).toBe('/r/trading')
    expect(socialPath({ tab: 'rooms' })).toBe(`/r/${DEFAULT_ROOM}`)
    expect(socialPath({ tab: 'rooms', room: 'nonsense' })).toBe(`/r/${DEFAULT_ROOM}`)
  })

  it('falls back to the feed, which is where the section opens', () => {
    expect(socialPath({ tab: 'invented' })).toBe('/feed')
    expect(socialPath({})).toBe('/feed')
    expect(socialPath()).toBe('/feed')
  })

  it('round-trips every surface exactly', () => {
    /*
     * The property the hook depends on: if building a path from where you are
     * and reading it back does not give the same place, the address bar and
     * the page disagree, and the correction the hook makes would loop.
     */
    for (const where of [
      { tab: 'feed', room: null },
      { tab: 'profile', room: null },
      { tab: 'discover', room: null },
      { tab: 'notifications', room: null },
      { tab: 'rooms', room: 'lounge' },
      { tab: 'rooms', room: 'group-whales' },
      { tab: 'rooms', room: TOKEN_ROOM },
    ]) {
      expect(readSocialPath(socialPath(where))).toEqual(where)
    }
  })

  it('round-trips a room that is not a room into the default', () => {
    // Not an identity, and deliberately: the point of the correction is that
    // a bad slug settles on a good one and then stays there.
    const once = socialPath({ tab: 'rooms', room: null })
    expect(readSocialPath(once)).toEqual({ tab: 'rooms', room: DEFAULT_ROOM })
    expect(socialPath(readSocialPath(once))).toBe(once)
  })
})

describe('isSocialPath', () => {
  it('agrees with readSocialPath', () => {
    for (const path of ['/feed', '/r/lounge', '/', '/u/@satoshi', '/nope']) {
      expect(isSocialPath(path)).toBe(readSocialPath(path) !== null)
    }
  })
})
