import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchMutes, setMuted } from './mutes'

/**
 * What a mute read is allowed to do when it cannot read anything.
 *
 * These tests exist because of a CI failure rather than in anticipation of
 * one. The first version of `fetchMutes` caught its own errors and logged
 * them, which failed three surfaces in the browser smoke run: a deployment
 * with no API answers every request with index.html at status 200, so
 * `res.json()` rejects on the doctype, and every page holding a feed printed
 * a console error during load. scripts/smoke-browser.mjs treats any console
 * error during a load as a failed surface, deliberately.
 *
 * The lesson generalises past previews and is what these assert: **a 200 from
 * this origin is not a promise of JSON**, and a private list that cannot be
 * read must be distinguishable from an empty one.
 */
describe('fetchMutes', () => {
  let fetchMock

  const answer = (over) => {
    fetchMock = vi.fn().mockResolvedValue(over)
    vi.stubGlobal('fetch', fetchMock)
  }

  afterEach(() => vi.unstubAllGlobals())

  it('reads a list', async () => {
    answer({
      ok: true,
      status: 200,
      json: async () => ({ addresses: ['0xABC'], muted: [{ address: '0xabc' }] }),
    })

    const { addresses, muted } = await fetchMutes()
    // Lowercased, because an address arrives from a row in one case and from a
    // URL in another, and the two are the same account to everyone except a
    // string compare.
    expect(addresses.has('0xabc')).toBe(true)
    expect(muted).toHaveLength(1)
  })

  /*
   * The failure that reached CI. Status 200, body is a page.
   *
   * It has to throw rather than come back empty: a caller that cannot tell
   * "nobody is muted" from "we could not find out" will quietly show posts
   * somebody asked not to see.
   */
  it('throws when a 200 is not JSON, rather than reading as nobody muted', async () => {
    answer({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`)
      },
    })

    await expect(fetchMutes()).rejects.toThrow(/muted list could not be loaded/i)
  })

  // And the message is ours, not the parser's. "Unexpected token '<'" in front
  // of a reader says nothing about what went wrong or what to do.
  it('does not surface the parse error itself', async () => {
    answer({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'")
      },
    })

    await expect(fetchMutes()).rejects.not.toThrow(/Unexpected token/)
  })

  it('throws on a server error', async () => {
    answer({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchMutes()).rejects.toThrow(/could not be loaded/i)
  })

  /*
   * 401 is an answer, not a failure: somebody who has not signed in has no
   * mute list. Returned empty rather than thrown, so a signed-out reader's
   * feed does not spend a rejection on every load.
   */
  it('reads a signed-out reader as having nobody muted', async () => {
    answer({ ok: false, status: 401, json: async () => ({}) })

    const { addresses, muted } = await fetchMutes()
    expect(addresses.size).toBe(0)
    expect(muted).toEqual([])
  })

  it('copes with a response missing the fields it expects', async () => {
    answer({ ok: true, status: 200, json: async () => ({}) })

    const { addresses, muted } = await fetchMutes()
    expect(addresses.size).toBe(0)
    expect(muted).toEqual([])
  })
})

describe('setMuted', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('muting sends the address in a body', async () => {
    await setMuted({ address: '0xabc', on: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/mutes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ address: '0xabc' })
  })

  /*
   * Unmuting puts the address in the query string rather than a body. The dev
   * server's shim only parses a body for POST and PUT, so a DELETE body would
   * work on Vercel and fail locally - the worst place for a difference to
   * live. The endpoint reads it from the query string to match.
   */
  it('unmuting sends the address in the query string, not a body', async () => {
    await setMuted({ address: '0xabc', on: false })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/mutes?address=0xabc')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('throws what the endpoint said went wrong', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'You cannot mute yourself.' }),
    })

    await expect(setMuted({ address: '0xabc', on: true })).rejects.toThrow(
      'You cannot mute yourself.',
    )
  })

  // A write that failed with no readable body still has to say something: a
  // control that reports nothing looks as though it worked.
  it('still throws when the endpoint said nothing readable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new SyntaxError('not JSON')
      },
    })

    await expect(setMuted({ address: '0xabc', on: true })).rejects.toThrow(
      /could not be saved/i,
    )
  })
})
