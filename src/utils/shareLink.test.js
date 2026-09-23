import { describe, it, expect, vi, afterEach } from 'vitest'
import { shareLink, copyText } from './shareLink'

/*
 * The link a share control hands over.
 *
 * What matters is that it is absolute and that it points where the reader
 * currently is. A relative path pasted into a chat app is not a link, and an
 * origin taken from configuration would have every preview deployment quietly
 * handing out links to production.
 */

const ORIGIN = 'https://pulsedex.net'

describe('shareLink', () => {
  it('builds an absolute link to a room', () => {
    expect(shareLink({ tab: 'rooms', room: 'lounge' }, ORIGIN)).toBe(`${ORIGIN}/r/lounge`)
  })

  it('and to one message in it', () => {
    expect(shareLink({ tab: 'rooms', room: 'lounge', message: 12 }, ORIGIN)).toBe(
      `${ORIGIN}/r/lounge#m12`,
    )
  })

  it('and to a post', () => {
    expect(shareLink({ tab: 'post', post: 99 }, ORIGIN)).toBe(`${ORIGIN}/p/99`)
  })

  it('uses whatever origin it is running on', () => {
    // A preview deployment hands out preview links. A constant here would
    // have every branch advertising the live site.
    expect(shareLink({ tab: 'feed' }, 'https://preview.example.com')).toBe(
      'https://preview.example.com/feed',
    )
  })

  it('never produces a double slash', () => {
    // Some chat apps refuse to linkify one.
    expect(shareLink({ tab: 'feed' }, 'https://pulsedex.net/')).toBe(`${ORIGIN}/feed`)
    expect(shareLink({ tab: 'feed' }, 'https://pulsedex.net///')).toBe(`${ORIGIN}/feed`)
  })

  it('falls back to the feed for a surface that is not one', () => {
    // socialPath's rule, kept rather than special-cased here: a share control
    // should hand over a link that works, not one that 404s.
    expect(shareLink({ tab: 'nonsense' }, ORIGIN)).toBe(`${ORIGIN}/feed`)
    expect(shareLink({}, ORIGIN)).toBe(`${ORIGIN}/feed`)
  })

  it('is null when there is no origin to build on', () => {
    // Not an error: it is what a server render looks like, and the caller
    // draws nothing rather than a broken link.
    expect(shareLink({ tab: 'feed' }, '')).toBeNull()
  })
})

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the clipboard when there is one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    expect(await copyText('https://pulsedex.net/r/lounge')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://pulsedex.net/r/lounge')
  })

  it('falls back when the clipboard refuses', async () => {
    // Insecure context, or permission denied. The people this happens to are
    // the least able to work around a share button that does nothing.
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const execCommand = vi.fn().mockReturnValue(true)
    vi.stubGlobal('document', {
      createElement: () => ({ setAttribute() {}, select() {}, style: {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand,
    })

    expect(await copyText('x')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back when there is no clipboard at all', async () => {
    vi.stubGlobal('navigator', {})
    const execCommand = vi.fn().mockReturnValue(true)
    vi.stubGlobal('document', {
      createElement: () => ({ setAttribute() {}, select() {}, style: {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand,
    })

    expect(await copyText('x')).toBe(true)
  })

  it('says so when both ways fail, rather than throwing', async () => {
    // The caller leaves the link on screen to be selected by hand. An
    // exception here would take the page down instead.
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no dom')
      },
    })

    expect(await copyText('x')).toBe(false)
  })

  it('refuses nothing', async () => {
    for (const value of ['', null, undefined, 42]) {
      expect(await copyText(value)).toBe(false)
    }
  })
})
