import { describe, expect, it } from 'vitest'
import {
  EDIT_REFUSED,
  EDIT_WINDOW_MS,
  canEditPost,
  editWindowLabel,
  editWindowLeft,
  wasEdited,
} from './postEdit'

const ME = '0x1111111111111111111111111111111111111111'
const SOMEBODY = '0x2222222222222222222222222222222222222222'
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0)

const post = (over = {}) => ({
  id: 1,
  address: ME,
  createdAt: new Date(NOW - 60_000).toISOString(),
  deletedAt: null,
  ...over,
})

describe('canEditPost', () => {
  it('allows the author inside the window', () => {
    expect(canEditPost({ post: post(), account: ME, now: NOW })).toEqual({ ok: true })
  })

  it('does not care what case the address arrives in', () => {
    expect(canEditPost({ post: post(), account: ME.toUpperCase(), now: NOW }).ok).toBe(true)
    expect(canEditPost({ post: post({ address: ME.toUpperCase() }), account: ME, now: NOW }).ok).toBe(
      true,
    )
  })

  it('refuses somebody else', () => {
    expect(canEditPost({ post: post(), account: SOMEBODY, now: NOW })).toEqual({
      ok: false,
      reason: EDIT_REFUSED.notYours,
    })
  })

  it('refuses when signed out', () => {
    expect(canEditPost({ post: post(), account: null, now: NOW }).reason).toBe(
      EDIT_REFUSED.notYours,
    )
  })

  it('allows an edit right up to the boundary', () => {
    const at = new Date(NOW - EDIT_WINDOW_MS).toISOString()
    expect(canEditPost({ post: post({ createdAt: at }), account: ME, now: NOW }).ok).toBe(true)
  })

  it('refuses one millisecond past it', () => {
    const at = new Date(NOW - EDIT_WINDOW_MS - 1).toISOString()
    expect(canEditPost({ post: post({ createdAt: at }), account: ME, now: NOW })).toEqual({
      ok: false,
      reason: EDIT_REFUSED.windowClosed,
    })
  })

  /*
   * The rule that actually stops the abuse the window is a compromise about.
   * Rewriting a post that has an answer under it makes the answer look like a
   * response to something nobody said.
   */
  it('refuses a post somebody has already replied to, however new it is', () => {
    const fresh = post({ createdAt: new Date(NOW - 1000).toISOString() })
    expect(canEditPost({ post: fresh, account: ME, replyCount: 1, now: NOW })).toEqual({
      ok: false,
      reason: EDIT_REFUSED.answered,
    })
  })

  it('treats a missing reply count as none', () => {
    expect(canEditPost({ post: post(), account: ME, now: NOW }).ok).toBe(true)
  })

  it('refuses a removed post', () => {
    const gone = post({ deletedAt: new Date(NOW).toISOString() })
    expect(canEditPost({ post: gone, account: ME, now: NOW }).reason).toBe(EDIT_REFUSED.gone)
  })

  it('refuses a post that is not one', () => {
    expect(canEditPost({ post: null, account: ME, now: NOW }).reason).toBe(EDIT_REFUSED.gone)
    expect(canEditPost({ post: {}, account: ME, now: NOW }).reason).toBe(EDIT_REFUSED.gone)
    expect(canEditPost({ post: { address: ME }, account: ME, now: NOW }).reason).toBe(
      EDIT_REFUSED.gone,
    )
  })

  /*
   * An unreadable date reads as out of time rather than in it. The failure
   * that refuses an edit beats the one that allows a silent rewrite of a post
   * of unknown age.
   */
  it('refuses when the timestamp cannot be read', () => {
    const odd = post({ createdAt: 'whenever' })
    expect(canEditPost({ post: odd, account: ME, now: NOW }).reason).toBe(
      EDIT_REFUSED.windowClosed,
    )
  })

  it('refuses a post somehow dated in the future rather than opening forever', () => {
    // now - at is negative, which is inside the window - correct, and worth
    // pinning so a clock skew does not read as an expired post.
    const ahead = post({ createdAt: new Date(NOW + 60_000).toISOString() })
    expect(canEditPost({ post: ahead, account: ME, now: NOW }).ok).toBe(true)
  })
})

describe('editWindowLeft', () => {
  it('counts down', () => {
    const at = new Date(NOW - 60_000).toISOString()
    expect(editWindowLeft({ createdAt: at }, NOW)).toBe(EDIT_WINDOW_MS - 60_000)
  })

  it('is zero once the window has closed', () => {
    const at = new Date(NOW - EDIT_WINDOW_MS - 5000).toISOString()
    expect(editWindowLeft({ createdAt: at }, NOW)).toBe(0)
  })

  it('is zero for anything unreadable', () => {
    expect(editWindowLeft(null, NOW)).toBe(0)
    expect(editWindowLeft({}, NOW)).toBe(0)
    expect(editWindowLeft({ createdAt: 'soon' }, NOW)).toBe(0)
  })
})

describe('editWindowLabel', () => {
  it('counts in minutes while there are minutes', () => {
    const at = new Date(NOW - 60_000).toISOString()
    expect(editWindowLabel({ createdAt: at }, NOW)).toBe('4m')
  })

  it('switches to seconds in the last minute, where the number matters', () => {
    const at = new Date(NOW - (EDIT_WINDOW_MS - 30_000)).toISOString()
    expect(editWindowLabel({ createdAt: at }, NOW)).toBe('30s')
  })

  it('is null once there is nothing left to say', () => {
    const at = new Date(NOW - EDIT_WINDOW_MS - 1).toISOString()
    expect(editWindowLabel({ createdAt: at }, NOW)).toBeNull()
    expect(editWindowLabel(null, NOW)).toBeNull()
  })
})

describe('wasEdited', () => {
  it('is true for a post changed later', () => {
    const p = { createdAt: new Date(NOW).toISOString(), editedAt: new Date(NOW + 60_000).toISOString() }
    expect(wasEdited(p)).toBe(true)
  })

  it('is false for a post never changed', () => {
    expect(wasEdited({ createdAt: new Date(NOW).toISOString(), editedAt: null })).toBe(false)
    expect(wasEdited({ createdAt: new Date(NOW).toISOString() })).toBe(false)
  })

  /*
   * The marker's whole value is that it means something. A stamp within a
   * second of the insert is the write itself - a backfill, or two statements
   * either side of a clock skew - and drawing "edited" on a post nobody
   * touched would spend the marker's credibility for nothing.
   */
  it('is false for a stamp within a second of the insert', () => {
    const created = new Date(NOW).toISOString()
    expect(wasEdited({ createdAt: created, editedAt: created })).toBe(false)
    expect(wasEdited({ createdAt: created, editedAt: new Date(NOW + 900).toISOString() })).toBe(false)
  })

  it('is false for anything unreadable', () => {
    expect(wasEdited(null)).toBe(false)
    expect(wasEdited({})).toBe(false)
    expect(wasEdited({ editedAt: 'later' })).toBe(false)
  })

  // An edit stamp with no creation date is still an edit: the marker is about
  // the edit, and losing it because the other column is odd is the wrong way
  // to fail.
  it('is true for an edit stamp beside an unreadable creation date', () => {
    expect(wasEdited({ createdAt: 'whenever', editedAt: new Date(NOW).toISOString() })).toBe(true)
  })
})
