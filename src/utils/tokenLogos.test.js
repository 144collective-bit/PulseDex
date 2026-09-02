import { describe, it, expect } from 'vitest'
import { getTokenLogoUrl, TOKEN_LOGO_MAP } from './tokenLogos'
import { KNOWN_PULSE_TOKENS } from '../config/pulsechain'

/*
 * Two different tokens on this chain both call themselves HEX: PulseChain's own
 * and the bridged one from Ethereum. They hold separate pools, so trading the
 * wrong one is not a cosmetic mistake, and a logo is most of what a user reads
 * before choosing from a list.
 *
 * The map already had an entry for the bridged token, keyed on an address with
 * a character too many. It could never match, so the lookup fell through to the
 * symbol - which at the time was also "HEX" - and served PulseChain HEX's logo
 * for the Ethereum token. Nothing failed; it just quietly showed the wrong one.
 */

describe('the two HEX tokens', () => {
  const hex = KNOWN_PULSE_TOKENS.filter((t) => t.symbol.toUpperCase().endsWith('HEX'))

  it('are both listed, under distinct symbols', () => {
    expect(hex.map((t) => t.symbol).sort()).toEqual(['HEX', 'eHEX'])
  })

  it('each resolve to their own logo by address', () => {
    for (const t of hex) {
      expect(getTokenLogoUrl('', t.address)).toContain(t.address.toLowerCase())
    }
  })

  it('each resolve to their own logo by symbol', () => {
    // The path that served the wrong image: with one symbol between them, the
    // second token could only ever get the first one's picture.
    for (const t of hex) {
      expect(getTokenLogoUrl(t.symbol, '')).toContain(t.address.toLowerCase())
    }
  })
})

describe('TOKEN_LOGO_MAP', () => {
  it('has no address key that could never match one', () => {
    // How the eHEX entry came to be dead. An address of the wrong length is not
    // a lookup that misses sometimes - it is one that misses always.
    const malformed = Object.keys(TOKEN_LOGO_MAP).filter(
      (k) => k.startsWith('0x') && k.length !== 42,
    )
    expect(malformed).toEqual([])
  })

  it('keys addresses in lower case, which is what the lookup uses', () => {
    const upper = Object.keys(TOKEN_LOGO_MAP).filter(
      (k) => k.startsWith('0x') && k !== k.toLowerCase(),
    )
    expect(upper).toEqual([])
  })
})
