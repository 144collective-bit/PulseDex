/**
 * The moderator's side: hiding a post, putting it back, and reading what has
 * been done.
 *
 * All three through our own endpoints. The audit trail has no read policy -
 * 0021 says why: the rows name wallet addresses with a moderator's note
 * attached, so a public version of it would be a public list of accusations -
 * and the hide is a write, which never happens from the browser here anyway.
 *
 * Every function in this file answers 404 to somebody who is not a moderator,
 * because that is what the endpoints do. The interface never renders a control
 * that would call one without checking first, but the endpoint is the thing
 * that decides, and these functions pass its answer through rather than
 * interpreting it.
 */

/**
 * Take a post out of the feed, or put it back.
 *
 * **Hiding is not removing**, and whoever adds a button for this should know
 * which one they are adding. A hidden post is still in the database and still
 * readable by anybody querying it directly with the anon key; what the hide
 * does is keep it out of the feed and off profiles, and tell its author that
 * it is pending review. 0021 and api/_routes/moderation/hide.js both say this
 * at greater length.
 *
 * For something that must be unreadable, remove it - `removePost` in
 * src/services/posts.js, which the row level security policy does enforce.
 */
export async function setPostHidden({ id, on, note = null }) {
  const res = on
    ? await fetch('/api/moderation/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, note }),
      })
    : await fetch(`/api/moderation/hide?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That could not be saved.')
  }

  return on
}

/**
 * What moderators have done, newest first.
 *
 * Filtered to one account or one post when asked, which is how somebody
 * actually arrives at this: "what has been done to this account" and "why is
 * this post hidden" are the two questions, and an unfiltered list answers the
 * third one.
 *
 * Rows come back in the database's own column names, not camel-cased.
 * src/utils/moderationLog.js reads them in that shape and is tested against
 * what 0021 defines, so a column added to the log needs no translation layer
 * updated to match.
 *
 * @param {{ address?: string|null, post?: number|null, limit?: number }} [options]
 */
export async function fetchModerationLog({ address = null, post = null, limit = 50 } = {}) {
  const params = new URLSearchParams()
  if (address) params.set('address', address)
  if (post) params.set('post', String(post))
  if (limit) params.set('limit', String(limit))

  const res = await fetch(`/api/moderation/log?${params}`, { credentials: 'same-origin' })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'The audit trail could not be loaded.')
  }

  /*
   * The parse can throw where the status check cannot see it: a deployment
   * with no API answers 200 with a page in it, and a raw "Unexpected token
   * '<'" in the panel tells a moderator nothing. Same lesson as fetchMutes.
   */
  const payload = await res.json().catch(() => {
    throw new Error('The audit trail could not be loaded.')
  })

  return Array.isArray(payload.entries) ? payload.entries : []
}

/**
 * The report queue.
 *
 * Here rather than beside the report-filing call in src/services/posts.js,
 * because this is the moderator's read and that is the reader's write. They
 * share an endpoint and nothing else: one of them is available to everybody
 * signed in and the other answers 404 to all but a handful of addresses.
 */
export async function fetchReportQueue() {
  const res = await fetch('/api/posts/report', { credentials: 'same-origin' })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'The report queue could not be loaded.')
  }

  const payload = await res.json().catch(() => {
    throw new Error('The report queue could not be loaded.')
  })

  return Array.isArray(payload.reports) ? payload.reports : []
}

/**
 * This account's own posting allowance.
 *
 * In this file although it is not a moderator's read, and the reason is that it
 * is the same subject from the other side: a rate limit is moderation applied
 * to everybody in advance, and keeping it beside the hide and the audit trail
 * means the three things that constrain what an account can do are in one
 * place rather than scattered by who calls them.
 *
 * Returns null rather than throwing on any failure, including not being signed
 * in. What this feeds is a line in the composer saying how much room is left,
 * and a composer that refuses to open because that line could not be fetched
 * would be a worse outcome than the line being missing.
 */
export async function fetchMyLimits() {
  try {
    const res = await fetch('/api/me/limits', { credentials: 'same-origin' })
    if (!res.ok) return null

    const payload = await res.json()
    return {
      posts: Array.isArray(payload.posts) ? payload.posts : [],
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      limits: payload.limits || null,
    }
  } catch {
    return null
  }
}
