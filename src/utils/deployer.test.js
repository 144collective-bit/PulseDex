import { describe, it, expect } from 'vitest'
import {
  asAddress,
  asTxHash,
  claimMessage,
  readBlockscoutCreation,
  readContractCreator,
  readTransactionSender,
} from './deployer'

/*
 * Reading the chain's answer about who deployed a token.
 *
 * This is the input to a decision that hands somebody a badge on somebody
 * else's token, so the cases that matter are the malformed ones. Every one of
 * these must come out null: a null refuses the claim, and anything else
 * grants it.
 */

const TOKEN = '0xa1077a294dde1b09bb078844df40758a5d0f9a27'
const DEV = '0x1111111111111111111111111111111111111111'
const FACTORY = '0x2222222222222222222222222222222222222222'
const TX = '0x' + 'ab'.repeat(32)

describe('asAddress', () => {
  it('lowercases, because a node answers in mixed case', () => {
    expect(asAddress('0xA1077a294dDE1B09bB078844df40758a5D0f9a27')).toBe(TOKEN)
  })

  it('trims, because an explorer pads its JSON strings', () => {
    expect(asAddress(`  ${TOKEN}  `)).toBe(TOKEN)
  })

  it('refuses anything that is not an address', () => {
    for (const value of [
      null,
      undefined,
      42,
      {},
      [],
      '',
      '0x',
      TOKEN.slice(0, -1),
      `${TOKEN}ff`,
      TOKEN.replace('0x', ''),
      '0xzzzz77a294dde1b09bb078844df40758a5d0f9a27',
    ]) {
      expect(asAddress(value)).toBeNull()
    }
  })
})

describe('asTxHash', () => {
  it('accepts a hash', () => {
    expect(asTxHash(TX.toUpperCase().replace('0X', '0x'))).toBe(TX)
  })

  it('refuses an address, which is the same shape but half the length', () => {
    expect(asTxHash(TOKEN)).toBeNull()
  })

  it('refuses everything malformed', () => {
    for (const value of [null, undefined, 42, {}, '', '0x', `${TX}00`, TX.slice(0, -2)]) {
      expect(asTxHash(value)).toBeNull()
    }
  })
})

describe('readContractCreator', () => {
  it('reads what Otterscan answered', () => {
    expect(readContractCreator({ creator: FACTORY, hash: TX })).toEqual({
      creator: FACTORY,
      hash: TX,
    })
  })

  it('normalises the casing it answered in', () => {
    expect(
      readContractCreator({ creator: FACTORY.toUpperCase().replace('0X', '0x'), hash: TX })
    ).toEqual({ creator: FACTORY, hash: TX })
  })

  it('refuses a half answer', () => {
    // A creator with no transaction cannot be checked by anybody afterwards.
    expect(readContractCreator({ creator: FACTORY })).toBeNull()
    expect(readContractCreator({ hash: TX })).toBeNull()
    expect(readContractCreator({ creator: FACTORY, hash: 'not-a-hash' })).toBeNull()
  })

  it('refuses null, which is what it answers for an address it has never seen', () => {
    for (const value of [null, undefined, 'null', 42, [], '']) {
      expect(readContractCreator(value)).toBeNull()
    }
  })
})

describe('readTransactionSender', () => {
  it('takes the sender, not the recipient', () => {
    // The distinction is the whole point: `to` is the factory that was
    // called, `from` is the person who called it.
    expect(readTransactionSender({ from: DEV, to: FACTORY })).toBe(DEV)
  })

  it('refuses a transaction with no sender', () => {
    for (const value of [null, undefined, {}, { from: null }, { from: '0x' }, 'sent']) {
      expect(readTransactionSender(value)).toBeNull()
    }
  })
})

describe('readBlockscoutCreation', () => {
  const ok = {
    status: '1',
    result: [
      { contractAddress: TOKEN, contractCreator: FACTORY, contractCreationHash: TX },
    ],
  }

  it('reads the row for the token it was asked about', () => {
    expect(readBlockscoutCreation(ok, TOKEN)).toEqual({ creator: FACTORY, hash: TX })
  })

  it('matches on the token even when several rows come back', () => {
    // The endpoint takes a list of addresses, so there is no guarantee the
    // first row is the one asked for - and taking it on faith would read
    // another token's deployer.
    const many = {
      status: '1',
      result: [
        { contractAddress: DEV, contractCreator: DEV, contractCreationHash: TX },
        ok.result[0],
      ],
    }
    expect(readBlockscoutCreation(many, TOKEN)).toEqual({ creator: FACTORY, hash: TX })
  })

  it('refuses when the answer is about a different token', () => {
    expect(readBlockscoutCreation(ok, DEV)).toBeNull()
  })

  it('refuses the empty answer, which is a string rather than a list', () => {
    expect(
      readBlockscoutCreation({ status: '0', result: 'No data found' }, TOKEN)
    ).toBeNull()
  })

  it('survives rubbish inside the list', () => {
    const messy = { status: '1', result: [null, 'x', 42, [], ok.result[0]] }
    expect(readBlockscoutCreation(messy, TOKEN)).toEqual({ creator: FACTORY, hash: TX })
  })

  it('refuses when asked about something that is not an address', () => {
    expect(readBlockscoutCreation(ok, 'lounge')).toBeNull()
    expect(readBlockscoutCreation(ok, undefined)).toBeNull()
  })
})

describe('claimMessage', () => {
  const built = claimMessage({
    domain: 'pulsedex.net',
    token: TOKEN,
    address: DEV,
    nonce: 'abc123',
  })

  it('names the site, the token, the wallet and the nonce', () => {
    expect(built).toContain('pulsedex.net')
    expect(built).toContain(TOKEN)
    expect(built).toContain(DEV)
    expect(built).toContain('abc123')
  })

  it('says in words what signing it does', () => {
    // A wallet shows this text to a person. One that reads "0x8a3f..."
    // teaches people that signing anything is normal.
    expect(built).toContain('control the wallet')
    expect(built).toContain('costs no gas')
  })

  it('is stable, because both sides rebuild it independently', () => {
    const again = claimMessage({
      domain: 'pulsedex.net',
      token: TOKEN,
      address: DEV,
      nonce: 'abc123',
    })
    expect(again).toBe(built)
  })

  it('changes when any part of it changes', () => {
    const other = claimMessage({
      domain: 'pulsedex.net',
      token: TOKEN,
      address: DEV,
      nonce: 'different',
    })
    expect(other).not.toBe(built)
  })
})
