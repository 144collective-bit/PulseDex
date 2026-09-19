import { supabase, hasSupabase } from '../config/supabase'
import { normaliseLinks } from '../utils/profileFields'
import { PUBLIC_PROFILE_FIELDS } from '../config/queries'
import { dbError } from '../utils/dbError'

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
export async function saveMyProfile({ handle, avatarId, bio, links }) {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ handle, avatarId, bio, links }),
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

/**
 * Publish a picture.
 *
 * Takes the same compressed data URL that Profile settings already produces
 * and stores on this device. Sending it rather than the original file is not
 * an optimisation: the browser's crop and re-encode is what turns a photograph
 * with a location in its EXIF into 256 square pixels with nothing attached,
 * and the endpoint would have no way to do that for us.
 *
 * Deliberately a separate call from saving the rest of the profile, made only
 * when somebody changes their picture. Publishing is a different act from
 * saving a preference, and it should take a decision rather than happen on the
 * next save that touches anything.
 */
export async function uploadMyAvatar(dataUrl) {
  const res = await fetch('/api/profile/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ dataUrl }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That picture could not be published.')
  return payload.avatarUrl || null
}

/**
 * Take a picture down.
 *
 * With no address, your own. With one, somebody else's - which only a
 * moderator may do, and for anyone else the endpoint answers as though the
 * route does not exist.
 */
export async function removeAvatar(address = null) {
  const query = address ? `?address=${encodeURIComponent(address)}` : ''
  const res = await fetch(`/api/profile/avatar${query}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That picture could not be removed.')
  }
}

/**
 * Somebody else's public profile.
 *
 * Read straight from Supabase over the anon key rather than through an
 * endpoint, like the messages are and for the same reason: row level security
 * already says these columns are public, so a function in front of them would
 * be a second copy of that decision to keep in step with the first.
 *
 * Answers null for an address nobody has a profile for, which is the ordinary
 * state of somebody who has read the site and never posted - not an error.
 */
export async function fetchPublicProfile(address) {
  if (!hasSupabase || !address) return null
  return runProfileQuery(
    supabase.from('profiles').select(PUBLIC_PROFILE_FIELDS).eq('address', address.toLowerCase()),
  )
}

/**
 * The same profile, found by the name instead of the address.
 *
 * Exists because /u/@handle is the URL people actually share - an address is
 * unreadable and unmemorable, and nobody pastes one into a conversation to say
 * "this person". The address spelling still works and always will, because a
 * handle can be changed or given up and a link that rots is worse than an ugly
 * one.
 *
 * An equality test on `handle_lower`, never `ilike`. PostgREST hands an ilike
 * value to SQL LIKE, where `%` and `_` are wildcards - so /u/@%25 would match
 * every profile in the table and resolve to whichever sorted first. The
 * generated column in 0005_posts.sql exists so there is no pattern here to get
 * wrong.
 *
 * Case-insensitive because "Satoshi" and "satoshi" are the same claim to
 * everyone except a database, and `profiles_handle_unique` already treats them
 * as one.
 */
export async function fetchProfileByHandle(handle) {
  if (!hasSupabase || !handle) return null
  return runProfileQuery(
    supabase
      .from('profiles')
      .select(PUBLIC_PROFILE_FIELDS)
      .eq('handle_lower', handle.toLowerCase()),
  )
}

async function runProfileQuery(query) {
  const { data, error } = await query.maybeSingle()

  if (error) throw dbError(error, 'load a profile')
  if (!data) return null

  return {
    address: data.address,
    handle: data.handle || null,
    avatarId: data.avatar_id || null,
    avatarUrl: data.avatar_url || null,
    bannerUrl: data.banner_url || null,
    bio: data.bio || null,
    // Normalised again on the way out, although it was normalised on the way
    // in. This value arrives from the database over a public key, and the
    // check that put it there ran in a different process on a different day -
    // a link rendered as an anchor should be one this build approved.
    links: normaliseLinks(data.links),
    createdAt: data.created_at || null,
  }
}

/**
 * Publish a banner.
 *
 * Takes the same cropped data URL the settings page produces, for the same
 * reason the avatar does: the browser's crop and re-encode is what turns a
 * photograph carrying a location in its EXIF into 1200 by 400 pixels with
 * nothing attached, and the endpoint has no way to do that for us.
 */
export async function uploadMyBanner(dataUrl) {
  const res = await fetch('/api/profile/banner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ dataUrl }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'That image could not be published.')
  return payload.bannerUrl || null
}

/** Take a banner down. Your own with no address; somebody else's only as a
 *  moderator, where anyone else gets the 404 the route gives a stranger. */
export async function removeBanner(address = null) {
  const query = address ? `?address=${encodeURIComponent(address)}` : ''
  const res = await fetch(`/api/profile/banner${query}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That image could not be removed.')
  }
}
