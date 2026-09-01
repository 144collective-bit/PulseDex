import { describe, it, expect } from 'vitest'
import { buildSiweMessage, parseSiweMessage } from './siwe'

/*
 * The sign-in message, built by the client and read back by the function that
 * verifies it.
 *
 * One copy serves both, so a disagreement about the format would fail every
 * signature for reasons nobody could see. These tests pin the round trip, and
 * the refusals that keep the format from being something an attacker can bend.
 */

const VALID = {
  domain: 'www.pulsedex.net',
  address: '0x2e6108aa90394c669ADaA88Abc5A2f9bD27f5079',
  uri: 'https://www.pulsedex.net',
  nonce: '5de02d11f44e55a94282552c6eb9c2d2',
  issuedAt: '2026-09-01T12:00:00.000Z',
  expirationTime: '2026-09-01T12:10:00.000Z',
}

describe('round trip', () => {
  it('reads back every field it wrote', () => {
    const parsed = parseSiweMessage(buildSiweMessage(VALID))

    expect(parsed).toMatchObject({
      domain: VALID.domain,
      address: VALID.address,
      uri: VALID.uri,
      nonce: VALID.nonce,
      issuedAt: VALID.issuedAt,
      expirationTime: VALID.expirationTime,
    })
  })

  it('defaults to PulseChain', () => {
    expect(parseSiweMessage(buildSiweMessage(VALID)).chainId).toBe('369')
  })

  it('carries a chain id when one is given', () => {
    const parsed = parseSiweMessage(buildSiweMessage({ ...VALID, chainId: 1 }))
    expect(parsed.chainId).toBe('1')
  })
})

describe('what the reader sees', () => {
  it('opens with the domain asking, as the standard requires', () => {
    const message = buildSiweMessage(VALID)
    expect(message.split('\n')[0]).toBe(
      'www.pulsedex.net wants you to sign in with your Ethereum account:',
    )
  })

  it('puts the address on its own second line', () => {
    expect(buildSiweMessage(VALID).split('\n')[1]).toBe(VALID.address)
  })

  it('says plainly that this is not a transaction', () => {
    // A signature prompt looks alarmingly like a transaction prompt to most
    // people, and this sentence is the only thing that tells them otherwise.
    const message = buildSiweMessage(VALID)
    expect(message).toMatch(/not a transaction/i)
    expect(message).toMatch(/costs no gas/i)
  })
})

describe('refusals', () => {
  it('rejects a message with the wrong opening line', () => {
    const message = buildSiweMessage(VALID).replace('wants you to sign in', 'would like you to log in')
    expect(parseSiweMessage(message)).toBeNull()
  })

  it('rejects an address that is not an address', () => {
    const message = buildSiweMessage({ ...VALID, address: 'not-an-address' })
    expect(parseSiweMessage(message)).toBeNull()
  })

  it('rejects an address of the wrong length', () => {
    const message = buildSiweMessage({ ...VALID, address: '0xdeadbeef' })
    expect(parseSiweMessage(message)).toBeNull()
  })

  it('rejects a message with no nonce, which is what stops a replay', () => {
    const message = buildSiweMessage(VALID)
      .split('\n')
      .filter((l) => !l.startsWith('Nonce: '))
      .join('\n')

    expect(parseSiweMessage(message)).toBeNull()
  })

  it('rejects something that is not a message at all', () => {
    expect(parseSiweMessage('')).toBeNull()
    expect(parseSiweMessage('hello')).toBeNull()
    expect(parseSiweMessage(null)).toBeNull()
  })

  it('does not confuse a domain that contains the address', () => {
    const parsed = parseSiweMessage(buildSiweMessage({ ...VALID, domain: 'localhost:5199' }))
    expect(parsed.domain).toBe('localhost:5199')
    expect(parsed.address).toBe(VALID.address)
  })
})
