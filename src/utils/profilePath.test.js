import { describe, it, expect } from 'vitest'
import { readProfilePath, profilePath } from './profilePath'

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

describe('readProfilePath', () => {
  it('reads an address', () => {
    expect(readProfilePath(`/u/${ADDRESS}`)).toEqual({ handle: null, address: ADDRESS })
  })

  it('lowercases a checksummed address, which is what explorers copy', () => {
    const checksummed = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
    expect(readProfilePath(`/u/${checksummed}`)).toEqual({
      handle: null,
      address: checksummed.toLowerCase(),
    })
  })

  it('reads a handle', () => {
    expect(readProfilePath('/u/@satoshi')).toEqual({ handle: 'satoshi', address: null })
  })

  it('keeps a handle case, because the lookup is what lowercases it', () => {
    expect(readProfilePath('/u/@Satoshi')).toEqual({ handle: 'Satoshi', address: null })
  })

  it('decodes a handle with characters a URL has to encode', () => {
    expect(readProfilePath('/u/@%F0%9F%9A%80moon')).toEqual({
      handle: '🚀moon',
      address: null,
    })
  })

  it('tolerates a trailing slash', () => {
    expect(readProfilePath('/u/@satoshi/')).toEqual({ handle: 'satoshi', address: null })
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
    expect(readProfilePath(path)).toEqual({ handle: 'a b/c', address: null })
  })

  it('is null with nothing to go on', () => {
    expect(profilePath({})).toBeNull()
    expect(profilePath()).toBeNull()
  })
})
