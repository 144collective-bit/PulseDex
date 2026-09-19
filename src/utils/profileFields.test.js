import { describe, it, expect } from 'vitest'
import {
  normaliseBio,
  normaliseLink,
  normaliseLinks,
  MAX_BIO_LENGTH,
  MAX_LINKS,
} from './profileFields'

/*
 * Profile fields that strangers see.
 *
 * The link rules carry the weight here. A profile link on a site about which
 * tokens to buy is close to an ideal phishing surface, and most of these
 * tests are a specific trick rather than a tidiness rule.
 */

describe('normaliseBio', () => {
  it('keeps an ordinary bio', () => {
    expect(normaliseBio('  Trading PulseChain since launch.  ')).toBe(
      'Trading PulseChain since launch.',
    )
  })

  it('collapses a wall of blank lines', () => {
    // Otherwise a bio is a way to push everything around it off the card.
    expect(normaliseBio(`top${'\n'.repeat(12)}bottom`)).toBe('top\nbottom')
  })

  it('strips the direction overrides that make text read backwards', () => {
    const rtlOverride = String.fromCharCode(0x202e)
    expect(normaliseBio(`send to 0xdead${rtlOverride}beef`)).toBe('send to 0xdeadbeef')
  })

  it('gives up rather than erroring when it cannot be used', () => {
    expect(normaliseBio('')).toBeNull()
    expect(normaliseBio('   ')).toBeNull()
    expect(normaliseBio(undefined)).toBeNull()
    expect(normaliseBio('a'.repeat(MAX_BIO_LENGTH + 1))).toBeNull()
  })
})

describe('normaliseLink', () => {
  it('accepts an ordinary https link and reports its host', () => {
    expect(normaliseLink('https://pulsex.com/swap')).toEqual({
      url: 'https://pulsex.com/swap',
      host: 'pulsex.com',
    })
  })

  it('drops a leading www from the host it displays', () => {
    expect(normaliseLink('https://www.pulsex.com')?.host).toBe('pulsex.com')
  })

  it('refuses http, which is downgradable', () => {
    expect(normaliseLink('http://pulsex.com')).toBeNull()
  })

  it('refuses credentials in the authority', () => {
    /*
     * The trick this exists for. https://pulsex.com@evil.example goes to
     * evil.example while reading as pulsex.com, so a reader who checks the URL
     * before clicking checks the part that does not decide where they land.
     */
    expect(normaliseLink('https://pulsex.com@evil.example')).toBeNull()
    expect(normaliseLink('https://user:pass@evil.example')).toBeNull()
  })

  it('refuses schemes that are not the web', () => {
    expect(normaliseLink('javascript:alert(1)')).toBeNull()
    expect(normaliseLink('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normaliseLink('file:///etc/passwd')).toBeNull()
  })

  it('refuses anything that is not a URL at all', () => {
    for (const value of ['', '   ', 'pulsex.com', 'not a url', undefined, null, 42, {}]) {
      expect(normaliseLink(value)).toBeNull()
    }
  })

  it('refuses a host without a dot, which is not on the public internet', () => {
    expect(normaliseLink('https://localhost')).toBeNull()
    expect(normaliseLink('https://intranet')).toBeNull()
  })
})

describe('normaliseLinks', () => {
  it('keeps several good links', () => {
    const links = normaliseLinks(['https://pulsex.com', 'https://hex.com'])
    expect(links.map((l) => l.host)).toEqual(['pulsex.com', 'hex.com'])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://site${i}.com`)
    expect(normaliseLinks(many)).toHaveLength(MAX_LINKS)
  })

  it('drops duplicates by host rather than by string', () => {
    // Three links to the same place is either a mistake or an attempt to fill
    // the card, and the www form is the same place.
    const links = normaliseLinks([
      'https://pulsex.com/a',
      'https://www.pulsex.com/b',
      'https://hex.com',
    ])
    expect(links.map((l) => l.host)).toEqual(['pulsex.com', 'hex.com'])
  })

  it('drops the bad ones and keeps the rest', () => {
    const links = normaliseLinks(['javascript:alert(1)', 'https://pulsex.com', 'nonsense'])
    expect(links.map((l) => l.host)).toEqual(['pulsex.com'])
  })

  it('answers an empty list for anything that is not one', () => {
    for (const value of [undefined, null, 'https://pulsex.com', {}]) {
      expect(normaliseLinks(value)).toEqual([])
    }
  })
})
