import { describe, it, expect } from 'vitest'
import {
  normaliseMessage,
  messageLength,
  MAX_MESSAGE_LENGTH,
  REJECTED,
} from './chatMessage'

/*
 * The rule about what may be posted, checked here because it is enforced in
 * two places that cannot share a test.
 *
 * The composer applies it in the browser and the endpoint applies it again on
 * Vercel. Only the second one is a control - the first is a courtesy to
 * whoever is typing - but they have to agree, or the app refuses messages it
 * would have stored and accepts ones it will not.
 *
 * Most of what follows is about characters nobody can see. They are the part
 * of a public chat that gets used against it: a message that renders in an
 * order it is not stored in, or a handle that looks identical to someone
 * else's.
 */

/** Written by code point, because a literal here would be invisible too - and
 *  a test asserting on a character that got silently dropped from the source
 *  passes while testing nothing. */
const ch = (code) => String.fromCharCode(code)
const ZERO_WIDTH_SPACE = ch(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = ch(0x202e)
const BOM = ch(0xfeff)
const NULL_BYTE = ch(0x00)
const VERTICAL_TAB = ch(0x0b)

describe('what gets refused', () => {
  it('refuses anything that is not text', () => {
    // The endpoint reads this straight off a JSON body, so every one of these
    // is a request somebody can actually send.
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(normaliseMessage(value)).toEqual({ ok: false, reason: REJECTED.notText })
    }
  })

  it('refuses a message that is empty once trimmed', () => {
    expect(normaliseMessage('')).toEqual({ ok: false, reason: REJECTED.empty })
    expect(normaliseMessage('   ')).toEqual({ ok: false, reason: REJECTED.empty })
    expect(normaliseMessage('\n\n\n')).toEqual({ ok: false, reason: REJECTED.empty })
  })

  it('refuses a message that is only invisible characters', () => {
    // Otherwise this posts a blank row that cannot be clicked, replied to or
    // explained, as many times as someone cares to send it.
    expect(normaliseMessage(ZERO_WIDTH_SPACE.repeat(20))).toEqual({
      ok: false,
      reason: REJECTED.empty,
    })
  })

  it('refuses a message past the limit', () => {
    expect(normaliseMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({
      ok: false,
      reason: REJECTED.tooLong,
    })
  })

  it('accepts one exactly at the limit', () => {
    const result = normaliseMessage('a'.repeat(MAX_MESSAGE_LENGTH))
    expect(result.ok).toBe(true)
  })
})

describe('what gets cleaned up', () => {
  it('trims the ends but keeps the inside', () => {
    expect(normaliseMessage('  hello  world  ')).toEqual({ ok: true, body: 'hello  world' })
  })

  it('strips control characters', () => {
    // A vertical tab or a null byte in a chat line is never deliberate, and
    // some controls end a line in a log - which is how one message becomes
    // two, the second one appearing to come from somewhere else.
    expect(normaliseMessage(`he${NULL_BYTE}ll${VERTICAL_TAB}o`)).toEqual({
      ok: true,
      body: 'hello',
    })
  })

  it('strips the direction overrides that make text read backwards', () => {
    const spoofed = `send to 0xdead${RIGHT_TO_LEFT_OVERRIDE}beef`
    const result = normaliseMessage(spoofed)
    expect(result.ok).toBe(true)
    expect(result.body).toBe('send to 0xdeadbeef')
    expect(result.body).not.toContain(RIGHT_TO_LEFT_OVERRIDE)
  })

  it('strips zero-width padding and the byte-order mark', () => {
    expect(normaliseMessage(`${BOM}pul${ZERO_WIDTH_SPACE}sechain`)).toEqual({
      ok: true,
      body: 'pulsechain',
    })
  })

  it('keeps newlines, because a paragraph is not an attack', () => {
    expect(normaliseMessage('one\ntwo')).toEqual({ ok: true, body: 'one\ntwo' })
  })

  it('collapses a wall of blank lines down to a paragraph break', () => {
    // Twenty newlines is a way of pushing everyone else's messages off the
    // screen without tripping the length limit.
    expect(normaliseMessage(`top${'\n'.repeat(20)}bottom`)).toEqual({
      ok: true,
      body: 'top\n\nbottom',
    })
  })

  it('normalises pasted line endings before anything else touches them', () => {
    // The ordering this protects: a carriage return is itself stripped as a
    // control character, so converting has to happen first. Do it the other
    // way round and a lone \r - an old Mac line ending, and what some editors
    // still paste - vanishes, joining two lines into one.
    expect(normaliseMessage('one\r\ntwo')).toEqual({ ok: true, body: 'one\ntwo' })
    expect(normaliseMessage('one\rtwo')).toEqual({ ok: true, body: 'one\ntwo' })
  })

  it('drops trailing spaces a paste leaves on each line', () => {
    expect(normaliseMessage('one   \ntwo\t\nthree')).toEqual({
      ok: true,
      body: 'one\ntwo\nthree',
    })
  })
})

describe('counting', () => {
  it('counts an emoji as one character, not two', () => {
    // '(rocket)'.length is 2 in JavaScript. Counting that way would let half
    // as many emoji through as letters, and could cut a surrogate pair in
    // half - storing a lone surrogate, which Postgres rejects outright.
    const rocket = String.fromCodePoint(0x1f680)
    expect(messageLength(rocket)).toBe(1)

    const result = normaliseMessage(rocket.repeat(MAX_MESSAGE_LENGTH))
    expect(result.ok).toBe(true)
  })

  it('agrees with the check it is displayed next to', () => {
    // The counter under the composer and the limit the server applies have to
    // be the same number. This is the property that stops a box reading "480"
    // while the endpoint answers 400.
    const samples = [
      'plain',
      '  padded  ',
      `invisible${ZERO_WIDTH_SPACE}`,
      'one\r\ntwo',
      `wall${'\n'.repeat(9)}of text`,
      String.fromCodePoint(0x1f680).repeat(10),
    ]

    for (const sample of samples) {
      const result = normaliseMessage(sample)
      expect(result.ok).toBe(true)
      expect(messageLength(sample)).toBe([...result.body].length)
    }
  })

  it('counts nothing for input that is not text', () => {
    expect(messageLength(undefined)).toBe(0)
    expect(messageLength(1234)).toBe(0)
  })
})
