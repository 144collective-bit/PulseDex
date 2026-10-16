import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchModerationLog, fetchMyLimits, fetchReportQueue } from './moderation'

/**
 * The same lesson as mutes.test.js, applied to the three reads in this file:
 * a 200 from this origin is not a promise of JSON. A deployment with no API
 * answers every request with index.html at status 200, so a status check sees
 * success and `res.json()` rejects on the doctype.
 *
 * What differs between them is what that failure should cost, and these tests
 * are mostly about that difference.
 */
const answer = (over) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(over))

const notJson = {
  ok: true,
  status: 200,
  json: async () => {
    throw new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`)
  },
}

afterEach(() => vi.unstubAllGlobals())

/*
 * This one must never throw, and that is the opposite call from the other two.
 *
 * What it feeds is a line in the composer saying how much room is left. A
 * composer that would not open - or a rejection nobody handles - because that
 * line could not be fetched is a worse outcome than the line being missing.
 */
describe('fetchMyLimits', () => {
  it('is null rather than throwing when a 200 is not JSON', async () => {
    answer(notJson)
    await expect(fetchMyLimits()).resolves.toBeNull()
  })

  it('is null when the endpoint refuses', async () => {
    answer({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchMyLimits()).resolves.toBeNull()
  })

  it('is null when there is no network at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchMyLimits()).resolves.toBeNull()
  })

  it('reads the timestamps and the limits the deployment enforces', async () => {
    answer({
      ok: true,
      status: 200,
      json: async () => ({
        posts: [1, 2],
        messages: [3],
        limits: { posts: [{ limit: 3, windowMs: 60_000 }] },
      }),
    })

    const payload = await fetchMyLimits()
    expect(payload.posts).toEqual([1, 2])
    expect(payload.limits.posts).toHaveLength(1)
  })

  // A response with the fields missing must not become `undefined.map`
  // somewhere downstream.
  it('copes with a response missing the fields it expects', async () => {
    answer({ ok: true, status: 200, json: async () => ({}) })

    const payload = await fetchMyLimits()
    expect(payload).toEqual({ posts: [], messages: [], limits: null })
  })
})

/*
 * These two throw, because the panel they feed IS the information: a queue
 * that rendered empty after a failed request would tell a moderator there is
 * nothing to do, which is the one wrong thing it could say.
 *
 * What the tests check is that the message is ours. "Unexpected token '<'" in
 * front of a moderator says nothing about what went wrong or what to do.
 */
describe('fetchModerationLog', () => {
  it('throws a sentence, not a parse error, when a 200 is not JSON', async () => {
    answer(notJson)
    await expect(fetchModerationLog()).rejects.toThrow(/audit trail could not be loaded/i)
    answer(notJson)
    await expect(fetchModerationLog()).rejects.not.toThrow(/Unexpected token/)
  })

  it('passes on what the endpoint said went wrong', async () => {
    answer({
      ok: false,
      status: 503,
      json: async () => ({ error: 'The audit trail is not set up on this deployment. Run migration 0021.' }),
    })

    // Named rather than generic, because the difference between "broken" and
    // "not migrated yet" is the whole question a moderator has.
    await expect(fetchModerationLog()).rejects.toThrow(/migration 0021/)
  })

  it('asks only for what it was told to filter on', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ entries: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    await fetchModerationLog({ post: 412 })

    const url = fetchMock.mock.calls[0][0]
    expect(url).toMatch(/post=412/)
    expect(url).not.toMatch(/address=/)
  })

  it('is an empty list when the endpoint sends no entries', async () => {
    answer({ ok: true, status: 200, json: async () => ({}) })
    await expect(fetchModerationLog()).resolves.toEqual([])
  })
})

describe('fetchReportQueue', () => {
  it('throws a sentence, not a parse error, when a 200 is not JSON', async () => {
    answer(notJson)
    await expect(fetchReportQueue()).rejects.toThrow(/report queue could not be loaded/i)
  })

  /*
   * 404 is what the endpoint answers somebody who does not moderate - matching
   * every moderator route here, because a 403 confirms there is something
   * behind it worth having. It still reads as a failure to this function; the
   * panel is what decides not to ask in the first place.
   */
  it('throws for somebody who does not moderate', async () => {
    answer({ ok: false, status: 404, json: async () => ({ error: 'Not found.' }) })
    await expect(fetchReportQueue()).rejects.toThrow(/not found/i)
  })

  it('is an empty list when nothing has been reported', async () => {
    answer({ ok: true, status: 200, json: async () => ({ reports: [] }) })
    await expect(fetchReportQueue()).resolves.toEqual([])
  })
})
