import { describe, expect, it } from 'vitest'
import {
  MAX_PREVIEW_URL,
  PREVIEW_REFUSED,
  checkPreviewTarget,
  firstLinkIn,
  isBlockedAddress,
  linksIn,
  readPreviewMeta,
} from './linkSafety'

describe('firstLinkIn', () => {
  it('finds a link in prose', () => {
    expect(firstLinkIn('look at https://example.com/x for this')).toBe('https://example.com/x')
  })

  it('takes the first of several', () => {
    expect(firstLinkIn('https://a.com and https://b.com')).toBe('https://a.com')
  })

  // "see https://example.com." should not try to fetch a path ending in a
  // full stop, which is a 404 and a wasted outbound request.
  it('leaves sentence punctuation out of the URL', () => {
    expect(firstLinkIn('see https://example.com.')).toBe('https://example.com')
    expect(firstLinkIn('see https://example.com/a, then')).toBe('https://example.com/a')
    expect(firstLinkIn('really? https://example.com?!')).toBe('https://example.com')
  })

  it('does not swallow a closing bracket', () => {
    expect(firstLinkIn('(see https://example.com/a)')).toBe('https://example.com/a')
  })

  // http is not previewed at all: our server would be making a plaintext
  // request on a reader's behalf and presenting the result as fact.
  it('ignores anything that is not https', () => {
    expect(firstLinkIn('http://example.com')).toBeNull()
    expect(firstLinkIn('ftp://example.com')).toBeNull()
    expect(firstLinkIn('example.com')).toBeNull()
  })

  it('is null for a bare scheme with nothing after it', () => {
    expect(firstLinkIn('https://')).toBeNull()
  })

  it('is null for anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, []]) expect(firstLinkIn(value)).toBeNull()
  })
})

describe('linksIn', () => {
  it('returns every link in order', () => {
    expect(linksIn('https://a.com then https://b.com')).toEqual(['https://a.com', 'https://b.com'])
  })

  it('deduplicates', () => {
    expect(linksIn('https://a.com and https://a.com again')).toEqual(['https://a.com'])
  })

  it('caps the list, so a wall of URLs is not handed to the renderer', () => {
    const body = Array.from({ length: 50 }, (_, i) => `https://e${i}.com`).join(' ')
    expect(linksIn(body)).toHaveLength(10)
    expect(linksIn(body, 3)).toHaveLength(3)
  })

  it('is empty for anything else', () => {
    expect(linksIn('nothing here')).toEqual([])
    expect(linksIn(null)).toEqual([])
  })
})

describe('isBlockedAddress', () => {
  it('allows an ordinary public address', () => {
    expect(isBlockedAddress('93.184.216.34')).toBe(false)
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('1.1.1.1')).toBe(false)
  })

  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true)
    expect(isBlockedAddress('127.255.255.254')).toBe(true)
  })

  /*
   * The one that matters most. 169.254.169.254 is the cloud metadata endpoint
   * on every major provider, and reaching it from inside a function is how
   * credentials leave a deployment.
   */
  it('blocks the cloud metadata address', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true)
    expect(isBlockedAddress('169.254.0.1')).toBe(true)
  })

  it('blocks the private ranges', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true)
    expect(isBlockedAddress('172.16.0.1')).toBe(true)
    expect(isBlockedAddress('172.31.255.255')).toBe(true)
    expect(isBlockedAddress('192.168.1.1')).toBe(true)
  })

  it('allows the addresses just outside the private ranges', () => {
    expect(isBlockedAddress('172.15.255.255')).toBe(false)
    expect(isBlockedAddress('172.32.0.0')).toBe(false)
    expect(isBlockedAddress('11.0.0.1')).toBe(false)
    expect(isBlockedAddress('9.255.255.255')).toBe(false)
  })

  it('blocks carrier NAT, benchmarking, documentation, multicast and reserved', () => {
    expect(isBlockedAddress('100.64.0.1')).toBe(true)
    expect(isBlockedAddress('198.18.0.1')).toBe(true)
    expect(isBlockedAddress('192.0.2.1')).toBe(true)
    expect(isBlockedAddress('198.51.100.1')).toBe(true)
    expect(isBlockedAddress('203.0.113.1')).toBe(true)
    expect(isBlockedAddress('224.0.0.1')).toBe(true)
    expect(isBlockedAddress('240.0.0.1')).toBe(true)
    expect(isBlockedAddress('0.0.0.0')).toBe(true)
  })

  /*
   * The alternative spellings. `0177.0.0.1` and `2130706433` are both
   * 127.0.0.1 to a resolver, and a blocklist matching on dotted-quad text is
   * exactly what they walk past. Refusing the parse means they are treated as
   * hostnames instead - which the caller resolves and checks properly.
   */
  it('refuses to read an address written to dodge a text check', () => {
    expect(isBlockedAddress('0177.0.0.1')).toBe(true)
    expect(isBlockedAddress('2130706433')).toBe(true)
    expect(isBlockedAddress('127.1')).toBe(true)
    expect(isBlockedAddress('0x7f.0.0.1')).toBe(true)
    expect(isBlockedAddress('010.0.0.1')).toBe(true)
  })

  it('blocks an octet out of range rather than wrapping it', () => {
    expect(isBlockedAddress('999.0.0.1')).toBe(true)
  })

  it('blocks IPv6 loopback, unspecified, unique-local and link-local', () => {
    expect(isBlockedAddress('::1')).toBe(true)
    expect(isBlockedAddress('::')).toBe(true)
    expect(isBlockedAddress('fc00::1')).toBe(true)
    expect(isBlockedAddress('fd12:3456::1')).toBe(true)
    expect(isBlockedAddress('fe80::1')).toBe(true)
    expect(isBlockedAddress('ff02::1')).toBe(true)
    expect(isBlockedAddress('2001:db8::1')).toBe(true)
    expect(isBlockedAddress('64:ff9b::1.2.3.4')).toBe(true)
  })

  it('allows a public IPv6 address', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
    expect(isBlockedAddress('2a00:1450:4001:800::200e')).toBe(false)
  })

  it('reads a bracketed address', () => {
    expect(isBlockedAddress('[::1]')).toBe(true)
    expect(isBlockedAddress('[2606:4700::1111]')).toBe(false)
  })

  /*
   * An IPv4 address wearing an IPv6 hat. A check that only understood dotted
   * quads would wave ::ffff:169.254.169.254 straight through to the metadata
   * endpoint.
   */
  it('unwraps an IPv4-mapped IPv6 address and judges the IPv4', () => {
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true)
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true)
    expect(isBlockedAddress('::ffff:93.184.216.34')).toBe(false)
  })

  // The important default: a spelling this function does not understand is
  // not a spelling to trust.
  it('blocks anything it cannot parse', () => {
    for (const value of [null, undefined, '', '   ', 'not-an-address', 42, {}, 'fe80::g']) {
      expect(isBlockedAddress(value)).toBe(true)
    }
  })
})

