-- Taking a room down, and changing what it requires.
--
-- Run after 0017_message_reply_fk.sql, against the same project. Safe to run
-- twice - every statement checks first.
--
-- 0016 created groups and said why neither of these existed yet:
--
--   "A group may be gated on a token, which is set here rather than edited
--    later. That is a limitation and a deliberate one for now: changing a
--    gate is a change to who may speak in a room people are already in, and
--    it wants an audit row and a notice to the room - neither of which
--    exists yet."
--
-- This is the audit row and what the notice is drawn from. The other half -
-- "a group with the wrong gate can be left alone and another made" - stopped
-- being an answer the moment somebody made one with a typo in the amount,
-- because the wrong room stays in everybody's sidebar forever.

-- == Taking a room down =====================================================

/*
 * Archived, not deleted.
 *
 * `messages.room` is a foreign key to this table, so a real delete either
 * cascades - taking every message in the room with it - or is refused. Both
 * are wrong. A room is taken down because of what is in it or because it was
 * a mistake, and in the first case the conversation is the evidence: deleting
 * it destroys the record of the thing that justified the deletion.
 *
 * So the room stops accepting messages and stops appearing in the list, and
 * what was said stays said. The same shape `token_claims` uses for a revoked
 * claim, and for the same reason.
 */
alter table public.rooms
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text references public.profiles(address) on delete set null;

do $$
begin
  /* Both or neither. A room archived by nobody is exactly the row that makes
     the audit worthless - see the identical check on token_claims. */
  if not exists (select 1 from pg_constraint where conname = 'rooms_archived_shape') then
    alter table public.rooms
      add constraint rooms_archived_shape
        check ((archived_at is null) = (archived_by is null));
  end if;
end $$;

/*
 * The live rooms, which is what the sidebar asks for.
 *
 * Partial, so the index holds only what is not archived. Archiving is rare
 * and permanent-ish, so this stays small and every list query uses it.
 */
create index if not exists rooms_live_idx
  on public.rooms (kind, last_message_at desc)
  where archived_at is null;

/*
 * Anon reads live rooms only.
 *
 * Narrowed from `using (true)`, which is the change that makes archiving mean
 * anything: a room still readable over the anon key is a room still in
 * everybody's sidebar. A moderator's view of archived rooms goes through
 * api/_routes/rooms/, with the service role, behind the same 404-not-403 rule
 * as every other moderator surface.
 *
 * Note what this does NOT do. The messages in an archived room stay readable,
 * because `messages` has its own policy and this one does not reach it. That
 * is deliberate: a link somebody was sent to a message should keep working,
 * and a conversation that silently evaporates is a worse answer to "what was
 * said here" than one that is plainly closed.
 */
drop policy if exists "anyone may read rooms" on public.rooms;
create policy "anyone may read rooms"
  on public.rooms for select to anon, authenticated using (archived_at is null);

-- == Changing what a room requires ==========================================

/*
 * Every gate a room has ever had.
 *
 * A separate table rather than columns on `rooms`, which is the opposite of
 * the call 0015 made for claims - and the difference is that a claim is
 * revoked once while a gate can change any number of times. Columns hold the
 * current state; this holds how it got there.
 *
 * Append-only by having no update or delete policy for any role. The rows are
 * the answer to "why can I no longer post in a room I was posting in
 * yesterday", and a history somebody can edit does not answer that.
 *
 * Every column describing the gate is nullable together, because removing a
 * gate is a change worth recording and is spelled as all-null - the same
 * spelling `rooms` uses for a room with no gate, so the two agree.
 */
create table if not exists public.room_gate_changes (
  id         bigserial primary key,
  room       text not null references public.rooms(slug) on delete cascade,
  /* Who changed it. Null once that account is gone, like every other actor
     column here - the row outlives the person and still says when. */
  changed_by text references public.profiles(address) on delete set null,
  changed_at timestamptz not null default now(),

  /* What it became. All null means the gate was removed and the room opened. */
  gate_token     text,
  min_balance    numeric(78, 0),
  gate_decimals  smallint,
  gate_symbol    text,

  /* The same three rules `rooms` enforces on a gate, restated rather than
     inherited: this table is read directly to draw the notice in the room, so
     a row that is gated to one query and open to another is a notice that
     contradicts the room it is about. */
  constraint room_gate_changes_shape
    check (gate_token is null or gate_token ~ '^0x[0-9a-f]{40}$'),
  constraint room_gate_changes_complete
    check ((gate_token is null) = (min_balance is null)),
  constraint room_gate_changes_positive
    check (min_balance is null or min_balance > 0)
);

/* "What is this room's rule now, and when did it change" - one room, newest
   first, which is the only way this is ever read. */
create index if not exists room_gate_changes_room_idx
  on public.room_gate_changes (room, changed_at desc);

alter table public.room_gate_changes enable row level security;

/*
 * Readable by anyone, because the rule itself is public.
 *
 * A room already says what it requires before somebody types - that was the
 * point of reading the gate in the browser at all, although nothing in the
 * browser enforces it. When the rule changes, the people it changed for are
 * exactly the people who need to be told, and most of them are not signed in
 * to a moderator account.
 *
 * `changed_by` is part of that. Who set a holding requirement on a room is
 * not a secret - it is the accountability the audit exists for - and it is a
 * moderator address, which is already public in ADMIN_ADDRESSES-shaped
 * deployments and already visible on every message they post.
 */
drop policy if exists "anyone may read gate changes" on public.room_gate_changes;
create policy "anyone may read gate changes"
  on public.room_gate_changes for select to anon, authenticated using (true);

-- No insert, update or delete policy for any role. Writes happen in
-- api/_routes/rooms/groups.js with the service role, which bypasses RLS, after
-- a signature and a moderator check.

/*
 * Tell PostgREST to look again.
 *
 * It caches the schema, including which tables and foreign keys exist, and a
 * select is resolved against that cache. Supabase reloads it on DDL through
 * an event trigger, so this is usually redundant - but "usually" is how a
 * correct migration still leaves every room reporting that it could not be
 * loaded, which this project has now shipped once.
 */
notify pgrst, 'reload schema';

/*
 * To check this worked, without deploying anything:
 *
 *   select column_name from information_schema.columns
 *   where table_name = 'rooms' and column_name like 'archived%';
 *
 *   select polname, pg_get_expr(polqual, polrelid)
 *   from pg_policy where polrelid = 'public.rooms'::regclass;
 *
 * Two columns, and the room policy should read `(archived_at IS NULL)`.
 */
