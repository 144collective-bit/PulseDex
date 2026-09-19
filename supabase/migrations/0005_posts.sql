-- Posts: the thing that stays after the room has scrolled past.
--
-- Run after 0004_profile_fields.sql, against the same project. Safe to run
-- twice.
--
-- The chat already works and is not replaced by this. A room is live and
-- ephemeral - you had to be there - and that is the right shape for people
-- reacting to a price. A post is the opposite: it belongs to its author rather
-- than to a room, it is still there next week, and it is what makes a profile
-- worth opening. Both, rather than one pretending to be the other.

-- ── Looking somebody up by name ──────────────────────────────────────────────

/*
 * The handle, lowercased, as a column you can compare against.
 *
 * Needed because /u/@handle has to find a profile, and a handle is stored in
 * the case its owner typed. The obvious way to do that from the browser is
 * `ilike`, and the obvious way is wrong: PostgREST passes the value through to
 * SQL LIKE, where `%` and `_` are wildcards. `/u/@%` would then match every
 * profile in the table and the lookup would return whoever happened to sort
 * first - a URL anybody can type that resolves to somebody else's account.
 *
 * Escaping the pattern would work and would have to keep working, in a client
 * that has no idea it is building one. A column holds the answer instead, so
 * the lookup is an equality test and there is no pattern to escape.
 *
 * `stored` rather than a trigger: it cannot drift from `handle`, because it is
 * not a copy of it.
 */
alter table public.profiles
  add column if not exists handle_lower text generated always as (lower(handle)) stored;

-- profiles_handle_unique is an index on the expression lower(handle), which
-- does not serve an equality test on this column. This one does.
create index if not exists profiles_handle_lower_idx
  on public.profiles (handle_lower)
  where handle_lower is not null;

-- ── Posts ───────────────────────────────────────────────────────────────────

create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  -- The author. Cascades, so deleting a profile takes its posts with it -
  -- there is no such thing as a post by nobody, and a feed that had to render
  -- one would be a feed with a hole in it.
  address    text not null references public.profiles(address) on delete cascade,
  -- The same 2000 as MAX_POST_LENGTH in src/utils/post.js. If the two ever
  -- disagree, a post the app accepted becomes a database error rather than a
  -- sentence explaining what went wrong.
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  -- Removed, not erased, exactly as messages are. A moderator deleting a post
  -- should not punch a hole in the history, and a hard delete leaves no way to
  -- see what was removed or to put it back after a mistake.
  deleted_at timestamptz
);

/*
 * Two reads, two indexes, and they are not interchangeable.
 *
 * The feed asks for the newest posts by anybody. A profile asks for the newest
 * posts by one person. Served by a single (created_at) index, the second means
 * scanning the whole feed and discarding everything by everyone else - which
 * is free today and is the query that degrades first.
 *
 * Both partial: a removed post is never in a result, so it has no business
 * taking up space in either index.
 */
create index if not exists posts_recent_idx
  on public.posts (created_at desc)
  where deleted_at is null;

create index if not exists posts_author_idx
  on public.posts (address, created_at desc)
  where deleted_at is null;

alter table public.posts enable row level security;

/*
 * Read is public, like the chat: a post is readable without connecting a
 * wallet. That is the point of it being a post.
 *
 * Dropped first, because `create policy` has no `if not exists` - it is the
 * one statement in this file that would otherwise raise on a second run, and
 * every other one here is written to be re-runnable. A drop-then-create is
 * safe on a table nothing can write to anyway: the window between the two
 * statements is inside this transaction, and the only thing a missing select
 * policy does is refuse reads.
 */
drop policy if exists "anyone may read posts that are not removed" on public.posts;
create policy "anyone may read posts that are not removed"
  on public.posts for select to anon, authenticated using (deleted_at is null);

-- There is deliberately no insert, update or delete policy, for any role. With
-- row level security on, an operation with no policy permitting it is refused,
-- so the anon key that ships in the bundle can read and can do nothing else.
-- Writing happens in api/posts.js with the service role key, behind a check
-- that the caller holds a verified sign-in cookie.

/*
 * Subscribers see new posts as they land, and Supabase applies the policy
 * above to them too, so a removed post is not delivered.
 *
 * Guarded, unlike the equivalent line in 0001. `alter publication ... add
 * table` raises on a table already in the publication, which would make this
 * file fail on a second run - and every other statement here is written to be
 * re-runnable, so one that is not turns "safe to run twice" into a claim that
 * is true right up until somebody relies on it.
 */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end
$$;

-- ── Reports ─────────────────────────────────────────────────────────────────

/*
 * Somebody flagging a post for a moderator to look at.
 *
 * Added with the feed rather than after it, on purpose. Moderation today is a
 * blocklist and a delete button, which is enough for five rooms where a
 * moderator is reading along anyway. A feed is not read by a moderator - it is
 * read by whoever follows the author - so the only way anyone finds out about
 * a post is if a reader can say so. Bolting this on later means shipping a
 * publishing platform with no way to report anything.
 */
create table if not exists public.post_reports (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.posts(id) on delete cascade,
  reporter    text not null references public.profiles(address) on delete cascade,
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  -- One report per person per post. Without this, a report count is a measure
  -- of how many times one determined person pressed a button, and a queue
  -- sorted by it puts whoever is most disliked at the top rather than whatever
  -- is worst.
  unique (post_id, reporter)
);

-- Newest first, which is the only way the queue is read.
create index if not exists post_reports_recent_idx
  on public.post_reports (created_at desc);

alter table public.post_reports enable row level security;

/*
 * No policies, for any role, deliberately - not even select. The same
 * reasoning as the blocklist in 0003: the anon key is public, so a select
 * policy would publish every report to everyone, including the people being
 * reported. That turns a report into an accusation the accused can read, with
 * the reporter's address attached to it.
 *
 * Only the service role touches this, from api/posts/report.js.
 */
