-- Reactions, and editing what you said.
--
-- Run after 0006_x_link.sql, against the same project. Safe to run twice.
--
-- (0006 adds X account linking and is not deployed yet. This file does not
-- depend on it - run either order.)

-- ── Editing ─────────────────────────────────────────────────────────────────

/*
 * When a message was last changed, or null if it never was.
 *
 * A column rather than silently rewriting `body`, because an edit that leaves
 * no trace is a way to change what you said after somebody replied to it. In a
 * room where people are talking about what to buy, "I said sell" after the
 * fact is worth money. The interface shows an "edited" marker whenever this is
 * set, and that marker is the whole point of the column.
 */
alter table public.messages
  add column if not exists edited_at timestamptz;

-- ── Reactions ───────────────────────────────────────────────────────────────

/*
 * One row per person per emoji per message.
 *
 * The primary key is the whole row, which is what makes a reaction idempotent:
 * pressing the same one twice is the same row, not two. It also makes removal
 * a delete by key rather than a lookup, and means "has this person already
 * reacted with this" needs no separate query.
 *
 * `emoji` is capped at 8 characters rather than 1 - a single emoji can be
 * several code points once skin tones and zero-width joiners are involved, and
 * a limit of one would refuse half the set. The real constraint is not here:
 * the endpoint only accepts values from the fixed list in
 * src/config/reactions.js, because a free-text column rendered beside a
 * message is a way to post arbitrary text without it being a message.
 */
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  address    text not null references public.profiles(address) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, address, emoji)
);

-- Reactions are always read for a page of messages at once, never on their
-- own. The primary key leads with message_id, so it already serves that - this
-- exists for the cascade when a profile is deleted, which looks up by address.
create index if not exists message_reactions_address_idx
  on public.message_reactions (address);

alter table public.message_reactions enable row level security;

-- Public, like the messages they sit under. Who reacted is visible, which is
-- deliberate and worth being aware of: a reaction is a public act here, not an
-- anonymous vote.
drop policy if exists "anyone may read reactions" on public.message_reactions;
create policy "anyone may read reactions"
  on public.message_reactions for select to anon, authenticated using (true);

-- No insert, update or delete policy for any role. Writing happens in
-- api/chat/reactions.js with the service role key, behind the sign-in cookie.

/*
 * Realtime, so a reaction appears without a reload.
 *
 * Guarded, like 0005's. On a delete, Postgres publishes only the replica
 * identity - which for this table is the primary key, and the primary key here
 * is every column that matters. So a removal arrives with its message, its
 * author and its emoji, and the browser can undo it without a round trip.
 */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;
