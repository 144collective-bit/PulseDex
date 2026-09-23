-- A room per token.
--
-- Run after 0013_message_search.sql, against the same project. Safe to run
-- twice.
--
-- This reverses the decision 0002 made, and the reversal is the point. That
-- migration put the room list in src/config/rooms.js and gave the database a
-- shape check, arguing that a table would put the authority in two places.
-- That was right while there were five rooms and every one of them arrived in
-- a commit. It stops being right the moment a room can be created by somebody
-- opening a token page: the app cannot hold a list it does not know the length
-- of, and "which rooms exist" becomes a question only the database can answer.
--
-- The fixed five stay in the config file and are seeded here. They are still
-- the only rooms with a name and a blurb written by a person, and they are
-- still the ones the sidebar always shows.

/*
 * The rooms.
 *
 * `kind` rather than inferring from whether `token_address` is null, because
 * the two constraints below read as rules about rooms rather than as tricks
 * about nulls - and because a third kind is coming in Batch D, where a group
 * is neither of these.
 */
create table if not exists public.rooms (
  slug text primary key,
  kind text not null,
  /* The token this room is about, for a token room, and null otherwise. Kept
     as its own column rather than parsed back out of the slug: the slug is an
     identifier and the address is data, and a query for "the room about this
     token" should not be a string operation. */
  token_address text,
  /* Written by a person, for the fixed rooms. Null for a token room, and
     deliberately so - see the note below. */
  name text,
  blurb text,
  created_at timestamptz not null default now(),
  /* Who posted the first message in it. Null for the seeded five. A room is
     created by whoever first says something in it, and when one has to be
     dealt with, the first question is who made it. */
  created_by text references public.profiles(address) on delete set null,
  /*
   * Denormalised, and on purpose.
   *
   * "Which token is being talked about" is a question the screener wants to
   * ask about a hundred tokens at once while it draws a list. As a count over
   * `messages` that is a hundred aggregates; as a column it is one read of a
   * small table. The endpoint that writes a message updates both, in the same
   * request, having already done the expensive part.
   *
   * They can drift - a removed message leaves the count one too high - and
   * that is acceptable for what they are for. Neither is used to decide
   * anything, only to sort and to show activity, and a badge that says 41
   * where the truth is 40 has told nobody anything untrue about the token.
   */
  message_count integer not null default 0,
  last_message_at timestamptz
);

/*
 * The slug's shape, widened from what 0002 allowed on `messages.room`.
 *
 * 32 characters fitted five hand-written names and does not fit an address:
 * `token-0x` plus forty hex digits is 48. The character class is unchanged,
 * which is why the prefix is a hyphen rather than the colon that would read
 * better - `token:0x...` would have meant allowing a character in slugs
 * everywhere for the sake of one separator.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_slug_shape') then
    alter table public.rooms
      add constraint rooms_slug_shape check (slug ~ '^[a-z0-9-]{1,64}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'rooms_kind_known') then
    alter table public.rooms
      add constraint rooms_kind_known check (kind in ('fixed', 'token'));
  end if;

  /* A token room is exactly a room with a token. Without this, `kind` and
     `token_address` could disagree and every query has to decide which one it
     believes. */
  if not exists (select 1 from pg_constraint where conname = 'rooms_token_matches_kind') then
    alter table public.rooms
      add constraint rooms_token_matches_kind
        check ((kind = 'token') = (token_address is not null));
  end if;

  /*
   * A token room's slug names its own token.
   *
   * The invariant worth having here: without it a row could say it is about
   * token A while every link to it is built from token B's address, and the
   * conversation would appear under the wrong chart. Lowercase because an
   * address is compared as text everywhere in this schema, and two casings of
   * one address are two rooms.
   */
  if not exists (select 1 from pg_constraint where conname = 'rooms_token_slug_agrees') then
    alter table public.rooms
      add constraint rooms_token_slug_agrees
        check (
          kind <> 'token'
          or (token_address ~ '^0x[0-9a-f]{40}$' and slug = 'token-' || token_address)
        );
  end if;
end $$;

/*
 * And the same widening on `messages.room`, which is the one that actually
 * stops a message being written.
 *
 * 0002 put `^[a-z0-9-]{1,32}$` on that column. A token room's slug is 48
 * characters, so without this every post into one is refused by the database
 * - not by validation, not with a sentence anybody can act on, but as a
 * constraint violation from the insert. Dropped and recreated rather than
 * altered, because a check constraint cannot be changed in place.
 *
 * The constraint keeps its name, so a third run of this file finds it already
 * widened and the drop-and-recreate is a no-op with the same result.
 */
do $$
begin
  alter table public.messages drop constraint if exists messages_room_slug;
  alter table public.messages
    add constraint messages_room_slug check (room ~ '^[a-z0-9-]{1,64}$');
end $$;

/*
 * The five, seeded from what is already in src/config/rooms.js.
 *
 * `on conflict do nothing` rather than an upsert: the name and blurb live in
 * that file, this is a row the foreign key below needs to exist, and a second
 * run of this migration should not quietly overwrite an edit made in the
 * database with whatever was true when this file was written.
 */
