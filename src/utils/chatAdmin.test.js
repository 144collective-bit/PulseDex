import { describe, it, expect } from 'vitest'
import { parseAdminAddresses, isAdminAddress, normaliseAddress } from './chatAdmin'

/*
 * Who may remove a message.
 *
 * Worth testing out of proportion to its size, because every mistake available
 * here is the same mistake: accidentally saying yes. A parser that is too
 * generous, or a check that treats "nothing configured" as "no restriction",
 * hands moderation of a public chat to whoever noticed.
 */

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const STRANGER = '0x3333333333333333333333333333333333333333'

describe('parseAdminAddresses', () => {
  it('reads a list however a person typed it into a dashboard', () => {
    const expected = new Set([ALICE, BOB])
    expect(parseAdminAddresses(`${ALICE},${BOB}`)).toEqual(expected)
    expect(parseAdminAddresses(`${ALICE}, ${BOB}`)).toEqual(expected)
    expect(parseAdminAddresses(`${ALICE} ${BOB}`)).toEqual(expected)
    expect(parseAdminAddresses(`  ${ALICE} ,  ${BOB}  `)).toEqual(expected)
  })

  it('lowercases, so a checksummed address still matches', () => {
    // Every wallet and block explorer displays the mixed-case form, so that is
    // what gets copied. Comparing it raw against a lowercased session address
    // would silently never match.
    const checksummed = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'
    const admins = parseAdminAddresses(checksummed)
    expect(admins.has(checksummed.toLowerCase())).toBe(true)
    expect(isAdminAddress(checksummed, admins)).toBe(true)
  })

  it('is empty when nothing is configured', () => {
    for (const value of ['', '   ', undefined, null, 42, {}]) {
      expect(parseAdminAddresses(value).size).toBe(0)
    }
  })

  it('drops entries that are not addresses, and keeps the rest', () => {
    // One typo should cost that moderator their access - visibly, and fixable
    // in the dashboard - rather than throwing and taking down the endpoint for
    // everybody who wanted to post.
    const admins = parseAdminAddresses(`${ALICE}, not-an-address, 0x123, ${BOB}`)
    expect(admins).toEqual(new Set([ALICE, BOB]))
  })

  it('refuses an address with trailing characters', () => {
    // Anchored on both ends. Without that, '0x111...111evil' parses as a match
    // for the real one.
    expect(parseAdminAddresses(`${ALICE}evil`).size).toBe(0)
  })
})

describe('isAdminAddress', () => {
  const admins = parseAdminAddresses(`${ALICE},${BOB}`)

  it('says yes to a configured moderator', () => {
    expect(isAdminAddress(ALICE, admins)).toBe(true)
    expect(isAdminAddress(BOB, admins)).toBe(true)
  })

  it('says no to everyone else', () => {
    expect(isAdminAddress(STRANGER, admins)).toBe(false)
  })

  it('says no to everyone when no moderators are configured', () => {
    // The direction this has to fail in. An unset variable leaves the chat
    // unmoderated, which is a nuisance; the opposite reading leaves it open to
    // anyone who sends the request, which is an incident.
    const none = parseAdminAddresses('')
    expect(isAdminAddress(ALICE, none)).toBe(false)
    expect(isAdminAddress(STRANGER, none)).toBe(false)
  })

  it('says no to input that is not an address', () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(isAdminAddress(value, admins)).toBe(false)
    }
  })

  it('says no when handed something that is not a set', () => {
    // A handler that passed an array here would otherwise get `undefined` from
    // `.has`, which is falsy by luck rather than by design.
    expect(isAdminAddress(ALICE, [ALICE])).toBe(false)
    expect(isAdminAddress(ALICE, undefined)).toBe(false)
  })
})

describe('normaliseAddress', () => {
  it('lowercases a checksummed address', () => {
    // What every wallet and explorer shows, and therefore what gets pasted
    // into a moderation box.
    expect(normaliseAddress('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01')).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(normaliseAddress(`  ${ALICE}  `)).toBe(ALICE)
  })

  it('refuses anything that is not an address', () => {
    // A blocklist that accepts a malformed address stores a row matching
    // nobody, which fails in the direction of letting someone post.
    for (const value of ['', '0x123', `${ALICE}extra`, 'not-an-address', undefined, null, 42, {}]) {
      expect(normaliseAddress(value)).toBeNull()
    }
  })
})
