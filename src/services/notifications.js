/**
 * The inbox, which is the one thing here that is nobody else's business.
 *
 * Everything else social - posts, follows, reactions - is read straight from
 * the database with the anon key, because it is all public. Notifications are
 * not, and they cannot be protected the same way: sign-in here is a wallet
 * signature and a cookie this app sets rather than Supabase auth, so
 * `auth.uid()` is null in every request and row-level security has no way to
 * say "your own rows". The table has no read policy at all, and these go
 * through the endpoint instead.
 */

/**
 * Read the inbox.
 *
 * `before` is a timestamp rather than an offset: an inbox gains rows at the
 * top while it is being read, and paging by offset would show the same row
 * twice and skip another.
 */
export async function fetchNotifications({ before = null } = {}) {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  const res = await fetch(`/api/notifications${query}`, { credentials: 'same-origin' })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'Your notifications could not be loaded.')
  }

  const data = await res.json()
  return {
    items: (data.notifications || []).map(toNotification),
    unread: Number(data.unread) || 0,
  }
}

/**
 * Mark the inbox read - everything, or only the ids given.
 *
 * Deliberately quiet about failing. This is called when somebody opens the
 * panel, and an error banner over a list they can already read would be
 * telling them about a problem they do not have: the worst case is a badge
 * that clears a minute late.
 */
export async function markNotificationsRead(ids = null) {
  try {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(ids ? { ids } : {}),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Flatten the joined row into something a component can render. */
function toNotification(row) {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    readAt: row.read_at || null,
    postId: row.post_id || null,
    messageId: row.message_id || null,
    actor: {
      address: row.profiles?.address || null,
      handle: row.profiles?.handle || null,
      avatarId: row.profiles?.avatar_id || null,
      avatarUrl: row.profiles?.avatar_url || null,
    },
    /*
     * A line of the post this is about, when there is one.
     *
     * Trimmed here rather than in CSS so the row is the same height whatever
     * somebody wrote - a notification about a two-thousand-character post
     * should not be a two-thousand-character notification.
     */
    excerpt: row.posts?.body ? row.posts.body.slice(0, 140) : null,
  }
}
