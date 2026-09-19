-- Server-held identity, and a way to stop someone posting.
--
-- Run after 0002_rooms.sql, against the same project. Safe to run twice.

-- ── Profiles ────────────────────────────────────────────────────────────────

-- When this wallet first appeared. The table has only ever recorded the last
-- time it changed, which cannot answer "is this account new", and an account's
-- age is the cheapest signal there is when deciding whether a post is spam.
alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

/*
 * Handles become unique, case-insensitively.
 *
 * They were display names until now, and two people could hold the same one -
 * which was fine while a handle only decorated a message, because the address
 * beside it was what identified anyone.
 *
 * Mentions change that. "@satoshi" has to resolve to one account or it
 * resolves to nobody, and an ambiguous mention is worse than none: it tells
 * the wrong person they were named. Uniqueness is the price of that feature,
 * and it is cheaper to charge it now, while the chat holds a day of messages,
 * than after people have grown attached to names.
 *
 * Case-insensitive because "Satoshi" and "satoshi" are the same claim to
 * everyone except a database.
 */

-- Duplicates first, or the index below cannot be built. The oldest profile
-- keeps the name; the rest lose it and show their address until they pick
-- another. Losing a display name is recoverable in a way that a migration
-- which refuses to run is not.
update public.profiles p
set handle = null
where handle is not null
  and exists (
    select 1 from public.profiles other
    where other.handle is not null
      and lower(other.handle) = lower(p.handle)
      and (other.created_at, other.address) < (p.created_at, p.address)
  );

create unique index if not exists profiles_handle_unique
  on public.profiles (lower(handle))
  where handle is not null;

-- ── Blocking ────────────────────────────────────────────────────────────────

/*
 * Addresses that may not post.
 *
 * Until now moderation was one message at a time, which is no answer at all to
 * somebody posting faster than they can be deleted. This is the switch that
 * stops them once.
 *
 * Deliberately not a column on profiles: a block should survive whatever the
 * account does to its own row, and reading "who is blocked" should not come
 * free with reading a display name.
 */
create table if not exists public.blocked (
  address    text primary key check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  -- For whoever reads this in six months wondering why. Not shown to the
  -- blocked account, which is told only that it cannot post.
  reason     text check (char_length(reason) <= 200),
  blocked_by text not null check (blocked_by = lower(blocked_by) and blocked_by ~ '^0x[0-9a-f]{40}$'),
  blocked_at timestamptz not null default now()
);

alter table public.blocked enable row level security;

/*
 * No policies, for any role, deliberately - not even select.
 *
 * Every other table here grants read access to anon, because the browser does
 * the reading. This one is different: the anon key is public, so a select
 * policy would publish the blocklist to everyone, including the people on it.
 * A blocklist that announces itself invites ban evasion and, on a chat tied to
 * wallet addresses, is a list of accusations against named parties.
 *
 * Only the service role touches it, from the endpoints that post and moderate.
 */
