import { describe, it, expect } from 'vitest'
import { explorerTxUrl, explorerAddressUrl, explorerTokenUrl, EXPLORER_NAME } from './explorer'
import { pulsechain } from '../config/pulsechain'

/*
 * Links into the explorer.
 *
 * A submitted hash is the only proof a user has that anything happened, so a
 * broken or absent link is the difference between "it worked" and "I have no
 * idea what my wallet just did".
 */

const BASE = pulsechain.blockExplorers.default.url

describe('explorer links', () => {
  it('builds a transaction link on the configured explorer', () => {
    expect(explorerTxUrl('0xabc')).toBe(`${BASE}/tx/0xabc`)
  })

  it('builds address and token links', () => {
    expect(explorerAddressUrl('0xdef')).toBe(`${BASE}/address/0xdef`)
    expect(explorerTokenUrl('0xdef')).toBe(`${BASE}/token/0xdef`)
  })

  it('returns nothing rather than a link to nowhere', () => {
    // A href of "https://scan.pulsechain.com/tx/undefined" is worse than no
    // link: it looks clickable and lands on an error.
    for (const value of ['', null, undefined]) {
      expect(explorerTxUrl(value)).toBeNull()
      expect(explorerAddressUrl(value)).toBeNull()
      expect(explorerTokenUrl(value)).toBeNull()
    }
  })

  it('reads the base from the chain definition rather than hardcoding it', () => {
    expect(explorerTxUrl('0xabc').startsWith(BASE)).toBe(true)
    expect(EXPLORER_NAME).toBe(pulsechain.blockExplorers.default.name)
  })
})
