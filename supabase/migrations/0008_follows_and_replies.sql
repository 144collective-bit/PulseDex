-- Following people, and replying to them.
--
-- Run after 0007_chat_reactions.sql, against the same project. Safe to run
-- twice.

-- ── Follows ─────────────────────────────────────────────────────────────────

/*
 * One-way, like X and unlike a friend list: following somebody needs nothing
 * from them. That is the whole reason to prefer it here - a trading site is
 * full of accounts worth reading who will never read you back, and a graph
 * that needs consent in both directions makes those unfollowable.
 *
 * The primary key is the pair, which is what makes following idempotent:
 * pressing the button twice is the same row, not two. It also means
 * "am I following this person" is a key lookup rather than a scan.
 */
create table if not exists public.follows (
  follower   text not null references public.profiles(address) on delete cascade,
  followee   text not null references public.profiles(address) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  -- Following yourself would put your own posts in your following feed and
  -- inflate both your counts. Refused in the schema rather than only in the
  -- endpoint, because this is a rule about the data and not about a request.
  constraint follows_not_self check (follower <> followee)
);

/*
 * Two directions, two indexes.
 *
 * The primary key leads with `follower`, so "who do I follow" - which is what
 * builds the following feed - is already served. "Who follows this person" is
 * the profile's follower count and leads with the other column, so without
 * this it is a full scan of the table on every profile view.
 */
create index if not exists follows_followee_idx on public.follows (followee);

alter table public.follows enable row level security;

/*
 * Public, and worth being deliberate about. Follower counts are visible on
 * every profile, so the graph is readable by anyone with the anon key. That
 * is what makes the counts renderable without an endpoint - and it means
 * following somebody is a public act here, not a private bookmark.
 */
drop policy if exists "anyone may read follows" on public.follows;
create policy "anyone may read follows"
  on public.follows for select to anon, authenticated using (true);

-- No insert or delete policy for any role. Writing happens in
-- api/_routes/follows.js with the service role key, behind the sign-in cookie.

-- ── Replies ─────────────────────────────────────────────────────────────────

/*
 * A reply is a post with a parent.
 *
 * Not a separate table, and that is the decision worth explaining. A reply has
 * the same body rules, the same author, the same removal and reporting paths,
 * and belongs on the same profile as everything else somebody wrote. A second
 * table would be the posts table with a column added and every one of those
 * behaviours reimplemented beside it.
 *
 * The cost is that every query for the main feed must now say "top level
 * only", which is `parent_id is null`. That is one filter, in two places, and
 * it is indexed below.
 *
 * One level deep in the interface, by choice rather than by schema: this
 * column would allow replies to replies, and the feed does not render them.
 * Threads that nest without limit are a different product and a much harder
 * one to read on a phone.
 */
alter table public.posts
  add column if not exists parent_id bigint references public.posts(id) on delete cascade;

/*
 * The main feed asks for top-level posts only, so the index it rides on has to
 * know that. Without this, `parent_id is null` is applied after the fact and a
 * busy day of replies makes the feed slower for everybody.
 */
create index if not exists posts_top_level_idx
  on public.posts (created_at desc)
  where deleted_at is null and parent_id is null;

-- Reading one post's replies, oldest first, which is how a conversation reads.
create index if not exists posts_parent_idx
  on public.posts (parent_id, created_at)
  where deleted_at is null and parent_id is not null;
