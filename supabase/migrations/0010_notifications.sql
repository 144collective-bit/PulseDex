-- Mentions, and the notifications that make them worth having.
--
-- Run after 0009_profile_banner.sql, against the same project. Safe to run
-- twice.

-- == Mentions ===============================================================

/*
 * Who a post names, stored as rows rather than found by reading the text.
 *
 * The obvious implementation is to parse "@something" out of the body at
 * render time. It does not work here, and the reason is a decision made
 * earlier and worth keeping: a handle in this app is whatever somebody can
 * type, up to 32 characters. Spaces, punctuation and emoji are all allowed,
 * and profilePath.js matches handles loosely on purpose so that no account
 * becomes unreachable by its own name.
 *
 * That makes "@Pulse Trader" unparseable. There is no rule that says where
 * the name ends - "@Pulse", "@Pulse Trader" and "@Pulse Trader is" are all
 * equally good readings of the same characters, and picking one silently
 * mentions the wrong person.
 *
 * So the composer records who was meant, and the body keeps only what was
 * typed. Two things fall out of that, both of them wanted:
 *
 *   - A mention survives a rename. The row holds an address, so somebody who
 *     changes their handle still gets the notification and the link still
 *     leads to them. Re-parsing text would break both.
 *
 *   - Any handle is mentionable, including the ones no pattern could match.
 */
create table if not exists public.post_mentions (
  post_id bigint not null references public.posts(id) on delete cascade,
  address text   not null references public.profiles(address) on delete cascade,
  primary key (post_id, address)
);

-- "Who was mentioned in these posts", which is what the feed asks while it
-- draws. The primary key already leads with post_id, so this is the other
-- direction: every post that has named one person.
create index if not exists post_mentions_address_idx
  on public.post_mentions (address);

alter table public.post_mentions enable row level security;

/*
 * Readable by anyone, because the posts themselves are. A mention is part of
 * a public post and the client needs it to draw the link, so hiding it behind
 * an endpoint would cost a round trip to protect something already on screen.
 */
drop policy if exists "anyone may read post mentions" on public.post_mentions;
create policy "anyone may read post mentions"
  on public.post_mentions for select to anon, authenticated using (true);

-- No insert or delete policy. Mentions are written beside the post they
-- belong to, in api/_routes/posts.js, with the service role key.

-- == Notifications ==========================================================

/*
 * The reason to come back.
 *
 * Until this table exists, somebody posts and - unless another person happens
 * to be looking at the feed in that moment - it may as well not have
 * happened. Every other social feature is worth more once this one works.
 *
 * `post_id` and `message_id` are both nullable because the four kinds point
 * at different things: a mention and a reply point at a post, a reaction at a
 * chat message, and a follow at nothing at all. Real foreign keys rather than
 * a loose "subject_id integer", so the database enforces that the thing
 * pointed at exists - and, through the cascade, that a notification cannot
 * outlive it.
 */
create table if not exists public.notifications (
  id         bigserial primary key,
  -- Who is being told. Not "user_id": every identity here is an address.
  recipient  text not null references public.profiles(address) on delete cascade,
  kind       text not null check (kind in ('mention', 'reply', 'follow', 'reaction')),
  -- Who caused it. Cascades too: an account that is gone cannot keep
  -- generating rows in somebody else's inbox.
  actor      text not null references public.profiles(address) on delete cascade,
  post_id    bigint references public.posts(id)    on delete cascade,
  message_id bigint references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Null until read. A timestamp rather than a boolean, because "when" is
  -- free to store here and impossible to recover later.
  read_at    timestamptz,

  /*
   * Nobody is notified about themselves. Replying to your own thread,
   * reacting to your own message and mentioning yourself in your own post
   * are all ordinary things to do, and none of them is news.
   *
   * In the schema rather than only in the endpoint, because it is a rule
   * about the data. An endpoint that forgets it produces rows that are wrong
   * rather than a request that is refused.
   */
  constraint notifications_not_self check (recipient <> actor)
);

/*
 * The same thing, told once.
 *
 * Without this, reacting to a message, removing the reaction and reacting
 * again is three notifications for one opinion - and editing a post that
 * mentions somebody tells them twice. Writers use `on conflict do nothing`,
 * so the second attempt is silently the same row.
 *
 * `nulls not distinct` is doing real work. Postgres treats two nulls as
 * different by default, so a follow - which has neither a post nor a message -
 * would never collide with itself and could be recorded without limit.
 *
 * It is also why this is a plain column list rather than the `coalesce(...)`
 * expression that would achieve the same thing. An expression index cannot be
 * named by PostgREST's `on_conflict`, so the writer could not ask to ignore a
 * duplicate and every repeat would come back as an error instead.
 *
 * Needs Postgres 15 or newer, which every current Supabase project is.
 */
create unique index if not exists notifications_once_idx
  on public.notifications (recipient, kind, actor, post_id, message_id)
  nulls not distinct;

-- The inbox itself: one person's, newest first.
create index if not exists notifications_inbox_idx
  on public.notifications (recipient, created_at desc);

/*
 * The unread count, which is drawn on every page load as a badge.
 *
 * Partial, so the index holds only what is unread. An inbox that has been
 * read is the common case and costs nothing to keep here.
 */
create index if not exists notifications_unread_idx
  on public.notifications (recipient)
  where read_at is null;

alter table public.notifications enable row level security;

/*
 * No policy for any role, and that is the point.
 *
 * Sign-in here is a wallet signature and a cookie this app sets, not Supabase
 * auth - so `auth.uid()` is null in every request and RLS has no way to say
 * "your own rows". A readable-by-anon policy would therefore mean readable by
 * everyone, and an inbox is the one surface in this app that is nobody
 * else's business.
 *
 * Reads go through api/_routes/notifications.js with the service role key,
 * behind the session cookie, which is the same shape as every other private
 * path here.
 */
