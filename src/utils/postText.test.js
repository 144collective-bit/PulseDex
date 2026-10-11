import { describe, expect, it } from 'vitest'
import { linkLabel, postSegments } from './postText'

const ADDRESS = '0x1111111111111111111111111111111111111111'
const types = (segments) => segments.map((s) => s.type)
const values = (segments) => segments.map((s) => s.value)

describe('postSegments', () => {
  it('is empty for anything that is not text', () => {
    for (const value of [null, undefined, '', 42, {}]) {
      expect(postSegments(value)).toEqual([])
    }
  })

  it('is one run of text for a post with nothing in it', () => {
    expect(postSegments('just words')).toEqual([{ type: 'text', value: 'just words' }])
  })

  it('carves out a link', () => {
    const segments = postSegments('look at https://example.com/x now')
    expect(types(segments)).toEqual(['text', 'link', 'text'])
    expect(values(segments)).toEqual(['look at ', 'https://example.com/x', ' now'])
  })

  it('handles a link at the very start and the very end', () => {
    expect(types(postSegments('https://a.com then'))).toEqual(['link', 'text'])
    expect(types(postSegments('then https://a.com'))).toEqual(['text', 'link'])
    expect(types(postSegments('https://a.com'))).toEqual(['link'])
  })

  it('carves out several links', () => {
    const segments = postSegments('https://a.com and https://b.com')
    expect(types(segments)).toEqual(['link', 'text', 'link'])
    expect(values(segments)).toEqual(['https://a.com', ' and ', 'https://b.com'])
  })

  it('puts the pieces back together into the original string', () => {
    const body = 'see https://a.com/x and also https://b.com, thanks'
    expect(values(postSegments(body)).join('')).toBe(body)
  })

  /*
   * A link that is a prefix of another in the same post. Matching the shorter
   * one first would leave "/path" stranded as text beside a link to the wrong
   * page - the same problem splitMentions solves by taking the longest first.
   */
  it('prefers the longer of two links sharing a prefix', () => {
    const body = 'https://a.com/path and https://a.com'
    const segments = postSegments(body)
    expect(values(segments)).toEqual(['https://a.com/path', ' and ', 'https://a.com'])
    expect(values(segments).join('')).toBe(body)
  })

  it('draws a repeated link every time it appears', () => {
    const segments = postSegments('https://a.com then https://a.com')
    expect(types(segments)).toEqual(['link', 'text', 'link'])
  })

  it('leaves mentions alone and finds links beside them', () => {
    const mentions = [{ handle: 'degen', address: ADDRESS }]
    const segments = postSegments('hey @degen see https://a.com', mentions)
    expect(types(segments)).toEqual(['text', 'mention', 'text', 'link'])
    expect(segments[1].address).toBe(ADDRESS)
  })

  it('still splits mentions when there is no link at all', () => {
    const mentions = [{ handle: 'degen', address: ADDRESS }]
    expect(types(postSegments('hey @degen', mentions))).toEqual(['text', 'mention'])
  })

  /*
   * A handle is `@something` and a link starts `https://`, so these cannot
   * really collide - but the rule has to be one way round rather than
   * depending on which pass ran first, and a mention is a row the database
   * holds while a link is found by pattern.
   */
  it('does not look for links inside a mention', () => {
    const mentions = [{ handle: 'https://a.com', address: ADDRESS }]
    const segments = postSegments('hi @https://a.com', mentions)
    expect(types(segments)).toEqual(['text', 'mention'])
  })

  it('leaves sentence punctuation out of the link, as the body did', () => {
    const segments = postSegments('see https://a.com.')
    expect(values(segments)).toEqual(['see ', 'https://a.com', '.'])
  })

  it('ignores http, which this app will not render as a link', () => {
    expect(types(postSegments('see http://a.com'))).toEqual(['text'])
  })

  it('survives a post that is mostly URLs without running away', () => {
    const body = Array.from({ length: 40 }, (_, i) => `https://e${i}.com`).join(' ')
    const segments = postSegments(body)
    // linksIn caps at ten, so the rest stay as text - which is the right
    // failure: a wall of URLs is drawn, just not all of it as links.
    expect(segments.filter((s) => s.type === 'link')).toHaveLength(10)
    expect(values(segments).join('')).toBe(body)
  })
})

describe('linkLabel', () => {
  it('shows the host alone for a bare link', () => {
    expect(linkLabel('https://example.com')).toBe('example.com')
    expect(linkLabel('https://example.com/')).toBe('example.com')
  })

  it('drops a www, which is noise', () => {
    expect(linkLabel('https://www.example.com/x')).toBe('example.com/x')
  })

  it('keeps a short path and the query', () => {
    expect(linkLabel('https://example.com/a?b=1')).toBe('example.com/a?b=1')
  })

  /*
   * A long path truncated is the point: a URL can be made to read as pointing
   * somewhere it does not by burying the real host behind a path that looks
   * like one. The host leads, and the rest is cut.
   */
  it('truncates a long path so it cannot impersonate a host', () => {
    const label = linkLabel('https://evil.com/https://bank.example.com/login/please')
    expect(label.startsWith('evil.com')).toBe(true)
    expect(label.endsWith('…')).toBe(true)
    expect(label).not.toContain('bank.example.com/login')
  })

  it('returns the raw string for anything it cannot parse', () => {
    expect(linkLabel('not a url')).toBe('not a url')
    expect(linkLabel('')).toBe('')
  })

  it('is empty for anything that is not a string', () => {
    expect(linkLabel(null)).toBe('')
    expect(linkLabel(42)).toBe('')
  })
})
