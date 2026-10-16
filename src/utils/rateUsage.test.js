import { describe, expect, it } from 'vitest'
import { FEED_POST_LIMITS } from './chatRate'
import { rateUsage, resetLabel, usageLabel } from './rateUsage'

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)
const secondsAgo = (n) => NOW - n * 1000

const LIMITS = [
  { limit: 3, windowMs: 60_000 },
  { limit: 20, windowMs: 3_600_000 },
]

describe('rateUsage', () => {
  it('reports every window, not just the binding one', () => {
    const { windows } = rateUsage([secondsAgo(5)], LIMITS, NOW)
    expect(windows).toHaveLength(2)
    expect(windows.map((w) => w.used)).toEqual([1, 1])
  })

  /*
   * Which window is binding changes: three posts quickly is the per-minute
   * one, twenty over an afternoon is the per-hour one. A display that only
   * showed one would be wrong half the time.
   */
  it('counts a post against the long window and not the short one', () => {
    const { windows } = rateUsage([secondsAgo(600)], LIMITS, NOW)
    expect(windows[0].used).toBe(0)
    expect(windows[1].used).toBe(1)
  })

  it('counts what is left', () => {
    const { windows } = rateUsage([secondsAgo(1), secondsAgo(2)], LIMITS, NOW)
    expect(windows[0].left).toBe(1)
    expect(windows[1].left).toBe(18)
  })

  it('never reports a negative remainder', () => {
    const many = Array.from({ length: 10 }, (_, i) => secondsAgo(i))
    const { windows } = rateUsage(many, LIMITS, NOW)
    expect(windows[0].left).toBe(0)
  })

  it('says when a post would be refused', () => {
    const three = [secondsAgo(1), secondsAgo(2), secondsAgo(3)]
    expect(rateUsage(three, LIMITS, NOW).blocked).toBe(true)
    expect(rateUsage(three.slice(0, 2), LIMITS, NOW).blocked).toBe(false)
  })

  /*
   * The oldest post still counting decides when room opens up. Reporting the
   * whole window would tell somebody quiet for nine of the last ten minutes
   * to wait another ten.
   */
  it('counts down from the oldest post that still counts', () => {
    const three = [secondsAgo(50), secondsAgo(2), secondsAgo(1)]
    const { windows } = rateUsage(three, LIMITS, NOW)
    expect(windows[0].resetsInMs).toBe(10_000)
  })

  it('reports no countdown while there is room', () => {
    const { windows } = rateUsage([secondsAgo(1)], LIMITS, NOW)
    expect(windows[0].resetsInMs).toBe(0)
  })

  it('names the window closest to refusing', () => {
    const three = [secondsAgo(1), secondsAgo(2), secondsAgo(3)]
    expect(rateUsage(three, LIMITS, NOW).tightest.windowMs).toBe(60_000)
  })

  it('breaks a tie toward the shorter window, which is the one about to bite', () => {
    // Nothing posted: both have their whole allowance left.
    const { tightest } = rateUsage([], LIMITS, NOW)
    expect(tightest.windowMs).toBe(60_000)
  })

  it('reads timestamps that arrive as ISO strings, which is how a row holds them', () => {
    const iso = new Date(secondsAgo(5)).toISOString()
    expect(rateUsage([iso], LIMITS, NOW).windows[0].used).toBe(1)
  })

  /*
   * The timestamps come from the database's clock and `now` from this one. An
   * age that comes out negative counts toward every window and gives a reset
   * time in the past - a limit that either never lifts or never applies.
   */
  it('clamps a timestamp from the future to now rather than going negative', () => {
    const { windows } = rateUsage([NOW + 60_000], LIMITS, NOW)
    expect(windows[0].used).toBe(1)
    expect(windows[0].resetsInMs).toBe(0)
  })

  it('ignores anything unreadable', () => {
    const { windows } = rateUsage([null, 'soon', {}, NaN, secondsAgo(1)], LIMITS, NOW)
    expect(windows[0].used).toBe(1)
  })

  it('survives being given nothing', () => {
    expect(rateUsage(null, LIMITS, NOW).windows).toHaveLength(2)
    expect(rateUsage([], null, NOW).windows).toEqual([])
    expect(rateUsage(null, null, NOW).tightest).toBeNull()
    expect(rateUsage(null, null, NOW).blocked).toBe(false)
  })

  it('works against the app’s real feed limits', () => {
    const { windows, blocked } = rateUsage([secondsAgo(1)], FEED_POST_LIMITS, NOW)
    expect(windows).toHaveLength(FEED_POST_LIMITS.length)
    expect(blocked).toBe(false)
  })
})

describe('usageLabel', () => {
  it('reads in the units a person uses', () => {
    expect(usageLabel({ limit: 20, windowMs: 3_600_000, used: 3 })).toBe('3 of 20 an hour')
    expect(usageLabel({ limit: 3, windowMs: 60_000, used: 1 })).toBe('1 of 3 a minute')
    expect(usageLabel({ limit: 5, windowMs: 10_000, used: 0 })).toBe('0 of 5 per 10 seconds')
  })

  it('pluralises a multi-unit window', () => {
    expect(usageLabel({ limit: 9, windowMs: 600_000, used: 2 })).toBe('2 of 9 per 10 minutes')
  })

  it('is null with no window', () => {
    expect(usageLabel(null)).toBeNull()
    expect(usageLabel(undefined)).toBeNull()
  })
})

describe('resetLabel', () => {
  it('counts seconds under two minutes', () => {
    expect(resetLabel(40_000)).toBe('40s')
    expect(resetLabel(119_000)).toBe('119s')
  })

  // "try again in 312 seconds" is arithmetic somebody has to do.
  it('switches to minutes above that', () => {
    expect(resetLabel(312_000)).toBe('6m')
  })

  it('rounds up, so it never says zero of anything', () => {
    expect(resetLabel(1)).toBe('1s')
  })

  it('is null when there is room now', () => {
    expect(resetLabel(0)).toBeNull()
    expect(resetLabel(-5)).toBeNull()
    expect(resetLabel(null)).toBeNull()
    expect(resetLabel('soon')).toBeNull()
  })
})
