import { describe, it, expect } from 'vitest'
import {
  assessTokens,
  failsQuality,
  normalizeQuality,
  activeQualityCount,
  DEFAULT_QUALITY,
  RECOMMENDED_QUALITY,
  QUALITY_SIGNALS,
} from './trenchQuality'

/*
 * The filters that decide which new launches a reader is shown.
 *
 * Worth pinning because the cost of getting these wrong runs both ways: too
 * loose and the board is bot spam, too tight and a real launch is hidden from
 * someone who was looking for exactly it. Three of the six signals are
 * properties of the whole set rather than of one token, which is where the
 * subtle mistakes live.
 */

let n = 0
const token = (over = {}) => ({
  address: `0xtoken${n++}`,
  symbol: 'REAL',
  name: 'A Real Token',
  imageCid: 'Qm123',
  description: 'A token with a description',
  creatorAddress: '0xdeployer1',
  creatorUsername: 'someone',
  createdAt: 1_780_000_000,
  volumeUsd: 100,
  ...over,
})

const flagsFor = (list, index) => {
  const { verdicts } = assessTokens(list)
  return verdicts.get(list[index].address)
}

describe('per-token signals', () => {
  it('flags a token with no artwork', () => {
    const list = [token({ imageCid: null })]
    expect(flagsFor(list, 0).artwork).toBe(true)
  })

  it('does not flag a token that has artwork', () => {
    expect(flagsFor([token()], 0).artwork).toBe(false)
  })

  it('flags a name that is just digits, which means a script wrote it', () => {
    expect(flagsFor([token({ name: '4820573' })], 0).placeholderName).toBe(true)
    expect(flagsFor([token({ symbol: '99321' })], 0).placeholderName).toBe(true)
  })

  it('leaves a short numeric ticker alone', () => {
    // Two digits is a choice; seven is a counter.
    expect(flagsFor([token({ symbol: '42' })], 0).placeholderName).toBe(false)
  })

  it('flags an empty description, whitespace included', () => {
    expect(flagsFor([token({ description: '' })], 0).noDescription).toBe(true)
    expect(flagsFor([token({ description: '   ' })], 0).noDescription).toBe(true)
  })

  it('flags a deployer with no username', () => {
    expect(flagsFor([token({ creatorUsername: '' })], 0).anonymousDeployer).toBe(true)
  })
})

describe('signals that need the whole set', () => {
  it('flags a wallet that has minted three tokens', () => {
    const list = [
      token({ creatorAddress: '0xfarm' }),
      token({ creatorAddress: '0xfarm' }),
      token({ creatorAddress: '0xfarm' }),
    ]
    expect(flagsFor(list, 0).flood).toBe(true)
  })

  it('flags two tokens minted minutes apart by one wallet', () => {
    const list = [
      token({ creatorAddress: '0xburst', createdAt: 1_780_000_000 }),
      token({ creatorAddress: '0xburst', createdAt: 1_780_000_060 }),
    ]
    expect(flagsFor(list, 0).flood).toBe(true)
  })

  it('leaves two tokens minted days apart alone', () => {
    // One person launching twice in a week is not a farm.
    const list = [
      token({ creatorAddress: '0xperson', createdAt: 1_780_000_000 }),
      token({ creatorAddress: '0xperson', createdAt: 1_780_000_000 + 86_400 * 2 }),
    ]
    expect(flagsFor(list, 0).flood).toBe(false)
  })

  it('keeps the most traded copy of a repeated ticker and drops the rest', () => {
    const list = [
      token({ symbol: 'PEPE', volumeUsd: 10 }),
      token({ symbol: 'PEPE', volumeUsd: 9000 }),
      token({ symbol: 'PEPE', volumeUsd: 5 }),
    ]
    const { verdicts } = assessTokens(list)

    expect(verdicts.get(list[1].address).duplicateSymbol).toBe(false)
    expect(verdicts.get(list[0].address).duplicateSymbol).toBe(true)
    expect(verdicts.get(list[2].address).duplicateSymbol).toBe(true)
  })

  it('treats tickers case-insensitively, so casing cannot dodge the check', () => {
    const list = [token({ symbol: 'pepe', volumeUsd: 1 }), token({ symbol: 'PEPE', volumeUsd: 999 })]
    expect(flagsFor(list, 0).duplicateSymbol).toBe(true)
  })

  it('does not call a unique ticker a duplicate', () => {
    const list = [token({ symbol: 'ONE' }), token({ symbol: 'TWO' })]
    expect(flagsFor(list, 0).duplicateSymbol).toBe(false)
  })

  it('counts how many tokens each signal would remove', () => {
    // The menu shows these, so a reader can see the cost before switching one on.
    const list = [token({ imageCid: null }), token({ imageCid: null }), token()]
    expect(assessTokens(list).counts.artwork).toBe(2)
  })
})

describe('applying the switches', () => {
  it('hides nothing while every switch is off', () => {
    const list = [token({ imageCid: null, description: '', creatorUsername: '' })]
    const { verdicts } = assessTokens(list)

    expect(failsQuality(list[0].address, DEFAULT_QUALITY, verdicts)).toBe(false)
  })

  it('hides a token once the signal it trips is switched on', () => {
    const list = [token({ imageCid: null })]
    const { verdicts } = assessTokens(list)

    expect(failsQuality(list[0].address, { ...DEFAULT_QUALITY, artwork: true }, verdicts)).toBe(true)
  })

  it('keeps a clean token under the recommended set', () => {
    const list = [token()]
    const { verdicts } = assessTokens(list)

    expect(failsQuality(list[0].address, RECOMMENDED_QUALITY, verdicts)).toBe(false)
  })

  it('leaves the two aggressive signals off by default', () => {
    // Each removes most of the board on its own.
    expect(RECOMMENDED_QUALITY.noDescription).toBe(false)
    expect(RECOMMENDED_QUALITY.anonymousDeployer).toBe(false)
  })

  it('says nothing about a token it has never assessed', () => {
    const { verdicts } = assessTokens([token()])
    expect(failsQuality('0xunknown', RECOMMENDED_QUALITY, verdicts)).toBe(false)
  })
})

describe('stored settings', () => {
  it('repairs a saved value that is missing keys', () => {
    // Storage is user-editable and survives deploys, so it is untrusted input.
    expect(normalizeQuality({ artwork: true })).toEqual({ ...DEFAULT_QUALITY, artwork: true })
  })

  it('falls back completely on junk', () => {
    expect(normalizeQuality(null)).toEqual(DEFAULT_QUALITY)
    expect(normalizeQuality('nope')).toEqual(DEFAULT_QUALITY)
  })

  it('coerces stored strings to booleans', () => {
    expect(normalizeQuality({ artwork: 'yes' }).artwork).toBe(true)
  })

  it('counts the active switches for the badge', () => {
    expect(activeQualityCount(DEFAULT_QUALITY)).toBe(0)
    expect(activeQualityCount(RECOMMENDED_QUALITY)).toBe(4)
  })

  it('has a default for every signal in the menu', () => {
    for (const signal of QUALITY_SIGNALS) {
      expect(DEFAULT_QUALITY).toHaveProperty(signal.id)
    }
  })
})
