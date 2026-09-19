-- The chat's tables, run once against a fresh Supabase project.
--
-- Checked in rather than left in somebody's browser history, because the
-- policies below are the security model. There is nothing in front of the
-- database except these rules: the anon key ships inside the JavaScript every
-- visitor downloads, so anyone can reach Supabase directly with it. What stops
-- them writing is that no policy allows it.

-- Profiles. One row per wallet, written only by the API, on behalf of whoever
-- is holding a verified sign-in cookie.
create table if not exists public.profiles (
  -- The address as it is compared, not as a wallet displays it. Every explorer
  -- shows the mixed-case checksummed form, so storing that would mean every
  -- lookup had to remember to lowercase - and the one that forgot would
  -- silently match nothing.
  address    text primary key check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  handle     text check (char_length(handle) between 1 and 32),
  avatar_id  text check (char_length(avatar_id) <= 64),
  updated_at timestamptz not null default now()
);

-- Messages.
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  address    text not null references public.profiles(address) on delete cascade,
  -- The same 500 as MAX_MESSAGE_LENGTH in src/utils/chatMessage.js. If the two
  -- ever disagree, a message the app accepted becomes a database error rather
  -- than a sentence explaining what went wrong.
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  -- Removed, not erased. A moderator deleting a post should not punch a hole
  -- in the history, and a hard delete leaves no way to see what was removed or
  -- to put it back after a mistake.
  deleted_at timestamptz
);

-- The chat reads the newest messages and nothing else, so this is the only
-- index the read path needs. Partial, because rows that are already removed are
-- never in a result.
create index if not exists messages_recent_idx
  on public.messages (created_at desc)
  where deleted_at is null;

-- Used by the per-address rate limit, which asks how many messages this wallet
-- has posted in the last few seconds.
create index if not exists messages_address_recent_idx
  on public.messages (address, created_at desc);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

-- Read is public: the chat is readable without connecting a wallet.
create policy "anyone may read profiles"
  on public.profiles for select to anon, authenticated using (true);

create policy "anyone may read messages that are not removed"
  on public.messages for select to anon, authenticated using (deleted_at is null);

-- There is deliberately no insert, update or delete policy, for any role.
--
-- With row level security on, an operation with no policy permitting it is
-- refused. So the anon key can read and can do nothing else, and the writes all
-- happen through the API using the service role key, which bypasses these rules
-- and never leaves the server. Adding a write policy here would be handing
-- every visitor the ability to post as anyone.

-- Realtime. Subscribers see inserts as they land, and Supabase applies the
-- policies above to them too, so a removed message is not delivered.
alter publication supabase_realtime add table public.messages;
