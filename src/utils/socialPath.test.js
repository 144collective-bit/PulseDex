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
    expect(readSocialPath('/feed')).toEqual({ tab: 'feed', room: null, message: null, post: null })
    expect(readSocialPath('/me')).toEqual({ tab: 'profile', room: null, message: null, post: null })
    expect(readSocialPath('/discover')).toEqual({ tab: 'discover', room: null, message: null, post: null })
    expect(readSocialPath('/notifications')).toEqual({
      tab: 'notifications',
      room: null,
      message: null,
      post: null,
    })
  })

  it('tolerates a trailing slash', () => {
    expect(readSocialPath('/feed/')).toEqual({ tab: 'feed', room: null, message: null, post: null })
    expect(readSocialPath('/r/lounge/')).toEqual({ tab: 'rooms', room: 'lounge', message: null, post: null })
  })

  it('reads all three kinds of room from one path shape', () => {
    expect(readSocialPath('/r/lounge')).toEqual({ tab: 'rooms', room: 'lounge', message: null, post: null })
    expect(readSocialPath('/r/group-whales')).toEqual({
      tab: 'rooms',
      room: 'group-whales',
      message: null,
      post: null,
    })
    expect(readSocialPath(`/r/${TOKEN_ROOM}`)).toEqual({
      tab: 'rooms',
      room: TOKEN_ROOM,
      message: null,
      post: null,
    })
  })

  it('keeps the rooms surface when the slug is not a room', () => {
    // `/r/nonsense` is still a request for the rooms surface. Answering it
    // with the home page would be answering a different question.
    const rooms = { tab: 'rooms', room: null, message: null, post: null }
    expect(readSocialPath('/r/nonsense')).toEqual(rooms)
    expect(readSocialPath('/r/group--bad')).toEqual(rooms)
    expect(readSocialPath('/r/token-0xdeadbeef')).toEqual(rooms)
    expect(readSocialPath('/r')).toEqual(rooms)
    expect(readSocialPath('/r/')).toEqual(rooms)
  })

  it('survives a slug that cannot be decoded', () => {
    // A malformed percent sequence throws inside decodeURIComponent, and a
    // bad link is not a reason to take the page down.
    expect(() => readSocialPath('/r/%E0%A4%A')).not.toThrow()
    expect(readSocialPath('/r/%E0%A4%A')).toEqual({
      tab: 'rooms',
      room: null,
      message: null,
      post: null,
    })
  })

  it('leaves the other two routers alone', () => {
    // These paths belong to the profile and token surfaces. Claiming one
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
      { tab: 'feed', room: null, message: null, post: null },
      { tab: 'profile', room: null, message: null, post: null },
      { tab: 'discover', room: null, message: null, post: null },
      { tab: 'notifications', room: null, message: null, post: null },
      { tab: 'rooms', room: 'lounge', message: null, post: null },
      { tab: 'rooms', room: 'group-whales', message: null, post: null },
      { tab: 'rooms', room: TOKEN_ROOM, message: null, post: null },
      { tab: 'rooms', room: 'lounge', message: 1234, post: null },
      { tab: 'post', room: null, message: null, post: 1234 },
    ]) {
      // The builder puts the message in the fragment, so reading it back
      // needs both halves - which is exactly how the hook calls it.
      const built = socialPath(where)
      const [path, hash] = built.split('#')
      expect(readSocialPath(path, hash ? `#${hash}` : '')).toEqual(where)
    }
  })

  it('round-trips a room that is not a room into the default', () => {
    // Not an identity, and deliberately: the point of the correction is that
    // a bad slug settles on a good one and then stays there.
    const once = socialPath({ tab: 'rooms', room: null })
    expect(readSocialPath(once)).toEqual({
      tab: 'rooms',
      room: DEFAULT_ROOM,
      message: null,
      post: null,
    })
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

/*
 * A link to one message.
 *
 * `/r/lounge#m1234` is the same document as `/r/lounge` - the fragment says
 * where to look inside it, which is what a fragment is for. Getting this
 * wrong in the permissive direction is the bad one: a room link that quietly
 * carries a stale message id would scroll somebody somewhere they did not ask
 * to go, every time they opened it.
 */
describe('a message in a room', () => {
  it('reads the id out of the fragment', () => {
    expect(readSocialPath('/r/lounge', '#m1234')).toEqual({
      tab: 'rooms',
      room: 'lounge',
      message: 1234,
      post: null,
    })
  })

  it('builds the fragment only when there is one', () => {
    expect(socialPath({ tab: 'rooms', room: 'lounge', message: 1234 })).toBe('/r/lounge#m1234')
    expect(socialPath({ tab: 'rooms', room: 'lounge' })).toBe('/r/lounge')
    expect(socialPath({ tab: 'rooms', room: 'lounge', message: null, post: null })).toBe('/r/lounge')
  })

  it('treats a leading zero as the same message', () => {
    // `#m007` and `#m7` are one message, not two strings that will not
    // compare equal to the id on a row.
    expect(readSocialPath('/r/lounge', '#m007')?.message).toBe(7)
  })

  it('ignores a fragment that is not a message', () => {
    for (const hash of ['', '#', '#top', '#m', '#m0', '#m-1', '#mabc', '#message-4', 'm4', null, 42]) {
      expect(readSocialPath('/r/lounge', hash)?.message).toBeNull()
    }
  })

  it('ignores an id too large to be one', () => {
    // Past the safe integer range a parsed id stops being the number that
    // was written, so it is no id at all rather than a nearby one.
    expect(readSocialPath('/r/lounge', `#m${'9'.repeat(19)}`)?.message).toBeNull()
  })

  it('is ignored on the surfaces that have no messages', () => {
    expect(readSocialPath('/feed', '#m12')?.message).toBeNull()
    expect(readSocialPath('/notifications', '#m12')?.message).toBeNull()
  })

  it('keeps the message when the room is corrected', () => {
    // A link to a message in a room that has gone still lands on the rooms
    // surface. Dropping the id there would be tidier and would also mean the
    // fragment silently changing meaning between the link and the page.
    expect(readSocialPath('/r/nonsense', '#m9')).toEqual({
      tab: 'rooms',
      room: null,
      message: 9,
      post: null,
    })
  })
})

/*
 * One post, on its own page.
 *
 * The opposite choice from `#m<id>` a few tests up, and the reason is what
 * each surface is for: a link to a message is a link to its room, which is
 * still worth landing on once the message has scrolled away, while a post is
 * the thing itself. A feed is paginated and ordered by time, so a fragment on
 * it would stop finding anything the moment the post is a day old - which is
 * when most links get clicked.
 */
describe('one post', () => {
  it('reads an id out of the path', () => {
    expect(readSocialPath('/p/1234')).toEqual({
      tab: 'post',
      room: null,
      message: null,
      post: 1234,
    })
  })

  it('tolerates a trailing slash, like every other surface', () => {
    expect(readSocialPath('/p/7')?.post).toBe(7)
    expect(readSocialPath('/p/7/')?.post).toBe(7)
  })

  it('builds the path back', () => {
    expect(socialPath({ tab: 'post', post: 1234 })).toBe('/p/1234')
  })

  it('is the feed when there is no post to show', () => {
    // `/p/undefined` is not a link anybody should be handed, and the round
    // trip above would not survive it.
    for (const post of [null, undefined, 0, -3, 1.5, NaN, '12']) {
      expect(socialPath({ tab: 'post', post })).toBe('/feed')
    }
  })

  it('refuses what is not an id', () => {
    // Not a post path at all, so these fall through to the other routers -
    // `/p/0x1234` in particular must not be read as post zero.
    for (const path of ['/p', '/p/', '/p/abc', '/p/0x12', '/p/12a', '/p/1/2', '/p/-4']) {
      const seen = readSocialPath(path)
      expect(seen?.tab).not.toBe('post')
    }
  })

  it('answers an id nobody could have with the feed, not with nothing', () => {
    // Nineteen digits: the pattern accepts it, because a bigserial has that
    // many, and Number cannot hold it exactly. Still a request for something
    // social, so the hook corrects the address bar rather than dropping the
    // reader on the home page.
    const huge = readSocialPath('/p/9999999999999999999')
    expect(huge).toEqual({ tab: 'feed', room: null, message: null, post: null })
  })

  it('and something longer than any id is not this surface at all', () => {
    // Twenty digits is past what the column can hold, so it is not a
    // malformed post link - it is not a post link.
    expect(readSocialPath('/p/99999999999999999999')).toBeNull()
  })

  it('ignores a fragment, which means nothing here', () => {
    // `#m<id>` addresses a message inside a room. A post has no inside.
    expect(readSocialPath('/p/12', '#m5')).toEqual({
      tab: 'post',
      room: null,
      message: null,
      post: 12,
    })
  })

  it('post zero is not a post', () => {
    // bigserial starts at one, so a zero in a link is a broken link rather
    // than a row.
    expect(readSocialPath('/p/0')).toEqual({ tab: 'feed', room: null, message: null, post: null })
  })
})
