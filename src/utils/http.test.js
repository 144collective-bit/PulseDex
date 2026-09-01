import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTimeout, isTimeout, DEFAULT_TIMEOUT_MS } from './http'

/*
 * The deadline on every network call.
 *
 * `fetch` has none, so a host that accepts the connection and then says
 * nothing holds its caller open for the life of the tab - no error, no retry,
 * a panel stuck on "loading" forever. It is also what makes the RPC failover
 * real rather than decorative: the transport can only move to the next
 * endpoint once the current one has actually failed.
 */

let realFetch

beforeEach(() => {
  realFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.useRealTimers()
})

/** A fetch that never settles until its signal aborts. */
function hangingFetch() {
  return vi.fn(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal.reason))
      }),
  )
}

describe('fetchWithTimeout', () => {
  it('passes a successful response straight through', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const res = await fetchWithTimeout('https://example.test/x')

    expect(res.status).toBe(200)
  })

  it('gives up on a request that never answers', async () => {
    globalThis.fetch = hangingFetch()

    await expect(fetchWithTimeout('https://example.test/hang', { timeout: 20 })).rejects.toThrow(
      /timed out/i,
    )
  })

  it('names the failure so a caller can tell it apart from a refusal', async () => {
    globalThis.fetch = hangingFetch()

    const err = await fetchWithTimeout('https://example.test/hang', { timeout: 20 }).catch((e) => e)

    expect(isTimeout(err)).toBe(true)
    expect(err.url).toBe('https://example.test/hang')
  })

  it('says how long it waited, because "Timeout" alone is useless on screen', async () => {
    globalThis.fetch = hangingFetch()

    const err = await fetchWithTimeout('https://example.test/hang', { timeout: 1000 }).catch((e) => e)

    expect(err.message).toContain('1s')
  })

  it("honours the caller's own abort signal", async () => {
    globalThis.fetch = hangingFetch()
    const controller = new AbortController()

    const pending = fetchWithTimeout('https://example.test/hang', {
      timeout: 5000,
      signal: controller.signal,
    })
    controller.abort(new Error('component unmounted'))

    // A caller's abort is not a timeout - an unmounted component is not a
    // failure, and must not be reported as one.
    const err = await pending.catch((e) => e)
    expect(isTimeout(err)).toBe(false)
  })

  it('does not leave the deadline running after a response', async () => {
    vi.useFakeTimers()
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    await fetchWithTimeout('https://example.test/x')

    expect(clear).toHaveBeenCalled()
  })

  it('forwards method and headers unchanged', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    await fetchWithTimeout('https://example.test/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })

    const [, options] = globalThis.fetch.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'content-type': 'application/json' })
    // The timeout is ours, not something to hand to fetch.
    expect(options.timeout).toBeUndefined()
  })

  it('has a default deadline, so a caller cannot forget one', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0)
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})
