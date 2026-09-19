import { describe, it, expect } from 'vitest'
import { routeKey } from '../../api/router.js'

/**
 * The router's path parsing.
 *
 * Worth testing directly because it is the one place a URL somebody typed
 * decides which code runs. Everything it refuses, it refuses by returning
 * null - there is no repair step, because a path that does not name a route
 * exactly is not a route.
 */
describe('routeKey', () => {
  it('accepts the bare route the production rewrite forwards', () => {
    // vercel.json rewrites /api/auth/nonce to /api/router?path=auth/nonce,
    // so this spelling is what production actually passes in.
    expect(routeKey('auth/nonce')).toBe('auth/nonce')
    expect(routeKey('chat/messages')).toBe('chat/messages')
    expect(routeKey('profile')).toBe('profile')
  })

  it('is null for an empty or missing path', () => {
    expect(routeKey('')).toBeNull()
    expect(routeKey('/')).toBeNull()
    expect(routeKey('/api/')).toBeNull()
  })

  it('finds a single-segment route', () => {
    expect(routeKey('/api/profile')).toBe('profile')
    expect(routeKey('/api/posts')).toBe('posts')
    expect(routeKey('/api/candles')).toBe('candles')
  })

  it('finds a nested route', () => {
    expect(routeKey('/api/chat/messages')).toBe('chat/messages')
    expect(routeKey('/api/chat/reactions')).toBe('chat/reactions')
    expect(routeKey('/api/profile/avatar')).toBe('profile/avatar')
    expect(routeKey('/api/posts/report')).toBe('posts/report')
    expect(routeKey('/api/auth/verify')).toBe('auth/verify')
  })

  it('tolerates a trailing slash', () => {
    expect(routeKey('/api/profile/')).toBe('profile')
    expect(routeKey('/api/chat/messages/')).toBe('chat/messages')
  })

  it('is null for anything not under /api', () => {
    for (const path of ['/', '/profile', '/u/@sat', '/apiprofile', '', 'api/profile']) {
      expect(routeKey(path)).toBeNull()
    }
  })

  it('is null for a route that does not exist', () => {
    for (const path of ['/api/', '/api/nope', '/api/chat', '/api/chat/nope', '/api/profile/x/y']) {
      expect(routeKey(path)).toBeNull()
    }
  })

  it('refuses traversal, however it is spelled', () => {
    // The handlers are chosen from a table, so none of these could have
    // reached a file anyway - but they should not get as far as the lookup.
    for (const path of [
      '/api/../secret',
      '/api/chat/../../etc/passwd',
      '/api/chat%2Fmessages',
      '/api/chat/messages%00',
      '/api/_lib/session',
      '/api/_routes/profile',
    ]) {
      expect(routeKey(path)).toBeNull()
    }
  })

  it('is case-sensitive, so a route is spelled one way', () => {
    expect(routeKey('/api/Profile')).toBeNull()
    expect(routeKey('/api/CHAT/MESSAGES')).toBeNull()
  })

  it('is null for anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, ['/api/profile']]) {
      expect(routeKey(value)).toBeNull()
    }
  })

  it('does not return a key that is not its own route', () => {
    // Guards against an inherited property being mistaken for a route -
    // Object.hasOwn rather than `in` is what makes this true.
    for (const path of ['/api/constructor', '/api/toString', '/api/hasownproperty']) {
      expect(routeKey(path)).toBeNull()
    }
  })
})
