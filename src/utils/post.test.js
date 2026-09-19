import { describe, it, expect } from 'vitest'
import { normalisePost, postLength, MAX_POST_LENGTH, REJECTED_POST } from './post'

describe('normalisePost', () => {
  it('keeps ordinary text unchanged', () => {
    expect(normalisePost('Bought the dip.')).toEqual({ ok: true, body: 'Bought the dip.' })
  })

  it('refuses anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, ['hi']]) {
      expect(normalisePost(value)).toEqual({ ok: false, reason: REJECTED_POST.notText })
    }
  })

  it('refuses a post that is only whitespace', () => {
    expect(normalisePost('   \n\n  \t ')).toEqual({ ok: false, reason: REJECTED_POST.empty })
  })

  it('keeps a paragraph break, which a chat message does not', () => {
    const { body } = normalisePost('First thought.\n\nSecond thought.')
    expect(body).toBe('First thought.\n\nSecond thought.')
  })

  it('caps a wall of blank lines at a paragraph break', () => {
    const { body } = normalisePost('Top.\n\n\n\n\n\nBottom.')
    expect(body).toBe('Top.\n\nBottom.')
  })

  it('strips zero-width padding used to fake a distinct handle', () => {
    const { body } = normalisePost('pu​lsex')
    expect(body).toBe('pulsex')
  })

  it('strips bidirectional overrides', () => {
    const { body } = normalisePost('send to 0xabc‮dcba')
    expect(body).toBe('send to 0xabcdcba')
  })

  it('converts Windows and old-Mac line endings without losing the break', () => {
    expect(normalisePost('a\r\nb').body).toBe('a\nb')
    expect(normalisePost('a\rb').body).toBe('a\nb')
  })

  it('accepts a post at exactly the limit', () => {
    const body = 'x'.repeat(MAX_POST_LENGTH)
    expect(normalisePost(body)).toEqual({ ok: true, body })
  })

  it('refuses one character past the limit', () => {
    expect(normalisePost('x'.repeat(MAX_POST_LENGTH + 1))).toEqual({
      ok: false,
      reason: REJECTED_POST.tooLong,
    })
  })

  it('counts emoji as one character, not two', () => {
    // An emoji outside the BMP is two UTF-16 units. Measured that way, a post
    // of MAX_POST_LENGTH of them would read as double the limit and be
    // refused - and truncating it would split a surrogate pair.
    const body = '🚀'.repeat(MAX_POST_LENGTH)
    expect(normalisePost(body)).toEqual({ ok: true, body })
  })
})

describe('postLength', () => {
  it('agrees with what normalisePost measures', () => {
    const raw = '  Trimmed.  \n\n\n\nAnd capped.  '
    expect(postLength(raw)).toBe([...normalisePost(raw).body].length)
  })

  it('is zero for a non-string', () => {
    expect(postLength(null)).toBe(0)
  })

  it('counts an emoji once', () => {
    expect(postLength('🚀🚀')).toBe(2)
  })
})
