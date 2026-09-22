import { describe, it, expect } from 'vitest'
import { typingLine, countAfter } from './chatPresence'

describe('typingLine', () => {
  it('names one and two people, and counts the rest', () => {
    expect(typingLine(['degen'])).toBe('degen is typing')
    expect(typingLine(['degen', 'ape'])).toBe('degen and ape are typing')
    expect(typingLine(['degen', 'ape', 'trader'])).toBe('3 people are typing')
    expect(typingLine(['a', 'b', 'c', 'd', 'e'])).toBe('5 people are typing')
  })

  it('says nothing when nobody is', () => {
    expect(typingLine([])).toBe('')
    expect(typingLine(null)).toBe('')
    expect(typingLine(undefined)).toBe('')
  })

  it('ignores an unnamed typer rather than announcing a blank', () => {
    // Somebody signed in without a handle broadcasts no name. "  is typing"
    // is worse than not mentioning them.
    expect(typingLine([null, 'degen', '', '   '])).toBe('degen is typing')
    expect(typingLine([null, undefined, ''])).toBe('')
  })

  it('stays short however many people are typing', () => {
    const many = Array.from({ length: 40 }, (_, i) => `person${i}`)
    expect(typingLine(many)).toBe('40 people are typing')
    expect(typingLine(many).length).toBeLessThan(30)
  })
})

describe('countAfter', () => {
  const messages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]

  it('counts what arrived after the mark', () => {
    expect(countAfter(messages, 3)).toBe(2)
    expect(countAfter(messages, 5)).toBe(0)
    expect(countAfter(messages, 0)).toBe(5)
  })

  it('counts nothing while the reader is at the live end', () => {
    expect(countAfter(messages, null)).toBe(0)
    expect(countAfter(messages, undefined)).toBe(0)
  })

  it('does not report a backfill as new arrivals', () => {
    // The bug this exists to prevent: loading older messages grows the list
    // upward, and a length comparison would call fifty old messages fifty
    // new ones and offer to scroll the reader to a bottom that has not moved.
    const marked = 5
    const withOlder = [{ id: -3 }, { id: -2 }, { id: -1 }, ...messages]
    expect(countAfter(withOlder, marked)).toBe(0)
  })

  it('answers for an empty or missing list', () => {
    expect(countAfter([], 3)).toBe(0)
    expect(countAfter(null, 3)).toBe(0)
  })
})
