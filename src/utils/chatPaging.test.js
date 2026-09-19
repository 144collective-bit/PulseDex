import { describe, it, expect } from 'vitest'
import { hasMoreBefore, oldestCursor, PAGE_SIZE } from './chatPaging'

/*
 * Paging back through a conversation.
 *
 * Small arithmetic, and every mistake available in it produces the same
 * symptom from the outside: a "load older" button that does nothing. Either it
 * pages from the wrong end and fetches an empty set, or it re-fetches the page
 * it already has and the merge silently absorbs it.
 */

const at = (iso) => ({ createdAt: iso })

describe('hasMoreBefore', () => {
  it('says yes on a full page', () => {
    expect(hasMoreBefore(Array(PAGE_SIZE).fill(at('2026-09-19T00:00:00Z')))).toBe(true)
  })

  it('says no on a short page, which is the end', () => {
    expect(hasMoreBefore(Array(PAGE_SIZE - 1).fill(at('2026-09-19T00:00:00Z')))).toBe(false)
  })

  it('says no on an empty page', () => {
    expect(hasMoreBefore([])).toBe(false)
  })

  it('says yes on an over-full page rather than only an exact one', () => {
    // `>=`, not `===`. A limit honoured loosely by the server would otherwise
    // read as the end of the conversation.
    expect(hasMoreBefore(Array(PAGE_SIZE + 3).fill(at('x')), PAGE_SIZE)).toBe(true)
  })

  it('answers false rather than throwing for anything that is not a page', () => {
    expect(hasMoreBefore(undefined)).toBe(false)
    expect(hasMoreBefore(null)).toBe(false)
    expect(hasMoreBefore('50')).toBe(false)
  })
})

describe('oldestCursor', () => {
  it('finds the oldest timestamp', () => {
    const messages = [
      at('2026-09-19T09:00:00Z'),
      at('2026-09-19T10:00:00Z'),
      at('2026-09-19T11:00:00Z'),
    ]
    expect(oldestCursor(messages)).toBe('2026-09-19T09:00:00Z')
  })

  it('finds it wherever it sits, not just at the front', () => {
    // The display list is sorted, but a realtime message landing mid-merge can
    // be appended before the sort runs. Taking messages[0] would then page from
    // the wrong end and fetch nothing.
    const messages = [
      at('2026-09-19T11:00:00Z'),
      at('2026-09-19T08:00:00Z'),
      at('2026-09-19T10:00:00Z'),
    ]
    expect(oldestCursor(messages)).toBe('2026-09-19T08:00:00Z')
  })

  it('has nothing to page back from when nothing is loaded', () => {
    expect(oldestCursor([])).toBeNull()
    expect(oldestCursor(undefined)).toBeNull()
  })

  it('ignores entries without a usable timestamp', () => {
    const messages = [{ createdAt: null }, at('2026-09-19T10:00:00Z'), {}]
    expect(oldestCursor(messages)).toBe('2026-09-19T10:00:00Z')
  })

  it('answers null when no entry has one at all', () => {
    expect(oldestCursor([{}, { createdAt: 42 }])).toBeNull()
  })
})
