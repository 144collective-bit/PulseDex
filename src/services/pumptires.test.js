import { describe, it, expect } from 'vitest'
import { normalizeToken, plsToUsd, ipfsImageUrl } from './pumptires'

/*
 * The launchpad feed, which is the whole Trenches board.
 *
 * `normalizeToken` is where a raw API row becomes the object every card,
 * filter and sort reads, so a field it fails to pick up does not error - it
 * renders as an empty column on every row and stays that way. That has already
 * happened once here: the deployer arrives nested on one endpoint and flat on
 * the other, only the nested form was read, and the board showed no deployer
 * at all while the API had been sending a username the whole time.
 */

/** A row as the list endpoint sends it: flat `creator_*` fields. */
const listRow = (over = {}) => ({
  address: '0xtoken',
  name: 'Test Token',
  symbol: 'TEST',
  price: '0.0001',
  price_5m_ago: '0.00008',
  tokens_sold: '100000000',
  total_supply: '1000000000',
  total_volume_usd: '5000',
  created_timestamp: 1_780_000_000,
  creator_address: '0xdeployer',
  creator_username: 'someone',
  ...over,
})

/** A row as the detail endpoint sends it: `creator` nested. */
const detailRow = (over = {}) => ({
  address: '0xtoken',
  name: 'Test Token',
  symbol: 'TEST',
  creator: { address: '0xdeployer', username: 'someone', bio: 'a bio' },
  ...over,
})

describe('normalizeToken', () => {
  it('reads the deployer from the flat fields the board endpoint sends', () => {
    // The regression: only the nested shape was read, so every row on the
    // board showed an empty deployer.
    const token = normalizeToken(listRow())

    expect(token.creatorAddress).toBe('0xdeployer')
    expect(token.creatorUsername).toBe('someone')
  })

  it('reads the deployer from the nested shape the detail endpoint sends', () => {
    const token = normalizeToken(detailRow())

    expect(token.creatorAddress).toBe('0xdeployer')
    expect(token.creatorUsername).toBe('someone')
  })

  it('refuses a row with no address, which is nothing it can identify', () => {
    expect(normalizeToken({ name: 'No address' })).toBeNull()
    expect(normalizeToken(null)).toBeNull()
  })

  it('fills in a name and symbol rather than rendering blanks', () => {
    const token = normalizeToken({ address: '0xtoken' })

    expect(token.name).toBe('Unknown')
    expect(token.symbol).toBe('???')
  })

  it('computes five-minute momentum from the prior price', () => {
    const token = normalizeToken(listRow({ price: '0.00011', price_5m_ago: '0.0001' }))

    expect(token.change5m).toBeCloseTo(10, 6)
  })

  it('says nothing about momentum when there is no prior price', () => {
    // Null, not zero. A brand new token has not been flat - it has no history,
    // and drawing it as 0% claims something untrue about the launch.
    expect(normalizeToken(listRow({ price_5m_ago: '0' })).change5m).toBeNull()
    expect(normalizeToken(listRow({ price_5m_ago: undefined })).change5m).toBeNull()
  })

  it('reports a fall as negative momentum', () => {
    const token = normalizeToken(listRow({ price: '0.00009', price_5m_ago: '0.0001' }))
    expect(token.change5m).toBeCloseTo(-10, 6)
  })

  it('caps bonding progress at 100', () => {
    // A graduating token can briefly report sales past the cap, and a progress
    // bar past its own end reads as a rendering fault.
    const token = normalizeToken(listRow({ tokens_sold: '999999999999' }))

    expect(token.bondingProgress).toBe(100)
  })

  it('reports bonding progress as a percentage of the sale allocation', () => {
    const token = normalizeToken(listRow({ tokens_sold: '0' }))
    expect(token.bondingProgress).toBe(0)
  })

  it('expands a bare social handle into a link', () => {
    // Handles arrive bare from the API and render as dead links otherwise.
    const token = normalizeToken(listRow({ twitter: 'JabroniPulse', telegram: '@somechat' }))

    expect(token.twitter).toBe('https://x.com/JabroniPulse')
    expect(token.telegram).toBe('https://t.me/somechat')
  })

  it('leaves a social field that is already a URL alone', () => {
    const token = normalizeToken(listRow({ twitter: 'https://x.com/Someone' }))
    expect(token.twitter).toBe('https://x.com/Someone')
  })

  it('gives a website with no scheme one', () => {
    const token = normalizeToken(listRow({ web: 'example.com' }))
    expect(token.website).toBe('https://example.com')
  })

  it('leaves absent socials null rather than linking to nowhere', () => {
    const token = normalizeToken(listRow())

    expect(token.twitter).toBeNull()
    expect(token.telegram).toBeNull()
    expect(token.website).toBeNull()
  })

  it('keeps the raw image CID as well as a ready URL', () => {
    // The card picks its own gateway from the CID; the URL is the convenience
    // form. The quality filter reads the CID to tell artwork from none.
    const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
    const token = normalizeToken(listRow({ image_cid: cid }))

    expect(token.imageCid).toBe(cid)
    expect(token.imageUrl).toContain(cid)
  })

  it('reports no artwork rather than a broken link when the CID is junk', () => {
    const token = normalizeToken(listRow({ image_cid: 'not-a-cid' }))

    expect(token.imageCid).toBeNull()
    expect(token.imageUrl).toBeNull()
  })

  it('coerces every numeric field, so a string from the API cannot reach the UI', () => {
    const token = normalizeToken(listRow())

    for (const key of ['pricePls', 'volumeUsd', 'tokensSold', 'totalSupply', 'createdAt']) {
      expect(typeof token[key]).toBe('number')
    }
  })
})

describe('plsToUsd', () => {
  it('converts a PLS amount at the given price', () => {
    expect(plsToUsd('1000', '0.00001')).toBeCloseTo(0.01, 10)
  })

  it('returns zero rather than NaN on missing input', () => {
    // NaN renders as "NaN" on a price card, which is worse than a zero.
    expect(plsToUsd(undefined, 0.00001)).toBe(0)
    expect(plsToUsd(1000, undefined)).toBe(0)
    expect(plsToUsd('nonsense', 'nonsense')).toBe(0)
  })
})

describe('ipfsImageUrl', () => {
  it('builds a gateway URL from a valid CID', () => {
    const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
    expect(ipfsImageUrl(cid)).toContain(cid)
  })

  it('returns null for anything that is not a CID', () => {
    expect(ipfsImageUrl('')).toBeNull()
    expect(ipfsImageUrl(null)).toBeNull()
    expect(ipfsImageUrl('not-a-cid')).toBeNull()
  })
})
