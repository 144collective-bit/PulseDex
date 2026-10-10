import { describe, expect, it } from 'vitest'
import {
  FRESH_WALLET_DAYS,
  isFreshWallet,
  readFirstSeen,
  walletAgeDays,
  walletAgeLabel,
} from './walletAge'

/** 2024-03-15T12:00:00Z, which is a Friday in March and therefore a month
 *  name that reads as one in every locale the test runs under. */
const MARCH_2024 = 1_710_504_000
const NOW = Date.UTC(2026, 9, 10)

const txlist = (rows) => ({ status: '1', message: 'OK', result: rows })

describe('readFirstSeen', () => {
  it('takes the timestamp of the first transaction', () => {
    expect(readFirstSeen(txlist([{ timeStamp: String(MARCH_2024) }]))).toBe(
      new Date(MARCH_2024 * 1000).toISOString(),
    )
  })

  it('accepts a number as well as a string, because forks differ', () => {
    expect(readFirstSeen(txlist([{ timestamp: MARCH_2024 }]))).toBe(
      new Date(MARCH_2024 * 1000).toISOString(),
    )
  })

  it('takes the first row rather than assuming there is only one', () => {
    const rows = [{ timeStamp: String(MARCH_2024) }, { timeStamp: String(MARCH_2024 + 86_400) }]
    expect(readFirstSeen(txlist(rows))).toBe(new Date(MARCH_2024 * 1000).toISOString())
  })

  // Blockscout answers status "0" for both "no transactions" and "something
  // broke". Neither is a date, and the page says nothing either way.
  it('is null when the explorer found nothing', () => {
    expect(readFirstSeen({ status: '0', message: 'No transactions found', result: [] })).toBeNull()
  })

  it('is null for every shape that is not a response', () => {
    expect(readFirstSeen(null)).toBeNull()
    expect(readFirstSeen(undefined)).toBeNull()
    expect(readFirstSeen('OK')).toBeNull()
    expect(readFirstSeen(42)).toBeNull()
    expect(readFirstSeen({})).toBeNull()
    expect(readFirstSeen({ result: 'nope' })).toBeNull()
    expect(readFirstSeen({ result: [null] })).toBeNull()
    expect(readFirstSeen({ result: ['string'] })).toBeNull()
  })

  it('is null when the timestamp is not a number', () => {
    expect(readFirstSeen(txlist([{ timeStamp: 'soon' }]))).toBeNull()
    expect(readFirstSeen(txlist([{ timeStamp: null }]))).toBeNull()
    expect(readFirstSeen(txlist([{}]))).toBeNull()
  })

  /*
   * A block number in the timestamp field is the realistic version of this,
   * and it would date every wallet to 1970. Refused, because "first seen
   * January 1970" on a profile is a visible lie rather than a missing value.
   */
  it('refuses a value too small to be a timestamp', () => {
    expect(readFirstSeen(txlist([{ timeStamp: '0' }]))).toBeNull()
    expect(readFirstSeen(txlist([{ timeStamp: '19283746' }]))).toBeNull()
  })

  /*
   * Milliseconds in a seconds field is the other realistic misread, and it
   * lands centuries in the future. Null rather than clamped to now: clamping
   * would read as a brand new wallet, which is the one claim this value makes.
   */
  it('refuses a timestamp in the future', () => {
    const ms = String(Date.now())
    expect(readFirstSeen(txlist([{ timeStamp: ms }]))).toBeNull()
  })
})

describe('walletAgeDays', () => {
  it('counts whole days', () => {
    const tenDaysAgo = new Date(NOW - 10 * 86_400_000).toISOString()
    expect(walletAgeDays(tenDaysAgo, NOW)).toBe(10)
  })

  it('floors a part day rather than rounding up', () => {
    const almostTwo = new Date(NOW - (2 * 86_400_000 - 1000)).toISOString()
    expect(walletAgeDays(almostTwo, NOW)).toBe(1)
  })

  // A clock disagreement between the explorer and the browser, not a fact
  // about the wallet - so it reads as "today" rather than as a negative age.
  it('is zero rather than negative for a date in the future', () => {
    const tomorrow = new Date(NOW + 86_400_000).toISOString()
    expect(walletAgeDays(tomorrow, NOW)).toBe(0)
  })

  it('is null for anything unreadable', () => {
    expect(walletAgeDays(null)).toBeNull()
    expect(walletAgeDays(undefined)).toBeNull()
    expect(walletAgeDays('whenever')).toBeNull()
    expect(walletAgeDays(1_710_504_000)).toBeNull()
  })
})

describe('walletAgeLabel', () => {
  it('names the month and the year, not the day', () => {
    const label = walletAgeLabel(new Date(MARCH_2024 * 1000).toISOString())
    expect(label).toMatch(/^First seen /)
    expect(label).toContain('2024')
    // The day of the month is deliberately absent.
    expect(label).not.toMatch(/\b15\b/)
  })

  it('draws nothing when there is no date', () => {
    expect(walletAgeLabel(null)).toBeNull()
    expect(walletAgeLabel('')).toBeNull()
    expect(walletAgeLabel('not a date')).toBeNull()
    expect(walletAgeLabel({})).toBeNull()
  })
})

describe('isFreshWallet', () => {
  it('is true just inside the threshold', () => {
    const at = new Date(NOW - (FRESH_WALLET_DAYS - 1) * 86_400_000).toISOString()
    expect(isFreshWallet(at, NOW)).toBe(true)
  })

  it('is false on the threshold itself', () => {
    const at = new Date(NOW - FRESH_WALLET_DAYS * 86_400_000).toISOString()
    expect(isFreshWallet(at, NOW)).toBe(false)
  })

  /*
   * The asymmetry that matters. Not knowing how old a wallet is must never
   * present as an old one - a reader deciding whether to trust an account is
   * the whole reason this value is on the page.
   */
  it('is false when the age is unknown, never true', () => {
    expect(isFreshWallet(null, NOW)).toBe(false)
    expect(isFreshWallet('nonsense', NOW)).toBe(false)
  })
})
