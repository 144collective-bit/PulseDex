import { describe, expect, it } from 'vitest'
import {
  AUTO_HIDE_REPORTS,
  REPORTER_MIN_DAYS,
  hiddenNotice,
  qualifyingReporters,
  shouldAutoHide,
} from './autoHide'

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString()

/** An established reporter, by default. */
const reporter = (i, over = {}) => ({
  address: `0x${String(i).repeat(40).slice(0, 40)}`,
  firstSeenAt: daysAgo(REPORTER_MIN_DAYS + 10),
  ...over,
})

/** Exactly enough established reporters to trip the gate. */
const enough = () => Array.from({ length: AUTO_HIDE_REPORTS }, (_, i) => reporter(i + 1))

describe('qualifyingReporters', () => {
  it('counts an established account', () => {
    expect(qualifyingReporters([reporter(1)], NOW)).toHaveLength(1)
  })

  it('deduplicates by address, in case a caller read duplicate rows', () => {
    const one = reporter(1)
    expect(qualifyingReporters([one, { ...one }, one], NOW)).toHaveLength(1)
  })

  it('does not care what case the address arrived in', () => {
    const a = reporter(1)
    const b = { ...a, address: a.address.toUpperCase() }
    expect(qualifyingReporters([a, b], NOW)).toHaveLength(1)
  })

  it('refuses an account younger than the floor', () => {
    const fresh = reporter(1, { firstSeenAt: daysAgo(REPORTER_MIN_DAYS - 1) })
    expect(qualifyingReporters([fresh], NOW)).toHaveLength(0)
  })

  it('counts an account exactly on the floor', () => {
    const borderline = reporter(1, { firstSeenAt: daysAgo(REPORTER_MIN_DAYS) })
    expect(qualifyingReporters([borderline], NOW)).toHaveLength(1)
  })

  /*
   * The rule that actually matters. An unknown age is usually an account
   * nobody has looked up yet, and treating it as old enough would make the
   * gate satisfiable by three wallets created this morning - which is exactly
   * the brigading case this exists to refuse.
   */
  it('refuses an account whose age is unknown, rather than assuming it is old', () => {
    for (const firstSeenAt of [null, undefined, '', 'whenever', 12345]) {
      expect(qualifyingReporters([reporter(1, { firstSeenAt })], NOW)).toHaveLength(0)
    }
  })

  it('ignores rows with no address', () => {
    expect(qualifyingReporters([{ firstSeenAt: daysAgo(100) }, null, 42], NOW)).toHaveLength(0)
  })

  it('is empty for anything that is not a list', () => {
    for (const value of [null, undefined, 'reports', {}]) {
      expect(qualifyingReporters(value, NOW)).toEqual([])
    }
  })
})

describe('shouldAutoHide', () => {
  it('hides on exactly the threshold', () => {
    expect(shouldAutoHide({ reporters: enough(), now: NOW })).toEqual({
      hide: true,
      qualifying: AUTO_HIDE_REPORTS,
    })
  })

  it('does not hide one short of it', () => {
    const nearly = enough().slice(0, AUTO_HIDE_REPORTS - 1)
    expect(shouldAutoHide({ reporters: nearly, now: NOW })).toEqual({
      hide: false,
      qualifying: AUTO_HIDE_REPORTS - 1,
    })
  })

  /*
   * The point of the whole file: a plain count would hide here, and the
   * earlier decision was right that it should not. Enough reports, none of
   * them from an account old enough to count.
   */
  it('does not hide for any number of brand new accounts', () => {
    const brigade = Array.from({ length: AUTO_HIDE_REPORTS * 5 }, (_, i) =>
      reporter(i + 1, { firstSeenAt: daysAgo(1) }),
    )
    expect(shouldAutoHide({ reporters: brigade, now: NOW })).toEqual({
      hide: false,
      qualifying: 0,
    })
  })

  it('does not hide for one determined person reporting from one account', () => {
    const one = reporter(1)
    expect(shouldAutoHide({ reporters: [one, one, one, one, one], now: NOW }).hide).toBe(false)
  })

  it('counts a mixed set by its established members only', () => {
    const mixed = [
      reporter(1),
      reporter(2),
      reporter(3, { firstSeenAt: daysAgo(2) }),
      reporter(4, { firstSeenAt: null }),
    ]
    const result = shouldAutoHide({ reporters: mixed, now: NOW })
    expect(result.qualifying).toBe(2)
    expect(result.hide).toBe(AUTO_HIDE_REPORTS <= 2)
  })

  /*
   * Short-circuits to false, not true. A post a moderator hid and which is
   * then reported twice more must not be re-hidden by the system: that would
   * write a second log entry attributing the hide to reports and overwrite who
   * actually did it.
   */
  it('does not re-hide a post that is already hidden', () => {
    expect(shouldAutoHide({ reporters: enough(), alreadyHidden: true, now: NOW })).toEqual({
      hide: false,
      qualifying: AUTO_HIDE_REPORTS,
    })
  })

  /*
   * The moderator list is an environment variable, so a hide that silenced a
   * moderator could not be undone from inside the app by anybody else. The
   * same reasoning api/_routes/chat/block.js gives for refusing to block one.
   */
  it('never auto-hides a moderator', () => {
    expect(
      shouldAutoHide({ reporters: enough(), authorIsModerator: true, now: NOW }).hide,
    ).toBe(false)
  })

  it('reports the count even when it refuses, because the log wants it', () => {
    const result = shouldAutoHide({ reporters: enough(), alreadyHidden: true, now: NOW })
    expect(result.qualifying).toBe(AUTO_HIDE_REPORTS)
  })

  it('does not hide with no reports at all', () => {
    expect(shouldAutoHide({ reporters: [], now: NOW })).toEqual({ hide: false, qualifying: 0 })
    expect(shouldAutoHide({ reporters: null, now: NOW }).hide).toBe(false)
  })
})

describe('hiddenNotice', () => {
  it('tells the author it still exists and nobody else can see it', () => {
    const notice = hiddenNotice({ hiddenBy: null }, true)
    expect(notice).toMatch(/not been deleted/i)
    expect(notice).toMatch(/can still see it/i)
    expect(notice).toMatch(/reported/i)
  })

  it('tells the author when a moderator did it rather than the system', () => {
    const notice = hiddenNotice({ hiddenBy: '0x' + '1'.repeat(40) }, true)
    expect(notice).toMatch(/moderator has hidden/i)
    expect(notice).not.toMatch(/automatically/i)
  })

  /*
   * Neither sentence names the reporters or the count. A post hidden by three
   * accounts must not become a way for its author to work out which three.
   */
  it('never says how many reported it or who', () => {
    for (const isAuthor of [true, false]) {
      const notice = hiddenNotice({ hiddenBy: null }, isAuthor)
      expect(notice).not.toMatch(/\d/)
      expect(notice).not.toMatch(/0x/)
    }
  })

  it('tells a stranger something is withheld rather than that nothing exists', () => {
    const notice = hiddenNotice({ hiddenBy: null }, false)
    expect(notice).toMatch(/hidden/i)
    expect(notice).toMatch(/moderator/i)
  })

  it('says something for a post with nothing on it', () => {
    expect(hiddenNotice(null, true).length).toBeGreaterThan(10)
    expect(hiddenNotice(null, false).length).toBeGreaterThan(10)
  })
})
