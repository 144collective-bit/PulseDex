import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/*
 * The retry policy in front of the block explorer.
 *
 * The rule it encodes: a 4xx that is not a 429 is the server's settled
 * opinion, and asking four more times only delays it. Unverified contracts
 * answer 404 and are the commonest case there is - retrying cost five requests
 * and about fifteen seconds of backoff to arrive at the same reply.
 */

vi.mock('../utils/http', () => ({
  fetchWithTimeout: vi.fn(),
  isTimeout: (e) => e?.name === 'TimeoutError',
}))

const { fetchWithTimeout } = await import('../utils/http')
const { fetchWithRetry } = await import('./pulsescan')

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = (status) => ({
  ok: false,
  status,
  statusText: 'x',
  text: async () => '',
  headers: { get: () => null },
})

beforeEach(() => {
  fetchWithTimeout.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWithRetry', () => {
  it('returns the parsed body on success', async () => {
    fetchWithTimeout.mockResolvedValue(ok({ items: [1, 2] }))

    await expect(fetchWithRetry('https://scan.test/x')).resolves.toEqual({ items: [1, 2] })
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('asks once and gives up on a 404', async () => {
    fetchWithTimeout.mockResolvedValue(fail(404))

    await expect(fetchWithRetry('https://scan.test/missing')).rejects.toThrow(/404/)
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('asks once and gives up on a 400', async () => {
    fetchWithTimeout.mockResolvedValue(fail(400))

    await expect(fetchWithRetry('https://scan.test/bad')).rejects.toThrow(/400/)
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('carries the status on the error, so callers can tell missing from broken', async () => {
    fetchWithTimeout.mockResolvedValue(fail(404))

    const err = await fetchWithRetry('https://scan.test/missing').catch((e) => e)

    expect(err.status).toBe(404)
  })

  it('retries a 500, because those genuinely do pass', async () => {
    fetchWithTimeout.mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok({ items: [] }))

    await expect(fetchWithRetry('https://scan.test/x', {}, 2, 1)).resolves.toEqual({ items: [] })
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
  })

  it('retries a network failure', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(ok({ a: 1 }))

    await expect(fetchWithRetry('https://scan.test/x', {}, 2, 1)).resolves.toEqual({ a: 1 })
  })

  it('gives up after the retry budget', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('network down'))

    await expect(fetchWithRetry('https://scan.test/x', {}, 2, 1)).rejects.toThrow(/network down/)
    // The first attempt plus two retries.
    expect(fetchWithTimeout).toHaveBeenCalledTimes(3)
  })

  it('asks for JSON', async () => {
    fetchWithTimeout.mockResolvedValue(ok({}))

    await fetchWithRetry('https://scan.test/x')

    const [, options] = fetchWithTimeout.mock.calls[0]
    expect(options.headers.Accept).toBe('application/json')
  })
})
