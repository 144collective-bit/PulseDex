import { describe, it, expect } from 'vitest'
import { isChunkLoadError, loadWithRetry, RELOAD_KEY } from './lazyRetry'

/** A storage stand-in, so none of this needs a browser. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

const chunkError = (message = 'Failed to fetch dynamically imported module: /assets/X-abc.js') =>
  new Error(message)

/** Never wait in the suite; the delay is behaviour, not timing. */
const harness = (over = {}) => {
  const reloads = []
  return {
    reloads,
    options: {
      delay: () => Promise.resolve(),
      storage: fakeStorage(),
      reload: () => reloads.push(1),
      ...over,
    },
  }
}

describe('isChunkLoadError', () => {
  it('recognises the browsers that phrase it differently', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to load /assets/x.js'))).toBe(true)
    const named = new Error('boom')
    named.name = 'ChunkLoadError'
    expect(isChunkLoadError(named)).toBe(true)
  })

  it('leaves ordinary errors alone, so a real bug is not retried as a network problem', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(new Error('Your profile could not be loaded.'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('loadWithRetry', () => {
  it('returns the module when the import works first time', async () => {
    const h = harness()
    const mod = { default: 'Tab' }
    expect(await loadWithRetry(() => Promise.resolve(mod), h.options)).toBe(mod)
    expect(h.reloads).toHaveLength(0)
  })

  it('retries once, which is what a transient blip needs', async () => {
    const h = harness()
    let calls = 0
    const mod = { default: 'Tab' }
    const importer = () => {
      calls += 1
      return calls === 1 ? Promise.reject(chunkError()) : Promise.resolve(mod)
    }
    expect(await loadWithRetry(importer, h.options)).toBe(mod)
    expect(calls).toBe(2)
    expect(h.reloads).toHaveLength(0)
  })

  it('reloads after a second failure, rather than letting the app unmount', async () => {
    const h = harness()
    let outcome = 'pending'
    loadWithRetry(() => Promise.reject(chunkError()), h.options).then(
      () => { outcome = 'resolved' },
      () => { outcome = 'rejected' }
    )
    // Let both attempts and the delay between them run.
    for (let i = 0; i < 12; i += 1) await Promise.resolve()

    expect(h.reloads).toHaveLength(1)
    // Pending on purpose: settling either way would render, or briefly show an
    // error from, a build that is already being replaced.
    expect(outcome).toBe('pending')
    expect(h.options.storage.getItem(RELOAD_KEY)).toBe('1')
  })

  it('reloads only once per tab, so a genuinely missing chunk cannot loop', async () => {
    const storage = fakeStorage({ [RELOAD_KEY]: '1' })
    const h = harness({ storage })
    await expect(loadWithRetry(() => Promise.reject(chunkError()), h.options)).rejects.toThrow(
      /dynamically imported module/
    )
    expect(h.reloads).toHaveLength(0)
  })

  it('clears the guard on a successful load, so the next deploy can recover too', async () => {
    const storage = fakeStorage({ [RELOAD_KEY]: '1' })
    const h = harness({ storage })
    await loadWithRetry(() => Promise.resolve({ default: 'Tab' }), h.options)
    expect(storage.getItem(RELOAD_KEY)).toBe(null)
  })

  it('does not retry or reload a real error thrown while the module evaluates', async () => {
    const h = harness()
    let calls = 0
    const importer = () => {
      calls += 1
      return Promise.reject(new TypeError('x is not a function'))
    }
    await expect(loadWithRetry(importer, h.options)).rejects.toThrow('x is not a function')
    expect(calls).toBe(1)
    expect(h.reloads).toHaveLength(0)
  })
})
