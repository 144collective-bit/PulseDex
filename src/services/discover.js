import { supabase, hasSupabase } from '../config/supabase'
import { containsPattern } from '../utils/likePattern'
import { normaliseLinks } from '../utils/profileFields'
import { dbError } from '../utils/dbError'

/**
 * Finding people worth following.
 *
 * The hard part of a social site at this size is not ranking, it is that a new
 * account arrives to an empty Following feed and has no idea who exists. So
 * this answers "who is here" rather than "who is best" - there is no
 * engagement signal worth ranking on yet, and inventing one would be a
 * recommendation nobody asked for dressed up as a discovery feature.
 *
 * Two ways in: look somebody up by name, or see who has been posting.
 */

const PROFILE_FIELDS = 'address, handle, avatar_id, avatar_url, bio, links, created_at'

function toProfile(row) {
  return {
    address: row.address,
    handle: row.handle || null,
    avatarId: row.avatar_id || null,
    avatarUrl: row.avatar_url || null,
    bio: row.bio || null,
    // Normalised on the way out as well as in. This arrives over a public key
    // and the check that wrote it ran in another process on another day.
    links: normaliseLinks(row.links),
    createdAt: row.created_at || null,
  }
}

/**
 * Search profiles by handle.
 *
 * Matched against `handle_lower` with an escaped pattern. The escaping is the
 * point: `%` and `_` are LIKE wildcards, so a search for `%` would otherwise
 * return every profile in the table - a "people" list that quietly becomes
 * "everybody" the moment somebody types a percent sign.
 *
 * Only handles, not bios. Searching bios sounds like more for free and is
 * not: it surfaces people by words they wrote about themselves, which is
 * exactly the surface somebody fills with keywords to be found.
 */
export async function searchProfiles(term, limit = 20) {
  const pattern = containsPattern(term)
  if (!hasSupabase || !pattern) return []

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .not('handle', 'is', null)
    .like('handle_lower', pattern.toLowerCase())
    .limit(limit)

  if (error) throw dbError(error, 'search profiles')
  return (data || []).map(toProfile)
}

/**
 * Who has been posting.
 *
 * Recent posts, deduplicated by author, then those authors' profiles. Two
 * queries rather than one, because PostgREST has no `distinct on` - and the
 * alternative, a view or a function, is schema for something this simple.
 *
 * Recency rather than popularity, deliberately. A most-followed list on a site
 * this young is a list of whoever arrived first, and putting it on the
 * discovery page is how that becomes permanent.
 */
export async function fetchActiveProfiles({ limit = 20, sample = 120 } = {}) {
  if (!hasSupabase) return []

  const recent = await supabase
    .from('posts')
    .select('address')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(sample)

  if (recent.error) throw dbError(recent.error, 'find recently active people')

  // Insertion order is recency order, so the most recently active come first
  // and the cap keeps the busiest few from filling the page.
  const addresses = [...new Set((recent.data || []).map((row) => row.address))].slice(0, limit)
  if (addresses.length === 0) return []

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .in('address', addresses)

  if (error) throw dbError(error, 'load profiles for Discover')

  /*
   * Put back into the order the posts gave, because `in` returns rows in
   * whatever order the database finds them - which would make "recently
   * active" a list in no particular order, and nobody would be able to say
   * why it was wrong.
   */
  const byAddress = new Map((data || []).map((row) => [row.address, toProfile(row)]))
  return addresses.map((address) => byAddress.get(address)).filter(Boolean)
}
