import { supabase, hasSupabase } from '../config/supabase'

/**
 * Who follows whom.
 *
 * The same split as everywhere else here, and for the same reason: reads come
 * straight from Supabase over the anon key, because row level security says
 * the graph is public, and writes go through our own endpoint, which is the
 * only thing holding a key that can write and the only place that knows who
 * is asking.
 *
 * Worth stating plainly, because it is a product decision and not only a
 * technical one: following somebody here is public. Anyone can read who
 * follows whom, which is what lets a profile render its counts without an
 * endpoint - and means a follow is an act others can see, not a private
 * bookmark.
 */

/**
 * How many people follow this address, and how many it follows.
 *
 * Two head counts rather than a stored counter. A counter would be one read
 * instead of two and would be wrong the first time anything failed halfway -
 * and a follower count that drifts is the kind of bug nobody reports and
 * everybody notices. At this size, counting is free.
 */
export async function fetchFollowCounts(address) {
  if (!hasSupabase || !address) return { followers: 0, following: 0 }

  const key = address.toLowerCase()
  const [followers, following] = await Promise.all([
    supabase.from('follows').select('follower', { head: true, count: 'exact' }).eq('followee', key),
    supabase.from('follows').select('followee', { head: true, count: 'exact' }).eq('follower', key),
  ])

  // Counts are decoration on a profile; losing them should not take the page
  // with them, so a failure reads as zero rather than throwing.
  return {
    followers: followers.error ? 0 : followers.count || 0,
    following: following.error ? 0 : following.count || 0,
  }
}

/**
 * Does `follower` follow `followee`?
 *
 * A key lookup - the pair is the primary key - so this costs the same as
 * reading one row by id, which is why the button can ask on every render of a
 * profile without anybody noticing.
 */
export async function isFollowing({ follower, followee }) {
  if (!hasSupabase || !follower || !followee) return false

  const { data, error } = await supabase
    .from('follows')
    .select('follower')
    .eq('follower', follower.toLowerCase())
    .eq('followee', followee.toLowerCase())
    .maybeSingle()

  return !error && Boolean(data)
}

/**
 * Everyone this address follows.
 *
 * Used to build the following feed, which is why it returns bare addresses
 * rather than profiles: the posts query needs a list to filter on, and
 * fetching each person's details here would be a page of profiles nobody is
 * going to render.
 *
 * Capped. An account following thousands of people would otherwise build a
 * query with thousands of terms in it, and a feed is not improved by reaching
 * further back than the cap allows.
 */
export async function fetchFollowing(address, limit = 500) {
  if (!hasSupabase || !address) return []

  const { data, error } = await supabase
    .from('follows')
    .select('followee')
    .eq('follower', address.toLowerCase())
    .limit(limit)

  if (error) return []
  return (data || []).map((row) => row.followee)
}

/** Follow somebody, or stop. Following twice leaves one; unfollowing twice
 *  leaves none - neither is an error. */
export async function setFollowing({ address, on }) {
  const res = on
    ? await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ address }),
      })
    : await fetch(`/api/follows?address=${encodeURIComponent(address)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || 'That could not be saved.')
  }
}

/**
 * Which of these addresses the follower already follows.
 *
 * One query for a whole list, and it exists because the obvious thing was
 * costing sixty. A list of people rendered a follow button each, every button
 * asked the database independently whether it should say Follow or Following,
 * and two thirds of those asks were for follower counts the row never even
 * displayed. Twenty people meant sixty requests, and a browser will only run
 * about six at a time - so the page spent ten round trips deciding what to
 * write on twenty buttons.
 *
 * Returns a Set of the addresses that are followed, which is the shape the
 * caller wants: `set.has(address)` is what a button needs and nothing more.
 *
 * @param {string|null} follower
 * @param {string[]} addresses
 * @returns {Promise<Set<string>>}
 */
export async function fetchFollowingAmong(follower, addresses) {
  const wanted = (addresses || []).filter(Boolean).map((a) => a.toLowerCase())
  if (!hasSupabase || !follower || wanted.length === 0) return new Set()

  const { data, error } = await supabase
    .from('follows')
    .select('followee')
    .eq('follower', follower.toLowerCase())
    .in('followee', wanted)

  // An empty set rather than a throw: not knowing reads as "not following",
  // which shows a Follow button that corrects itself when pressed. A list that
  // fails to render because one decoration query failed is the worse outcome.
  if (error) return new Set()
  return new Set((data || []).map((row) => row.followee))
}
