import { describe, it, expect } from 'vitest'
import { base64Url, randomToken, codeChallenge, safeEqual } from './oauthPkce'

describe('base64Url', () => {
  it('produces nothing that needs escaping in a URL', () => {
    // Every byte value, so the + and / cases are certain to appear.
    const all = new Uint8Array(256).map((_, i) => i)
    expect(base64Url(all)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('drops the padding', () => {
    expect(base64Url(new Uint8Array([1]))).not.toContain('=')
    expect(base64Url(new Uint8Array([1, 2]))).not.toContain('=')
  })
})

describe('randomToken', () => {
  it('is 43 characters for the 32-byte default, which is inside the PKCE range', () => {
    const token = randomToken()
    expect(token).toHaveLength(43)
    // RFC 7636: a code verifier is 43 to 128 characters.
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect(token.length).toBeLessThanOrEqual(128)
  })

  it('stays inside the PKCE range at 64 bytes too', () => {
    expect(randomToken(64).length).toBeLessThanOrEqual(128)
  })

  it('uses only characters RFC 7636 allows in a verifier', () => {
    expect(randomToken(64)).toMatch(/^[A-Za-z0-9._~-]+$/)
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => randomToken()))
    expect(seen.size).toBe(500)
  })
})

describe('codeChallenge', () => {
  it('matches the RFC 7636 test vector', async () => {
    // Appendix B of RFC 7636. If this ever fails, the challenge we send does
    // not correspond to the verifier we keep, and every exchange is refused -
    // which presents as the provider being broken rather than as our bug.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(await codeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('is stable for one verifier and different for another', async () => {
    const a = await codeChallenge('a-verifier-long-enough-to-be-plausible-here')
    expect(await codeChallenge('a-verifier-long-enough-to-be-plausible-here')).toBe(a)
    expect(await codeChallenge('b-verifier-long-enough-to-be-plausible-here')).not.toBe(a)
  })

  it('never returns the verifier itself, which is what plain S256 would be', async () => {
    const verifier = randomToken(64)
    expect(await codeChallenge(verifier)).not.toBe(verifier)
  })
})

describe('safeEqual', () => {
  it('is true only for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })

  it('is false for anything that is not two strings', () => {
    for (const value of [null, undefined, 42, {}, ['a']]) {
      expect(safeEqual(value, 'a')).toBe(false)
      expect(safeEqual('a', value)).toBe(false)
    }
  })
})
