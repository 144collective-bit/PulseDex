import { describe, it, expect } from 'vitest'
import { escapeLikePattern, containsPattern } from './likePattern'

describe('escapeLikePattern', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('satoshi')).toBe('satoshi')
  })

  it('escapes the wildcards', () => {
    // Unescaped, a search for these matches every row in the table.
    expect(escapeLikePattern('%')).toBe('\\%')
    expect(escapeLikePattern('_')).toBe('\\_')
    expect(escapeLikePattern('100%_sure')).toBe('100\\%\\_sure')
  })

  it('escapes the backslash first', () => {
    // If % were escaped before \, the backslash rule would escape the
    // backslash this one just added and the wildcard would come back.
    expect(escapeLikePattern('\\')).toBe('\\\\')
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%')
  })

  it('is empty for anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(escapeLikePattern(value)).toBe('')
    }
  })
})

describe('containsPattern', () => {
  it('wraps a term in wildcards', () => {
    expect(containsPattern('sat')).toBe('%sat%')
  })

  it('trims first, so a space is not a search', () => {
    expect(containsPattern('  sat  ')).toBe('%sat%')
  })

  it('is null for an empty box, not a match-everything pattern', () => {
    // '%%' would return the entire table, which is the opposite of what an
    // untouched search box should do.
    for (const value of ['', '   ', null, undefined, 7]) {
      expect(containsPattern(value)).toBeNull()
    }
  })

  it('drops asterisks, which PostgREST turns into wildcards before Postgres sees them', () => {
    // Escaping would be escaping the wrong layer: PostgREST rewrites * to %
    // when parsing the query string, so an escaped one still ends up a
    // wildcard and a search for '*' returns the whole table.
    expect(containsPattern('*')).toBeNull()
    expect(containsPattern('sat*shi')).toBe('%satshi%')
    expect(containsPattern('**')).toBeNull()
  })

  it('escapes the term it wraps', () => {
    expect(containsPattern('%')).toBe('%\\%%')
    expect(containsPattern('a_b')).toBe('%a\\_b%')
  })
})
