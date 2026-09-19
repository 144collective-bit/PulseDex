import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveMyProfile } from './profile'

/**
 * What the save request is allowed to say about links.
 *
 * The write endpoint distinguishes a field the request names from one it does
 * not: naming it writes it, leaving it out leaves the column alone. That is
 * what lets the settings form save a display name without having to know
 * anything about links - and it is load-bearing, because the form does not
 * always know. When the read that populates it fails, the form holds an empty
 * set of links that is not the truth, and sending it deletes every link the
 * account had.
 *
 * So these tests are about the wire, not the UI: an absent `links` must not
 * become `links: []`.
 */
describe('saveMyProfile', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body)

  it('leaves links out of the request when it was not given any', async () => {
    await saveMyProfile({ handle: 'degen', avatarId: null, bio: 'gm' })
    expect('links' in sentBody()).toBe(false)
  })

  it('sends an empty array when clearing links is what was actually meant', async () => {
    await saveMyProfile({ handle: 'degen', avatarId: null, bio: 'gm', links: [] })
    expect(sentBody().links).toEqual([])
  })

  it('sends the links it was given', async () => {
    await saveMyProfile({ handle: 'degen', avatarId: null, bio: '', links: ['https://example.com'] })
    expect(sentBody().links).toEqual(['https://example.com'])
  })

  it('passes the endpoint\'s own sentence through on failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'That name is taken.' }) })
    await expect(saveMyProfile({ handle: 'taken' })).rejects.toThrow('That name is taken.')
  })
})
