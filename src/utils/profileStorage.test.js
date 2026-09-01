import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readScoped, writeScoped, subscribeScoped, storageKey, scopeFor } from './profileStorage'

/*
 * Per-account storage, and the notification that stops surfaces overwriting
 * each other.
 *
 * The watchlist is read by the screener, the sidebar, the portfolio page and a
 * dashboard module, each holding its own copy in component state. A surface
 * that wrote its whole list back from a stale copy silently dropped whatever
 * another had added - not a stale star, actual data loss. Writers announce;
 * readers re-read.
 */

/** A localStorage that behaves like the real one, including throwing on quota. */
function makeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}

beforeEach(() => {
  globalThis.localStorage = makeStorage()
})

describe('scoping', () => {
  it('keeps each account in its own key', () => {
    expect(storageKey('watchlist', '0xABC')).toBe('pulsedex_watchlist:0xabc')
    expect(storageKey('watchlist', null)).toBe('pulsedex_watchlist:guest')
  })

  it('lowercases the address, so checksum casing cannot split one account in two', () => {
    expect(scopeFor('0xAbCd')).toBe(scopeFor('0xabcd'))
  })

  it('does not let one account read another', () => {
    writeScoped('watchlist', '0xaaa', ['pair-1'])
    expect(readScoped('watchlist', '0xbbb', null)).toBeNull()
  })

  it('falls back rather than throwing on a corrupted value', () => {
    localStorage.setItem('pulsedex_watchlist:guest', '{not json')
    expect(readScoped('watchlist', null, 'fallback')).toBe('fallback')
  })

  it('reads arrays back, which the watchlist depends on', () => {
    writeScoped('watchlist', null, ['a', 'b'])
    expect(readScoped('watchlist', null, null)).toEqual(['a', 'b'])
  })
})

describe('subscribeScoped', () => {
  it('tells listeners about a write', () => {
    const seen = vi.fn()
    subscribeScoped('watchlist', seen)

    writeScoped('watchlist', null, ['a'])

    expect(seen).toHaveBeenCalledWith(['a'])
  })

  it('announces after the write, so a listener that re-reads sees the new value', () => {
    let observed = null
    subscribeScoped('watchlist', () => {
      observed = readScoped('watchlist', null, null)
    })

    writeScoped('watchlist', null, ['fresh'])

    expect(observed).toEqual(['fresh'])
  })

  it('only tells listeners of the record that changed', () => {
    const watchers = vi.fn()
    const others = vi.fn()
    subscribeScoped('watchlist', watchers)
    subscribeScoped('dashboards', others)

    writeScoped('watchlist', null, ['a'])

    expect(watchers).toHaveBeenCalledOnce()
    expect(others).not.toHaveBeenCalled()
  })

  it('stops on unsubscribe', () => {
    const seen = vi.fn()
    const off = subscribeScoped('watchlist', seen)
    off()

    writeScoped('watchlist', null, ['a'])

    expect(seen).not.toHaveBeenCalled()
  })

  it('does not let one throwing listener stop the others, or fail the write', () => {
    const after = vi.fn()
    subscribeScoped('watchlist', () => {
      throw new Error('listener is broken')
    })
    subscribeScoped('watchlist', after)

    expect(writeScoped('watchlist', null, ['a'])).toBe(true)
    expect(after).toHaveBeenCalled()
  })

  it('reports a refused write instead of pretending it succeeded', () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }

    expect(writeScoped('watchlist', null, ['a'])).toBe(false)
  })
})

describe('the loss this was written to stop', () => {
  it('lets a second surface re-read before writing its own list back', () => {
    // The screener holds ['a'] in component state.
    writeScoped('watchlist', null, ['a'])
    let screenerState = readScoped('watchlist', null, [])

    subscribeScoped('watchlist', () => {
      screenerState = readScoped('watchlist', null, [])
    })

    // The dashboard adds a pair.
    writeScoped('watchlist', null, [...screenerState, 'b'])

    // The screener now un-stars 'a' from what it believes the list to be.
    const next = screenerState.filter((x) => x !== 'a')
    writeScoped('watchlist', null, next)

    // 'b' survived. Without the subscription this ended as [].
    expect(readScoped('watchlist', null, null)).toEqual(['b'])
  })
})