insert into public.rooms (slug, kind, name, blurb) values
  ('lounge',   'fixed', 'Lounge',   'One room for everyone on PulseDex. Anything goes.'),
  ('trading',  'fixed', 'Trading',  'Charts, entries, exits. What you are watching and why.'),
  ('trenches', 'fixed', 'Trenches', 'New launches and bonding curves. Assume everything is a rug.'),
  ('hex',      'fixed', 'HEX',      'HEX, stakes and the rest of the Richard Heart complex.'),
  ('help',     'fixed', 'Help',     'Stuck on something, or found a bug? Ask here.')
on conflict (slug) do nothing;

/*
 * Anything already in `messages` that is not one of the five.
 *
 * There should be nothing: every post has gone through an endpoint that
 * checked the slug against the list. But the foreign key below fails outright
 * on one stray row, and a migration that cannot be run is worse than one that
 * adopts a room somebody managed to create. Adopted as 'fixed' with no name,
 * which is visible in the table rather than silently indistinguishable from a
 * seeded one.
 */
insert into public.rooms (slug, kind)
select distinct m.room, 'fixed'
from public.messages m
where not exists (select 1 from public.rooms r where r.slug = m.room)
on conflict (slug) do nothing;

/*
 * Messages belong to a room that exists.
 *
 * The check constraint from 0002 stays - it is about shape, this is about
 * existence, and they fail differently. No `on delete cascade`: deleting a
 * room out from under its messages should be refused, not carried out
 * silently, and nothing in the app deletes rooms.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_room_fkey') then
    alter table public.messages
      add constraint messages_room_fkey
        foreign key (room) references public.rooms(slug);
  end if;
end $$;

/*
 * Deliberately no foreign key on `room_reads.room`.
 *
 * That table records where somebody has read up to, and a row in it is
 * harmless whatever it names. A key there would mean a read mark had to be
 * written after the room existed, which is the wrong order: opening a room
 * that nobody has posted in yet is the ordinary way a token room is first
 * visited, and marking it read is the first thing that happens.
 */

/* Sorting rooms by what is happening in them, which is the only order a list
   of token rooms can be in - there are no five to hand-order. Partial,
   because a room nobody has posted in has no activity to rank. */
create index if not exists rooms_active_idx
  on public.rooms (last_message_at desc)
  where last_message_at is not null;

/* Finding a token's room from its address, for the screener asking about a
   list of tokens at once. */
create index if not exists rooms_token_idx
  on public.rooms (token_address)
  where token_address is not null;

/*
 * Recording that a room has been posted in - creating it if this is the first
 * time.
 *
 * A function because the interesting part cannot be written as an update from
 * the client library: `message_count = message_count + 1` has to happen in
 * the database or two messages landing together lose one of the increments.
 * Doing it in the same statement as the insert also means a token room is
 * created and counted atomically, rather than existing for a moment with
 * nothing in it.
 *
 * The kind and the address are derived from the slug rather than passed in,
 * so a caller cannot create a row claiming to be about a token other than the
 * one its own name carries. `rooms_token_slug_agrees` would refuse that
 * anyway; deriving here means the refusal never has to happen.
 */
create or replace function public.note_room_message(room_slug text, author text)
returns void
language plpgsql
as $$
begin
  insert into public.rooms (slug, kind, token_address, created_by, message_count, last_message_at)
  values (
    room_slug,
    case when room_slug like 'token-%' then 'token' else 'fixed' end,
    case when room_slug like 'token-%' then substring(room_slug from 7) else null end,
    author,
    1,
    now()
  )
  on conflict (slug) do update
    set message_count = public.rooms.message_count + 1,
        last_message_at = now();
end;
$$;

/*
 * Callable by the service role only.
 *
 * PostgREST publishes every function in this schema, so without the revoke
 * the anon key in the bundle could create rooms and inflate their counts
 * directly - which is the same hole the missing insert policy below closes,
 * reopened through a different door. The default grant to `public` goes too,
 * since `anon` and `authenticated` both inherit it.
 */
revoke execute on function public.note_room_message(text, text) from public;
revoke execute on function public.note_room_message(text, text) from anon, authenticated;

/*
 * And granted back to the one role that has to call it, explicitly.
 *
 * `revoke ... from public` reaches every role, including `service_role`,
 * which normally holds this through Supabase's default privileges rather than
 * through a grant of its own. Relying on that grant surviving the revoke
 * above is the kind of assumption that shows up as every message failing to
 * post, so it is stated here instead.
 */
grant execute on function public.note_room_message(text, text) to service_role;

alter table public.rooms enable row level security;

/*
 * Readable by anyone, writable by nothing.
 *
 * Which rooms exist is public - the room list and the token page both draw
 * from this, over the anon key, from the browser. Creating one is not: a room
 * appears when somebody posts the first message in it, which goes through
 * api/_routes/chat/messages.js with the service role after a signature and a
 * rate limit. An insert policy here would let the key in the bundle create
 * rooms directly, which is a way to fill a table nobody can navigate to.
 */
drop policy if exists "anyone may read rooms" on public.rooms;
create policy "anyone may read rooms"
  on public.rooms for select to anon, authenticated using (true);
