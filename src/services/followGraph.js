import { supabase, hasSupabase } from '../config/supabase'
import { FOLLOWEE_FIELDS, FOLLOWER_FIELDS } from '../config/queries'
import { PAGE_SIZE, hasMoreBefore } from '../utils/chatPaging'
import { normaliseLinks } from '../utils/profileFields'
import { dbError } from '../utils/dbError'

/**
 * The follow graph, as lists of people rather than as two numbers.
 *
 * `src/services/follows.js` already answers "how many" and "does A follow B",
 * which is what a profile header needs. This answers "who", which is a
 * different question and a different query: the counts are head requests that
 * return no rows, and these return a page of people with their profiles
 * attached.
 *
 * Kept in its own file for that reason rather than added to follows.js, which
 * is about the relationship between the reader and one account. This is about
 * a list somebody is browsing, with paging and a cursor and an order - the
 * same shape as a feed, and it belongs beside the other things shaped like
 * one.
 *
 * Read over the anon key, like the counts. 0008 made the graph public
 * deliberately and said so: following somebody here is an act others can see,
 * not a private bookmark. Browsable lists are that decision becoming visible,
 * which is worth noting because it is the point at which somebody will
 * realise what "public" meant - so the page says it out loud rather than
 * leaving them to discover it from a stranger's list.
 */

/**
 * One edge, flattened into the person on the other end.
 *
 * One function for both directions, because the embed is named `profiles`
 * either way - a followers list and a following list are the same row read
 * from opposite ends, and which end is chosen in the select string rather
 * than here. See FOLLOWER_FIELDS and FOLLOWEE_FIELDS.
 */
function toPerson(row) {
  const profile = row?.profiles
  // A row whose profile is missing cannot be drawn. The foreign keys make it
  // impossible, which is exactly why it is checked here rather than trusted:
  // the constraint lives in a database this code does not get to see.
  if (!profile || typeof profile !== 'object') return null

  return {
    address: profile.address,
    handle: profile.handle || null,
    avatarId: profile.avatar_id || null,
    avatarUrl: profile.avatar_url || null,
    bio: profile.bio || null,
    // Not selected for a list row, but normalised rather than left undefined
    // so every person object in this app has the same shape - PersonCard reads
    // one of these and a Discover result interchangeably.
    links: normaliseLinks(profile.links),
    /** When the follow happened, which is this list's sort order and cursor. */
    followedAt: row.created_at || null,
  }
}

/**
 * A page of the graph.
 *
 * Newest follow first, because a followers list read top-down is "who turned
 * up recently" - the order that tells an account something it did not already
 * know. Oldest-first would make every list open on the same few people
 * forever.
 *
 * Paged on `created_at` rather than an offset. Two follows in the same
 * millisecond would make an offset page skip or repeat somebody; a cursor can
 * at worst show one of them twice, and the caller merges by address.
 */
async function page({ table, select, filterColumn, address, before, limit }) {
  if (!hasSupabase || !address) return { people: [], hasMore: false }

  let query = supabase
    .from(table)
    .select(select)
    .eq(filterColumn, address.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)

  // Exclusive, so the row the cursor came from is not returned again.
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw dbError(error, 'load this list of people')

  const rows = data || []
  return {
    people: rows.map(toPerson).filter(Boolean),
    /*
     * Computed from the raw row count, not from the people that survived the
     * filter above. A page where one row had no profile still came back full,
     * and reporting "no more" because the list shrank would end the list
     * early and hide everybody after it.
     */
    hasMore: hasMoreBefore(rows, limit),
  }
}

/**
 * Who follows this address.
 *
 * @param {string|null} address
 * @param {{ before?: string|null, limit?: number }} [options]
 */
export function fetchFollowers(address, { before = null, limit = PAGE_SIZE } = {}) {
  return page({
    table: 'follows',
    select: FOLLOWER_FIELDS,
    // Rows where this account is the followee; the person is the follower.
    filterColumn: 'followee',
    address,
    before,
    limit,
  })
}

/**
 * Who this address follows.
 *
 * `fetchFollowing` in follows.js returns bare addresses for building a feed
 * and is deliberately left alone - it is a different job. This one returns
 * people to draw.
 *
 * @param {string|null} address
 * @param {{ before?: string|null, limit?: number }} [options]
 */
export function fetchFollowees(address, { before = null, limit = PAGE_SIZE } = {}) {
  return page({
    table: 'follows',
    select: FOLLOWEE_FIELDS,
    filterColumn: 'follower',
    address,
    before,
    limit,
  })
}
