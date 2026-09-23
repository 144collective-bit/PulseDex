/**
 * How much of each room has gone unread, and saying you have read one.
 *
 * Through an endpoint rather than the database, unlike everything else the
 * chat reads. Where somebody has got to is nobody else's business - and it is
 * a better presence signal than anybody agreed to give, since "last looked at
 * Trenches four minutes ago" says a good deal about a person's day.
 */

/** Unread counts, keyed by room. Rooms with nothing unread are absent. */
export async function fetchUnread() {
  const res = await fetch('/api/chat/reads', { credentials: 'same-origin' })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'Unread counts are unavailable right now.')
  }
  const data = await res.json()
  return data.unread && typeof data.unread === 'object' ? data.unread : {}
}

/**
 * Mark one room read, as of now.
 *
 * Quiet about failing, deliberately. This fires when somebody opens a room,
 * and the worst case is a badge that clears a minute late. An error banner
 * over a conversation they are already reading would be telling them about a
 * problem they do not have.
 */
export async function markRoomRead(room) {
  try {
    const res = await fetch('/api/chat/reads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ room }),
    })
    return res.ok
  } catch {
    return false
  }
}
