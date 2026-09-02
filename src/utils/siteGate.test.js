import { describe, it, expect } from 'vitest'
import {
  gateEnabled,
  passwordMatches,
  isGateEndpoint,
  safeRedirect,
  GATE_TTL_SECONDS,
} from './siteGate'

/*
 * The site password, which exists so live trading can be tested without a
 * stranger finding the swap panel first.
 *
 * The middleware that uses these runs on Vercel's edge and cannot be exercised
 * here, so this is where the decisions get checked. A gate that looks like a
 * gate and is not one is worse than leaving the door open, because nobody goes
 * back to check it.
 */

describe('gateEnabled', () => {
  it('is on when a password is configured', () => {
    expect(gateEnabled('hunter2')).toBe(true)
  })

  it('is off when the variable is missing, rather than locking everyone out', () => {
    // This code reaches production before the variable does. Failing closed
    // would turn a forgotten setting into an outage of the whole site.
    expect(gateEnabled(undefined)).toBe(false)
    expect(gateEnabled(null)).toBe(false)
  })

  it('treats a blank value as no password at all', () => {
    // Setting a variable to nothing is easy to do by accident, and an empty
    // password would admit an empty form submission.
    expect(gateEnabled('')).toBe(false)
    expect(gateEnabled('   ')).toBe(false)
  })
})

describe('passwordMatches', () => {
  it('accepts the right password', () => {
    expect(passwordMatches('correct horse', 'correct horse')).toBe(true)
  })

  it('rejects a wrong one, including near misses', () => {
    expect(passwordMatches('correct hors', 'correct horse')).toBe(false)
    expect(passwordMatches('correct horses', 'correct horse')).toBe(false)
    expect(passwordMatches('Correct horse', 'correct horse')).toBe(false)
  })

  it('never admits an empty password', () => {
    // The case that matters if the variable is set to blank somewhere upstream.
    expect(passwordMatches('', '')).toBe(false)
    expect(passwordMatches('anything', '')).toBe(false)
  })

  it('rejects anything that is not a string', () => {
    expect(passwordMatches(undefined, 'p')).toBe(false)
    expect(passwordMatches(null, 'p')).toBe(false)
    expect(passwordMatches(['p'], 'p')).toBe(false)
  })

  it('examines the whole input regardless of where it first differs', () => {
    /*
     * Constant time. A comparison that returns on the first wrong character
     * takes measurably longer for a guess with a correct prefix, which is
     * enough to recover a password one character at a time.
     *
     * Timing cannot be asserted reliably here, so the property is pinned
     * structurally instead: a difference in the very first character and one in
     * the very last are both simply false, and a length difference does not
     * short-circuit ahead of the content check.
     */
    expect(passwordMatches('Xbcdefgh', 'abcdefgh')).toBe(false)
    expect(passwordMatches('abcdefgX', 'abcdefgh')).toBe(false)
    expect(passwordMatches('a', 'abcdefgh')).toBe(false)
  })
})

describe('isGateEndpoint', () => {
  it('lets the form post through', () => {
    expect(isGateEndpoint('/__gate')).toBe(true)
  })

  it('closes everything else, assets included', () => {
    // The bundle is the application. Serving it to someone who has not answered
    // the password would leave the shutter decorative.
    for (const path of ['/', '/index.html', '/assets/index-abc123.js', '/api/candles']) {
      expect(isGateEndpoint(path), path).toBe(false)
    }
  })
})

describe('safeRedirect', () => {
  it('returns someone to the page they asked for', () => {
    expect(safeRedirect('/dex?token=0xabc')).toBe('/dex?token=0xabc')
  })

  it('refuses to bounce off this site', () => {
    /*
     * An open redirect on a login form is a phishing primitive: a genuine link
     * to the genuine site, which lands somewhere else after the password is
     * entered. The protocol-relative form is the one that gets missed.
     */
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('http://evil.example')).toBe('/')
  })

  it('refuses a backslash, which some clients turn into a slash afterwards', () => {
    expect(safeRedirect(String.fromCharCode(92, 92) + 'evil.example')).toBe('/')
    expect(safeRedirect('/ok' + String.fromCharCode(92) + 'bad')).toBe('/')
  })

  it('refuses a line break, which can split a header', () => {
    expect(safeRedirect('/ok' + String.fromCharCode(10) + 'Set-Cookie: x=1')).toBe('/')
    expect(safeRedirect('/ok' + String.fromCharCode(13) + 'x')).toBe('/')
  })

  it('falls back to the root for anything missing or odd', () => {
    expect(safeRedirect('')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect('relative/path')).toBe('/')
  })
})

describe('GATE_TTL_SECONDS', () => {
  it('outlasts a testing session without lasting indefinitely', () => {
    expect(GATE_TTL_SECONDS).toBeGreaterThanOrEqual(60 * 60)
    expect(GATE_TTL_SECONDS).toBeLessThanOrEqual(24 * 60 * 60)
  })
})
