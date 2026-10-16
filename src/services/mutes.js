/**
 * Who this reader has chosen not to see.
 *
 * Every call goes through our own endpoint, with no Supabase read anywhere in
 * the file, and that is not the usual split in this directory. Everywhere else
 * reads come straight from the database over the anon key because row level
 * security says the rows are public. These are not public:
 *
 *   "Who I cannot stand" is a list about the reader rather than about the
 *   people on it, and on a site where accounts are wallet addresses,
 *   publishing it would publish a graph of who refuses to read whom. 0021
 *   gives `muted` no policy at all, so the anon key cannot see it even if
 *   somebody asks.
 *
 * A mute is also quiet by design. Nothing in any response tells a muted
 * account they were muted, which is most of what it has over a block: a mute
 * somebody can detect is a mute that invites a second account.
 */

/**
 * This reader's mute list.
 *
 * Two shapes of the same thing, because two places need it differently: the
 * feed wants a Set of addresses it can test every post against, and the
 * settings list wants rows with handles and pictures so somebody can recognise
 * who they muted six weeks ago.
 *
 * A failure reads as an empty list rather than throwing. The direction matters
 * and is worth being explicit about: it fails toward showing posts a reader
 * asked not to see, which is the wrong direction - but the alternative is a
 * feed that will not load at all because a private endpoint was briefly
 * unavailable, and a reader who cannot see the feed cannot mute anybody
 * either. The failure is logged where it can be seen.
 *
 * @returns {Promise<{ addresses: Set<string>, muted: object[] }>}
 */
export async function fetchMutes() {
  try {
    const res = await fetch('/api/mutes', { credentials: 'same-origin' })

    // 401 is "not signed in", which is not a failure - a reader who has not
    // signed in has no mute list, and saying so here keeps it off the console.
    if (res.status === 401) return { addresses: new Set(), muted: [] }

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const payload = await res.json()
    return {
      addresses: new Set((payload.addresses || []).map((a) => String(a).toLowerCase())),
      muted: Array.isArray(payload.muted) ? payload.muted : [],
    }
  } catch (err) {
    console.error('mutes: could not be loaded:', err.message)
    return { addresses: new Set(), muted: [] }
  }
}

/**
 * Mute somebody, or stop.
 *
 * Throws on failure, unlike the read above, and the asymmetry is deliberate: a
 * read that fails can degrade to showing more than somebody wanted, but a
 * write that fails silently would leave a control looking as though it had
 * worked. Somebody who presses mute and sees the account again needs to know
 * it did not take.
 *
 * Both directions are idempotent, so a double press is one row or none.
 */
export async function setMuted({ address, on }) {
  const res = on
    ? await fetch('/api/mutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ address }),
      })
    : await fetch(`/api/mutes?address=${encodeURIComponent(address)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That could not be saved.')
  }
}
