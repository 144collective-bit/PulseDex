-- Repair: the foreign key behind the reply embed.
--
-- Run after 0016_groups_and_gating.sql, against the same project. Safe to run
-- twice, and safe to run on a database where nothing is wrong - every
-- statement checks first.
--
-- Why this exists.
--
-- The Preview deployment for the branch that added replies answered its own
-- health check with this:
--
--   PGRST200: Could not find a relationship between 'messages' and 'messages'
--   in the schema cache. Searched for a foreign key relationship between
--   'messages' and 'messages' using the hint 'messages_reply_to_fkey' in the
--   schema 'public', but no matches were found.
--
-- The chat reads every message with an embed that names that constraint -
-- `reply:messages!messages_reply_to_fkey(...)` in src/config/queries.js - so
-- without it every room reports that it could not be loaded. The column
-- itself resolved fine; it is the key that is missing.
--
-- 0012 created both in one statement:
--
--   alter table public.messages
--     add column if not exists reply_to bigint references public.messages(id)
--     on delete set null;
--
-- which is the trap. `add column if not exists` is one statement and the
-- `references` clause is part of it, so on a database where the column
-- already exists the whole thing is skipped - the constraint included, and
-- silently. A migration that is safe to run twice is not the same as a
-- migration that repairs itself on the second run.
--
-- The lesson worth keeping: a constraint an application names should be
-- created by that name, in its own statement, rather than left to Postgres's
-- default naming as a side effect of a column definition. That is what this
-- file does.

/* The column, on its own, so its existence cannot decide the key's. */
alter table public.messages
  add column if not exists reply_to bigint;

/*
 * The key, by the name the application asks for.
 *
 * `messages_reply_to_fkey` is what Postgres would have called it anyway, and
 * naming it explicitly is the point: the embed in src/config/queries.js
 * depends on this exact string, and a name arrived at by convention is a name
 * that can change without anybody noticing.
 *
 * `on delete set null` matches what 0012 intended, and the reasoning is
 * there: deleting the message somebody was answering should leave their
 * answer standing with nothing above it, rather than deleting it too.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_reply_to_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_reply_to_fkey
        foreign key (reply_to) references public.messages(id) on delete set null;
  end if;
end $$;

/* From 0012, and repeated here because it lived in the same file as the
   column and may have been skipped with it. Partial: a null is the common
   case by a long way. */
create index if not exists messages_reply_to_idx
  on public.messages (reply_to)
  where reply_to is not null;

/*
 * Tell PostgREST to look again.
 *
 * It caches the schema, including which foreign keys exist, and an embed is
 * resolved against that cache rather than against the database. Supabase
 * reloads it on DDL through an event trigger, so this is usually redundant -
 * but "usually" is how a correct migration still leaves every room reporting
 * that it could not be loaded, and the cost of asking is nothing.
 */
notify pgrst, 'reload schema';

/*
 * To check this worked, without deploying anything:
 *
 *   select conname, pg_get_constraintdef(oid)
 *   from pg_constraint
 *   where conrelid = 'public.messages'::regclass and contype = 'f';
 *
 * `messages_reply_to_fkey` should be listed, alongside `messages_room_fkey`
 * from 0014 and the key to `profiles`.
 */
