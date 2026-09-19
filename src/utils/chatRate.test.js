import { describe, it, expect } from 'vitest'
import {
  exceededLimit,
  retryAfterSeconds,
  POST_LIMITS,
  LONGEST_WINDOW_MS,
} from './chatRate'

/*
 * How often one wallet may post.
 *
 * The interesting cases are the boundaries and the clock. A limiter that is
 * off by one either lets a burst through or refuses the message that was
 * within its rights, and both look like a bug to whoever is typing.
 */

const NOW = 1_800_000_000_000
const ago = (ms) => NOW - ms

describe('exceededLimit', () => {
  it('allows a wallet that has said nothing', () => {
    expect(exceededLimit([], NOW)).toBeNull()
  })

  it('allows one message below the burst limit', () => {
    const four = [ago(1000), ago(2000), ago(3000), ago(4000)]
    expect(exceededLimit(four, NOW)).toBeNull()
  })

  it('refuses the one that would pass the burst limit', () => {
    const five = [ago(1000), ago(2000), ago(3000), ago(4000), ago(5000)]
    const result = exceededLimit(five, NOW)
    expect(result).not.toBeNull()
    expect(result.limit).toBe(5)
  })

  it('ignores posts that have aged out of the window', () => {
    // Five messages, but all older than ten seconds, so the burst window is
    // empty and this is an ordinary first message.
    const old = [ago(11_000), ago(12_000), ago(13_000), ago(14_000), ago(15_000)]
    expect(exceededLimit(old, NOW)).toBeNull()
  })

  it('catches the patient flood the burst limit lets through', () => {
    // One message every nine seconds never trips the short window, and sixty
    // of them is still a wall of text nobody asked for.
    const sixty = Array.from({ length: 60 }, (_, i) => ago(i * 9000 + 100))
    const result = exceededLimit(sixty, NOW)
    expect(result).not.toBeNull()
    expect(result.limit).toBe(60)
  })

  it('says how long to wait, counting from the oldest post that still counts', () => {
    // Quiet for nine of the last ten seconds. Reporting the whole window would
    // mean waiting ten more for room that arrives in one.
    const five = [ago(9000), ago(9100), ago(9200), ago(9300), ago(9400)]
    const result = exceededLimit(five, NOW)
    expect(result.retryAfterMs).toBe(10_000 - 9400)
  })

  it('reports the shorter window first when both are exceeded', () => {
    // Which one refused matters for the message shown: "slow down" and "you
    // have posted a lot today" are different sentences.
    const many = [
      ...Array.from({ length: 5 }, (_, i) => ago(i * 100)),
      ...Array.from({ length: 60 }, (_, i) => ago(20_000 + i * 1000)),
    ]
    expect(exceededLimit(many, NOW).windowMs).toBe(10_000)
  })

  it('treats a timestamp from the future as now', () => {
    // The rows carry the database's clock and `now` comes from the function's.
    // Left alone, a row a little ahead gives a negative age, which counts
    // toward every window and produces a retry time in the past.
    const skewed = [NOW + 500, ago(1000), ago(2000), ago(3000), ago(4000)]
    const result = exceededLimit(skewed, NOW)
    expect(result).not.toBeNull()
    expect(result.retryAfterMs).toBeGreaterThan(0)
    expect(result.retryAfterMs).toBeLessThanOrEqual(10_000)
  })

  it('ignores entries that are not usable numbers', () => {
    const junk = [null, undefined, 'yesterday', NaN, Infinity, ago(1000)]
    expect(exceededLimit(junk, NOW)).toBeNull()
  })

  it('answers null rather than throwing when handed no list at all', () => {
    expect(exceededLimit(undefined, NOW)).toBeNull()
    expect(exceededLimit(null, NOW)).toBeNull()
  })
})

describe('the windows themselves', () => {
  it('fetches far enough back to decide every limit', () => {
    // The handler reads this far back and no further. If a window were longer
    // than it, that limit would be applied to a partial list and never trip.
    for (const { windowMs } of POST_LIMITS) {
      expect(LONGEST_WINDOW_MS).toBeGreaterThanOrEqual(windowMs)
    }
  })

  it('puts the shorter window first, which is the order the check relies on', () => {
    const windows = POST_LIMITS.map((l) => l.windowMs)
    expect([...windows].sort((a, b) => a - b)).toEqual(windows)
  })
})

describe('retryAfterSeconds', () => {
  it('rounds up, so the wait it advertises is long enough', () => {
    expect(retryAfterSeconds(1200)).toBe(2)
  })

  it('never advertises zero, which is an invitation to retry immediately', () => {
    expect(retryAfterSeconds(0)).toBe(1)
    expect(retryAfterSeconds(10)).toBe(1)
  })
})
