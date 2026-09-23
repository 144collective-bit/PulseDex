import { describe, it, expect } from 'vitest'
import { searchTerm, splitHighlight } from './chatSearch'

describe('searchTerm', () => {
  it('trims', () => {
    expect(searchTerm('  hex  ')).toBe('hex')
  })

  it('drops asterisks, which PostgREST would have turned into wildcards', () => {
    expect(searchTerm('h*x')).toBe('hx')
  })

  it('is empty for anything that is not a string', () => {
    expect(searchTerm(null)).toBe('')
    expect(searchTerm(42)).toBe('')
    expect(searchTerm(undefined)).toBe('')
  })
})

describe('splitHighlight', () => {
  const joined = (segments) => segments.map((s) => s.text).join('')

  it('marks the match and keeps the rest', () => {
    expect(splitHighlight('buy the dip', 'the')).toEqual([
      { text: 'buy ', match: false },
      { text: 'the', match: true },
      { text: ' dip', match: false },
    ])
  })

  it('marks every occurrence', () => {
    const out = splitHighlight('pls pls pls', 'pls')
    expect(out.filter((s) => s.match)).toHaveLength(3)
    expect(joined(out)).toBe('pls pls pls')
  })

  it('matches without regard to case, and keeps the original casing', () => {
    expect(splitHighlight('HEX is fine', 'hex')).toEqual([
      { text: 'HEX', match: true },
      { text: ' is fine', match: false },
    ])
  })

  it('treats the term as literal text, not as a pattern', () => {
    // Unescaped, `a.c` would match `abc` and `(x)` would throw.
    expect(splitHighlight('abc and a.c', 'a.c')).toEqual([
      { text: 'abc and ', match: false },
      { text: 'a.c', match: true },
    ])
    expect(() => splitHighlight('nothing here', '(x')).not.toThrow()
  })

  it('never loses or invents text, whatever the term', () => {
    const body = 'a% of _ and \\ and (paren) and [bracket]'
    for (const term of ['%', '_', '\\', '(paren)', '[bracket]', 'and']) {
      expect(joined(splitHighlight(body, term))).toBe(body)
    }
  })

  it('marks a match at either end without emitting empty segments', () => {
    expect(splitHighlight('hex', 'hex')).toEqual([{ text: 'hex', match: true }])
    expect(splitHighlight('hexes', 'hex')).toEqual([
      { text: 'hex', match: true },
      { text: 'es', match: false },
    ])
  })

  it('returns the whole body unmarked when there is no term', () => {
    expect(splitHighlight('anything', '')).toEqual([{ text: 'anything', match: false }])
    expect(splitHighlight('anything', '   ')).toEqual([{ text: 'anything', match: false }])
  })

  it('returns nothing for an empty body', () => {
    expect(splitHighlight('', 'hex')).toEqual([])
    expect(splitHighlight(null, 'hex')).toEqual([])
  })
})