describe('checkPreviewTarget', () => {
  const ok = (url) => {
    const result = checkPreviewTarget(url)
    expect(result.ok, `expected ${url} to be allowed, got ${result.reason}`).toBe(true)
    return result
  }
  const refused = (url, reason) => {
    const result = checkPreviewTarget(url)
    expect(result.ok, `expected ${url} to be refused`).toBe(false)
    if (reason) expect(result.reason).toBe(reason)
  }

  it('allows an ordinary page', () => {
    expect(ok('https://example.com/article?id=3').url).toBe('https://example.com/article?id=3')
  })

  it('keeps the query, which selects the page being linked to', () => {
    expect(ok('https://example.com/?p=12').url).toContain('p=12')
  })

  /*
   * The fragment never reaches a server, so two URLs differing only there are
   * one fetch - and because the normalised URL is also the cache key, dropping
   * it here is what makes that true by construction.
   */
  it('drops the fragment, so one page is one cache row', () => {
    const a = ok('https://example.com/a#top').url
    const b = ok('https://example.com/a#bottom').url
    expect(a).toBe(b)
    expect(a).not.toContain('#')
  })

  it('refuses anything that is not https', () => {
    refused('http://example.com', PREVIEW_REFUSED.notHttps)
    refused('ftp://example.com', PREVIEW_REFUSED.notHttps)
    refused('file:///etc/passwd', PREVIEW_REFUSED.notHttps)
    refused('gopher://example.com', PREVIEW_REFUSED.notHttps)
    refused('javascript:alert(1)', PREVIEW_REFUSED.notHttps)
    refused('data:text/html,hi', PREVIEW_REFUSED.notHttps)
  })

  it('refuses a URL carrying credentials', () => {
    refused('https://user:pass@example.com', PREVIEW_REFUSED.hasCredentials)
    refused('https://user@example.com', PREVIEW_REFUSED.hasCredentials)
  })

  /*
   * A non-default port is reaching for a service rather than a web page.
   * Allowing arbitrary ports turns one publicly-resolving host into a port
   * scanner run from our infrastructure.
   */
  it('refuses a non-default port', () => {
    refused('https://example.com:9200/_cluster/health', PREVIEW_REFUSED.nonDefaultPort)
    refused('https://example.com:6379', PREVIEW_REFUSED.nonDefaultPort)
    ok('https://example.com:443/fine')
  })

  it('refuses hosts that name something inside a network', () => {
    refused('https://localhost/x', PREVIEW_REFUSED.blockedHost)
    refused('https://foo.localhost/x', PREVIEW_REFUSED.blockedHost)
    refused('https://printer.local/x', PREVIEW_REFUSED.blockedHost)
    refused('https://db.internal/x', PREVIEW_REFUSED.blockedHost)
    refused('https://metadata.google.internal/x', PREVIEW_REFUSED.blockedHost)
    refused('https://box.lan/x', PREVIEW_REFUSED.blockedHost)
  })

  // A suffix check has to match whole labels or it blocks real sites.
  it('does not refuse a public host that merely ends in those letters', () => {
    ok('https://notlocalhost.com/x')
    ok('https://mylocal.com/x')
    ok('https://internal-affairs.org/x')
  })

  it('refuses a single-label host, which only resolves on a private network', () => {
    refused('https://intranet/x', PREVIEW_REFUSED.blockedHost)
  })

  it('refuses a literal address in a blocked range', () => {
    refused('https://127.0.0.1/x', PREVIEW_REFUSED.blockedAddress)
    refused('https://169.254.169.254/latest/meta-data/', PREVIEW_REFUSED.blockedAddress)
    refused('https://10.0.0.1/x', PREVIEW_REFUSED.blockedAddress)
    refused('https://[::1]/x', PREVIEW_REFUSED.blockedAddress)
    refused('https://[::ffff:169.254.169.254]/x', PREVIEW_REFUSED.blockedAddress)
  })

  it('allows a literal public address', () => {
    ok('https://93.184.216.34/x')
  })

  it('refuses a URL too long to cache', () => {
    refused(`https://example.com/${'a'.repeat(MAX_PREVIEW_URL)}`, PREVIEW_REFUSED.tooLong)
  })

  it('tolerates a trailing dot on the hostname', () => {
    expect(ok('https://example.com./x').host).toBe('example.com')
  })

  it('refuses everything that is not a URL', () => {
    for (const value of [null, undefined, '', '   ', 42, {}, 'not a url', 'https://']) {
      refused(value)
    }
  })
})

