-- Knowing which room has something new in it.
--
-- Run after 0010_notifications.sql, against the same project. Safe to run
-- twice.

/*
 * When each person last looked at each room.
 *
 * The sidebar has been five identical words since the chat shipped. Nothing
 * said which of them had anything new, so the only way to find out was to
 * open all five, and the usual outcome was opening none of them. A room
 * nobody can tell has moved is a room nobody comes back to.
 *
 * Server-side rather than in localStorage, which was the tempting shortcut.
 * Unread state that lives in a browser is unread state that resets on a phone,
 * so somebody reading on their laptop arrives on mobile to five rooms
 * shouting at them about messages they have already read. It belongs to the
 * account, not to the device.
 *
 * One row per person per room, created the first time they open one.
 */
create table if not exists public.room_reads (
  address      text not null references public.profiles(address) on delete cascade,
  -- Not a foreign key yet. Rooms are still a frozen array in
  -- src/config/rooms.js rather than a table; when they become one - which is
  -- what token rooms and groups need - this gains a reference to it.
  room         text not null,
  last_read_at timestamptz not null default now(),
  primary key (address, room)
);

alter table public.room_reads enable row level security;

/*
 * No policy for any role.
 *
 * Where somebody has read up to is nobody else's business, and it is also a
 * decent presence signal - "last looked at Trenches four minutes ago" says
 * more about a person than they agreed to share. Same shape as the
 * notifications table, and for the same underlying reason: sign-in here is a
 * cookie this app sets rather than Supabase auth, so `auth.uid()` is null and
 * row-level security cannot express "your own rows". Reads and writes go
 * through api/_routes/chat/reads.js with the service role.
 */

/*
 * How many messages each room has that this person has not seen.
 *
 * A function rather than a query per room, because there are five rooms today
 * and there will be one per token before long. Five round trips is tolerable
 * and five hundred is not, and the shape of the answer does not change:
 * one row per room that has anything unread.
 *
 * Three things it deliberately does:
 *
 *   - Skips your own messages. Writing something is not a reason to be told
 *     about it.
 *
 *   - Skips removed ones, so a moderator deleting a message also clears the
 *     badge it was causing.
 *
 *   - Falls back to when the account was created, not to the beginning of
 *     time. Without that, somebody signing in for the first time is greeted
 *     by every message ever posted, marked unread - which is not a welcome,
 *     it is a wall. Joining today means today's conversation is new to you
 *     and last year's is not.
 *
 * Not `security definer`: it is called with the service role from the
 * endpoint, so it needs no privilege of its own, and a definer function is a
 * thing to get right rather than a thing to add by habit.
 */
create or replace function public.unread_counts(reader text)
returns table (room text, unread bigint)
language sql
stable
as $$
  select m.room, count(*)::bigint as unread
  from public.messages m
  join public.profiles p
    on p.address = reader
  left join public.room_reads r
    on r.address = reader and r.room = m.room
  where m.deleted_at is null
    and m.address <> reader
    and m.created_at > coalesce(r.last_read_at, p.created_at)
  group by m.room
$$;

/*
 * The index that function rides on.
 *
 * It asks "messages in this room since a timestamp", which is the same shape
 * the chat itself asks on every page load - but messages_room_recent_idx
 * orders descending for reading the newest first, and this counts forward
 * from a point. Partial on the removed ones, since they are excluded either
 * way and there is no reason to carry them.
 */
create index if not exists messages_room_since_idx
  on public.messages (room, created_at)
  where deleted_at is null;
