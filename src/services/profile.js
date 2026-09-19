/**
 * The signed-in wallet's chat identity, held by the server.
 *
 * Separate from `src/utils/profileStorage.js`, which keeps the site's local
 * preferences - theme, sounds, trade notes, the things that belong to a
 * browser rather than to an account. This is the part other people see, so it
 * cannot live in one device's localStorage: the same wallet on a phone would
 * otherwise show up as a different person.
 */

/** Read it. Answers nulls rather than failing when nothing has been saved. */
export async function fetchMyProfile() {
  const res = await fetch('/api/profile', { credentials: 'same-origin' })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'Your profile could not be loaded.')
  }
  return res.json()
}

/**
 * Claim a handle and avatar.
 *
 * The one failure worth handling by name is 409: somebody else holds that
 * name. The endpoint says so in a sentence, which is passed through rather
 * than replaced, because it is the only error here the person can act on.
 */
export async function saveMyProfile({ handle, avatarId }) {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ handle, avatarId }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'Your profile could not be saved.')
  return payload
}

/** Stop an address posting. Moderators only; for anyone else the endpoint
 *  answers as though the route does not exist. */
export async function blockAddress({ address, reason }) {
  const res = await fetch('/api/chat/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ address, reason }),
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That address could not be blocked.')
  }
}