describe('readPreviewMeta', () => {
  it('reads Open Graph tags', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="A Title">
        <meta property="og:description" content="What it is about">
        <meta property="og:site_name" content="Example">
      </head></html>`
    expect(readPreviewMeta(html)).toEqual({
      title: 'A Title',
      description: 'What it is about',
      siteName: 'Example',
    })
  })

  it('reads the attributes in either order', () => {
    const html = '<meta content="Reversed" property="og:title">'
    expect(readPreviewMeta(html).title).toBe('Reversed')
  })

  it('accepts single quotes and name= as well as property=', () => {
    expect(readPreviewMeta("<meta property='og:title' content='Single'>").title).toBe('Single')
    expect(readPreviewMeta('<meta name="og:title" content="Named">').title).toBe('Named')
  })

  it('falls back to the document title', () => {
    expect(readPreviewMeta('<html><head><title>Just a title</title></head>').title).toBe(
      'Just a title',
    )
  })

  it('prefers Open Graph over the document title', () => {
    const html = '<title>Document</title><meta property="og:title" content="Open Graph">'
    expect(readPreviewMeta(html).title).toBe('Open Graph')
  })

  it('falls back to the plain description meta', () => {
    expect(readPreviewMeta('<meta name="description" content="Plain">').description).toBe('Plain')
  })

  it('collapses the whitespace a title spread over three lines arrives with', () => {
    expect(readPreviewMeta('<title>\n  One   Two\n</title>').title).toBe('One Two')
  })

  it('decodes the entities that show up in titles', () => {
    expect(readPreviewMeta('<title>Bread &amp; Butter</title>').title).toBe('Bread & Butter')
    expect(readPreviewMeta('<title>&lt;script&gt;</title>').title).toBe('<script>')
    expect(readPreviewMeta('<title>It&#39;s fine</title>').title).toBe("It's fine")
  })

  /*
   * A decoded title can contain angle brackets, and that is fine and must stay
   * fine: this value is rendered as text by React, never as markup. The test
   * pins the decoding rather than any escaping, because the escaping is not
   * this function's job and pretending it is would be the bug.
   */
  it('returns markup-looking text as text, without trying to sanitise it', () => {
    expect(readPreviewMeta('<meta property="og:title" content="&lt;img onerror=x&gt;">').title).toBe(
      '<img onerror=x>',
    )
  })

  it('trims to what the column holds rather than letting a write fail', () => {
    const long = 'x'.repeat(5000)
    const result = readPreviewMeta(`<meta property="og:title" content="${long}">`)
    expect(result.title.length).toBe(300)
    expect(result.title.endsWith('…')).toBe(true)
  })

  it('only looks at the head of the document', () => {
    const buried = `${'<!-- padding -->'.repeat(100)}<title>Too far in</title>`
    expect(readPreviewMeta(buried, 200).title).toBeNull()
  })

  it('is all nulls for a page with nothing in it', () => {
    expect(readPreviewMeta('<html><body>hi</body></html>')).toEqual({
      title: null,
      description: null,
      siteName: null,
    })
  })

  it('ignores an empty tag rather than storing a blank title', () => {
    expect(readPreviewMeta('<meta property="og:title" content="   ">').title).toBeNull()
    expect(readPreviewMeta('<title></title>').title).toBeNull()
  })

  it('is all nulls for anything that is not markup', () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(readPreviewMeta(value)).toEqual({ title: null, description: null, siteName: null })
    }
  })
})
