-- Feed quality: the indexes ranking reads through, and one repair.
--
-- Run after 0021_safety_at_scale.sql, against the same project. Safe to run
-- twice, and safe to run on a database where nothing is wrong - every
-- statement checks first.
--
-- **This migration is NOT required for Batch 6 to work**, which makes it the
-- first one here that is optional, and the distinction is worth stating
-- plainly because every file from 0018 on has said the opposite. Nothing the
-- feed selects depends on a column this adds, because it adds none: ranking is
-- computed from rows the app already reads. What is in here is one latent bug
-- and three indexes for queries that work without them.

-- ── The repair: posts.parent_id has no foreign key, probably ────────────────

/*
 * 0008 created the column and its key in one statement:
 *
 *   alter table public.posts
 *     add column if not exists parent_id bigint references public.posts(id)
 *     on delete cascade;
 *
 * which is the trap 0017 was written to repair on `messages.reply_to`.
 * `add column if not exists` is one statement and the `references` clause is
 * part of it, so on a database where the column already existed the whole
 * thing was skipped - the constraint included, and silently.
 *
 * Nobody has found out whether it survived, because nothing in this app has
 * ever asked PostgREST to traverse it. Replies are read by `eq('parent_id',
 * id)`, which is a column filter and needs no key. So this has sat here since
 * 0008 as a question nobody asked.
 *
 * It matters for two reasons even though the app reads replies without it:
 *
 * - **Orphan replies.** Without the key, a hard delete of a parent leaves its
 *   replies pointing at an id that is not there. The `on delete cascade` is
 *   what was meant to take a thread with its post.
 * - It is the difference between `parent_id` being a relationship and being a
 *   number that happens to look like one. api/_routes/me/affinity.js wanted
 *   the embed and deliberately does two queries instead, precisely because
 *   this could not be relied on.
 */

/* The column, on its own, so its existence cannot decide the key's. */
alter table public.posts
  add column if not exists parent_id bigint;

/*
 * The key, by the name PostgREST would need: `posts_parent_id_fkey`.
 *
 * Named explicitly rather than left to convention, which is the lesson 0017
 * wrote down: a constraint an application might name should be created by that
 * name, in its own statement, rather than as a side effect of a column
 * definition.
 *
 * `on delete cascade` is what 0008 intended, and it is the right direction
 * here where `messages.reply_to` took `set null`. The difference is what the
 * two are: a chat reply with its parent deleted still reads as a message in a
 * room, so it is left standing. A post's reply with no parent is a reply to
 * nothing - it would appear in no thread and on no profile tab that wants
 * top-level posts, which is a row nobody can reach.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_parent_id_fkey'
      and conrelid = 'public.posts'::regclass
  ) then
    /*
     * Orphans first, or the constraint will not take.
     *
     * If the key went missing and a parent was hard-deleted since, there are
     * rows pointing at nothing and `add constraint` fails on them. They are
     * soft-deleted rather than removed: this is somebody's writing, and a
     * migration that silently deletes posts to make a constraint fit is a
     * migration nobody should run. A soft delete takes them out of every read
     * in the app and leaves them recoverable by hand.
     */
    update public.posts child
       set deleted_at = coalesce(child.deleted_at, now())
     where child.parent_id is not null
       and not exists (select 1 from public.posts parent where parent.id = child.parent_id);

    /*
     * And then point them at nothing, because a soft delete does not satisfy a
     * foreign key - the rows are still there, still pointing at an id that is
     * not. Null is also the honest value: the post they answered does not
     * exist, and `parent_id` saying so is better than it naming a ghost.
     *
     * `add constraint ... not valid` would have skipped this and is the wrong
     * tool here. It would leave the orphans in place and the constraint
     * asserting something untrue of its own table, which is a worse state than
     * either having the key or not.
     *
     * Note this tests row existence and not `deleted_at`: a reply whose parent
     * was soft-deleted is not an orphan, and must not be touched.
     */
    update public.posts child
       set parent_id = null
     where child.parent_id is not null
       and not exists (select 1 from public.posts parent where parent.id = child.parent_id);

    alter table public.posts
      add constraint posts_parent_id_fkey
        foreign key (parent_id) references public.posts(id) on delete cascade;
  end if;
end $$;

/* From 0008, repeated because it lived in the same file as the column and may
   have been skipped with it. */
create index if not exists posts_parent_idx
  on public.posts (parent_id)
  where parent_id is not null;

-- ── Indexes for what ranking reads ─────────────────────────────────────────

/*
 * api/_routes/me/affinity.js reads four things per signed-in reader on every
 * cold load of the feed, each of them "this account's own rows". None of these
 * indexes changes a result; they change four sequential scans into four
 * lookups, which is the difference between a feed that draws and a feed that
 * draws eventually.
 *
 * Added here rather than in the migration that created each table, because
 * until ranking existed nothing read these tables this way - `post_reactions`
 * was only ever read by post, never by reactor.
 */

/* Who this reader has reacted to, newest first. The date is in the key
   because affinity only looks back ninety days. */
create index if not exists post_reactions_by_reactor_idx
  on public.post_reactions (address, created_at desc);

/* Whose posts this reader saved. `post_bookmarks` is keyed (address, post_id)
   already, so this one is deliberately absent - the primary key serves it. */

/* This reader's own replies, for the parent lookup. Partial, because a reply
   is the minority of posts and the query always filters on it. */
create index if not exists posts_by_author_replies_idx
  on public.posts (address, created_at desc)
  where deleted_at is null and parent_id is not null;

/*
 * Who follows whom, from the follower's side.
 *
 * `follows` has the pair as its primary key with `follower` leading, so this
 * is already served - stated rather than added, so nobody adds it later
 * thinking it was missed.
 */

-- ── Tell PostgREST to look again ───────────────────────────────────────────

/*
 * It caches which foreign keys exist, and an embed is resolved against that
 * cache rather than against the database. Supabase reloads it on DDL through
 * an event trigger, so this is usually redundant - but "usually" is how a
 * correct migration still leaves a surface reporting that it could not be
 * loaded, and the cost of asking is nothing.
 */
notify pgrst, 'reload schema';

-- ── Did it work? ────────────────────────────────────────────────────────────

/*
 * One query, the shape every migration here ends with. Three rows, all true.
 */
select 'posts_parent_id_fkey' as thing,
  exists (select 1 from pg_constraint
           where conname = 'posts_parent_id_fkey'
             and conrelid = 'public.posts'::regclass) as present
union all
select 'post_reactions_by_reactor_idx',
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'post_reactions_by_reactor_idx')
union all
select 'posts_by_author_replies_idx',
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'posts_by_author_replies_idx');
