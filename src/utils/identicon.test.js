import { describe, it, expect } from 'vitest'
import { identicon, IDENTICON_GRID } from './identicon'

/*
 * Generated avatars.
 *
 * The properties that matter are not aesthetic. A mark has to be the same
 * every time it is drawn, different between accounts, and symmetric - and it
 * has to produce something rather than throwing when handed whatever a caller
 * happens to have.
 */

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'

describe('identicon', () => {
  it('is the same every time for the same address', () => {
    // The one property a generated avatar cannot be without. A mark that
    // changes between renders is worse than no mark at all.
    expect(identicon(ALICE)).toEqual(identicon(ALICE))
  })

  it('does not depend on the case an address is written in', () => {
    // Wallets and explorers show the checksummed form; the database stores
    // lowercase. Both have to draw the same person.
    expect(identicon(ALICE.toUpperCase())).toEqual(identicon(ALICE))
  })

  it('differs between accounts', () => {
    const a = identicon(ALICE)
    const b = identicon(BOB)
    expect(a.cells).not.toEqual(b.cells)
  })

  it('differs for addresses whose characters share a parity', () => {
    /*
     * The case that caught the original bug, kept because it is the one a
     * plausible implementation gets wrong.
     *
     * Sampling bit zero of FNV-1a makes every cell a parity of the characters
     * hashed, because the prime is odd and multiplication cannot change the
     * lowest bit. Forty '1's and forty '2's have the same parity, so these two
     * addresses drew the identical avatar - and "different accounts look
     * different" passed anyway on other pairs.
     */
    expect(identicon(ALICE).cells).not.toEqual(identicon(BOB).cells)
    expect(identicon('0x' + '3'.repeat(40)).cells).not.toEqual(
      identicon('0x' + '5'.repeat(40)).cells,
    )
    expect(identicon('0x' + 'a'.repeat(40)).cells).not.toEqual(
      identicon('0x' + 'c'.repeat(40)).cells,
    )
  })

  it('fills a full grid', () => {
    const { cells } = identicon(ALICE)
    expect(cells).toHaveLength(IDENTICON_GRID * IDENTICON_GRID)
    expect(cells.every((c) => typeof c === 'boolean')).toBe(true)
  })

  it('is mirrored down the middle', () => {
    // What makes these read as a glyph rather than as static.
    const { cells } = identicon(ALICE)
    for (let y = 0; y < IDENTICON_GRID; y += 1) {
      for (let x = 0; x < IDENTICON_GRID; x += 1) {
        const mirrored = cells[y * IDENTICON_GRID + (IDENTICON_GRID - 1 - x)]
        expect(cells[y * IDENTICON_GRID + x]).toBe(mirrored)
      }
    }
  })

  it('draws from the brand palette and nowhere else', () => {
    // A generated avatar reaching outside the palette is the thing that makes
    // generated avatars look cheap beside art-directed surfaces.
    const hex = /^#[0-9a-f]{6}$/
    for (const seed of [ALICE, BOB, 'anonymous', '0xdeadbeef']) {
      const { color, background } = identicon(seed)
      expect(color).toMatch(hex)
      expect(background).toMatch(hex)
    }
  })

  it('draws something for anything it is handed', () => {
    // Called from a render path, where an address may be missing while a
    // message is in flight. Throwing there would take the room down.
    for (const value of [undefined, null, '', 42, {}]) {
      const mark = identicon(value)
      expect(mark.cells).toHaveLength(IDENTICON_GRID * IDENTICON_GRID)
    }
  })

  it('gives everything unusable the same fallback mark', () => {
    expect(identicon(undefined)).toEqual(identicon(null))
    expect(identicon('')).toEqual(identicon(undefined))
  })
})
