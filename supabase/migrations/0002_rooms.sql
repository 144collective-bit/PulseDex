-- Rooms.
--
-- Run after 0001_chat.sql, against the same project. Safe to run twice.
--
-- A column on messages rather than a rooms table, matching where the list
-- actually lives: src/config/rooms.js. The database's job here is to refuse a
-- slug that could never be a room, not to know which rooms exist - the app
-- validates membership of the list on every write, and a table would put the
-- authority in two places at once.

-- Existing messages predate rooms and belong to the room that existed when
-- they were written. The default does that without a separate backfill, and
-- stays as the default so an insert that omits the column cannot land a
-- message nowhere.
alter table public.messages
  add column if not exists room text not null default 'lounge';

-- Shape only. The same expression the room list's own test asserts every slug
-- matches, so a room that passes in the app cannot fail here.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_room_slug'
  ) then
    alter table public.messages
      add constraint messages_room_slug check (room ~ '^[a-z0-9-]{1,32}$');
  end if;
end $$;

-- Every read is now room-scoped, so the index leads with room. Partial on
-- deleted_at for the same reason as before: a removed row is never in a result.
create index if not exists messages_room_recent_idx
  on public.messages (room, created_at desc)
  where deleted_at is null;

-- Superseded by the index above - a lookup by room and time can use it, and a
-- lookup by time alone no longer happens.
drop index if exists messages_recent_idx;
