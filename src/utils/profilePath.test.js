import { describe, it, expect } from 'vitest'
import { readProfilePath, profilePath } from './profilePath'

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

describe('readProfilePath', () => {
  it('reads an address', () => {
    expect(readProfilePath(`/u/${ADDRESS}`)).toEqual({ handle: null, address: ADDRESS, list: null })
  })

  it('lowercases a checksummed address, which is what explorers copy', () => {
    const checksummed = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
    expect(readProfilePath(`/u/${checksummed}`)).toEqual({
      handle: null,
      address: checksummed.toLowerCase(),
      list: null,
    })
  })

  it('reads a handle', () => {
    expect(readProfilePath('/u/@satoshi')).toEqual({ handle: 'satoshi', address: null, list: null })
  })

  it('keeps a handle case, because the lookup is what lowercases it', () => {
    expect(readProfilePath('/u/@Satoshi')).toEqual({ handle: 'Satoshi', address: null, list: null })
  })

  it('decodes a handle with characters a URL has to encode', () => {
    expect(readProfilePath('/u/@%F0%9F%9A%80moon')).toEqual({
      handle: '🚀moon',
      address: null,
      list: null,
    })
  })

  it('tolerates a trailing slash', () => {
    expect(readProfilePath('/u/@satoshi/')).toEqual({ handle: 'satoshi', address: null, list: null })
  })

  it('reads the two follow lists', () => {
    expect(readProfilePath('/u/@satoshi/followers')).toEqual({
      handle: 'satoshi',
      address: null,
      list: 'followers',
    })
    expect(readProfilePath(`/u/${ADDRESS}/following`)).toEqual({
      handle: null,
      address: ADDRESS,
      list: 'following',
    })
  })

  it('tolerates a trailing slash on a follow list too', () => {
    expect(readProfilePath('/u/@satoshi/followers/')?.list).toBe('followers')
  })

  /*
   * Anything else after the name is not a profile at all. A URL that half
   * resolves - rendering somebody's page under a path that meant something
   * else - is how /u/@a/b would come to look like a working link.
   */
  it('refuses a tail that is not one of the two lists', () => {
    for (const path of ['/u/@satoshi/posts', '/u/@satoshi/followers/extra', `/u/${ADDRESS}/likes`]) {
      expect(readProfilePath(path)).toBeNull()
    }
  })

  it('reads an account whose own name is one of the words', () => {
    expect(readProfilePath('/u/@followers')).toEqual({
      handle: 'followers',
      address: null,
      list: null,
    })
    expect(readProfilePath('/u/@followers/following')).toEqual({
      handle: 'followers',
      address: null,
      list: 'following',
    })
  })

  it('is not a profile path at all for anything else', () => {
    for (const path of ['/', '/token/' + ADDRESS, '/u/', '/u/@', '/users/@satoshi', '/u/@a/b']) {
      expect(readProfilePath(path)).toBeNull()
    }
  })

  it('refuses an address-shaped path that is the wrong length', () => {
    expect(readProfilePath('/u/0xabc')).toBeNull()
    expect(readProfilePath(`/u/${ADDRESS}90`)).toBeNull()
  })

  it('refuses a handle past the column limit', () => {
    expect(readProfilePath(`/u/@${'a'.repeat(32)}`)).not.toBeNull()
    expect(readProfilePath(`/u/@${'a'.repeat(33)}`)).toBeNull()
  })

  it('returns null rather than throwing on a malformed escape', () => {
    expect(readProfilePath('/u/@%E0%A4%A')).toBeNull()
  })

  it('is null for a non-string', () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(readProfilePath(value)).toBeNull()
    }
  })
})

describe('profilePath', () => {
  it('prefers the handle', () => {
    expect(profilePath({ address: ADDRESS, handle: 'satoshi' })).toBe('/u/@satoshi')
  })

  it('falls back to the address', () => {
    expect(profilePath({ address: ADDRESS })).toBe(`/u/${ADDRESS}`)
  })

  it('encodes a handle that needs it, so the path it builds is one it can read', () => {
    const path = profilePath({ handle: 'a b/c' })
    expect(path).toBe('/u/@a%20b%2Fc')
    expect(readProfilePath(path)).toEqual({ handle: 'a b/c', address: null, list: null })
  })

  it('appends a follow list', () => {
    expect(profilePath({ handle: 'satoshi', list: 'followers' })).toBe('/u/@satoshi/followers')
    expect(profilePath({ address: ADDRESS, list: 'following' })).toBe(`/u/${ADDRESS}/following`)
  })

  /*
   * A builder and a parser that disagree is a Back button landing on a page
   * that does not exist, so an unrecognised list is dropped rather than
   * appended to a path this module would then refuse to read.
   */
  it('ignores a list it would not be able to read back', () => {
    expect(profilePath({ handle: 'satoshi', list: 'posts' })).toBe('/u/@satoshi')
    expect(profilePath({ handle: 'satoshi', list: true })).toBe('/u/@satoshi')
    expect(profilePath({ handle: 'satoshi', list: 'Followers' })).toBe('/u/@satoshi')
  })

  it('is null with nothing to go on, list or no list', () => {
    expect(profilePath({})).toBeNull()
    expect(profilePath()).toBeNull()
    expect(profilePath({ list: 'followers' })).toBeNull()
  })
})
