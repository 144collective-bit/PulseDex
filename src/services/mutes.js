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
 * **Throws on failure, and writes nothing to the console.** Both halves of
 * that are deliberate and the second one was a bug first.
 *
 * It throws rather than returning an empty list because a caller that cannot
 * tell "nobody is muted" from "we could not find out" will quietly show posts
 * somebody asked not to see. `useMutes` decides what to do about it, which is
 * the same split `fetchBookmarks` and `useBookmarks` use.
 *
 * It is silent because a page load has to be console-clean - that is a
 * contract, enforced by scripts/smoke-browser.mjs, which treats any console
 * error during a load as a failed surface. The first version of this logged,
 * and failed three surfaces in CI: a static preview has no API, so
 * `/api/mutes` is answered with index.html, `res.json()` throws on the
 * doctype, and every page holding a feed printed an error. The lesson is
 * general rather than about previews: a 200 from this origin is not a promise
 * of JSON.
 *
 * @returns {Promise<{ addresses: Set<string>, muted: object[] }>}
 * @throws when the list could not be read
 */
export async function fetchMutes() {
  const res = await fetch('/api/mutes', { credentials: 'same-origin' })

  // 401 is "not signed in", which is not a failure - a reader who has not
  // signed in has no mute list, and that is an answer rather than an error.
  if (res.status === 401) return { addresses: new Set(), muted: [] }

  if (!res.ok) throw new Error(`Your muted list could not be loaded (HTTP ${res.status}).`)

  /*
   * The parse is inside the throw path too. A response that is not JSON is
   * exactly what a deployment with no API returns - 200, with a page in it -
   * and `res.json()` rejecting with a parse error is the one failure mode a
   * status check cannot see.
   */
  const payload = await res.json().catch(() => {
    throw new Error('Your muted list could not be loaded.')
  })

  return {
    addresses: new Set((payload.addresses || []).map((a) => String(a).toLowerCase())),
    muted: Array.isArray(payload.muted) ? payload.muted : [],
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
