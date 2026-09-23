-- Groups, and holders-only rooms.
--
-- Run after 0015_token_claims.sql, against the same project. Safe to run
-- twice.
--
-- Two additions to `rooms` that look separate and are not. A group is a room
-- somebody made; a gate is a rule about who may write in a room. They arrive
-- together because the first thing anybody wants a group for is a room only
-- holders can post in, and because both are the same column family on the
-- same table.

/*
 * A third kind.
 *
 * `fixed` is the five in src/config/rooms.js. `token` is one per address,
 * created by the first message posted in it. `group` is made by a person, has
 * a name they chose, and does not exist until somebody creates it - which is
 * the difference that matters: a token room's name proves what it is about,
 * and a group's name proves nothing, so a group has to be created
 * deliberately rather than conjured by posting.
 */
do $$
begin
  alter table public.rooms drop constraint if exists rooms_kind_known;
  alter table public.rooms
    add constraint rooms_kind_known check (kind in ('fixed', 'token', 'group'));
end $$;

/*
 * Holders-only.
 *
 * `min_balance` is numeric(78,0) rather than bigint, and that is not caution:
 * a uint256 has 78 digits and a bigint holds 19. A gate of a thousand tokens
 * with eighteen decimals is 10^21 base units, which overflows a bigint on the
 * first realistic example.
 *
 * Stored in base units, always. The human amount somebody typed is converted
 * once, at creation, by the endpoint that read the token's own `decimals()` -
 * so a comparison at post time is two integers and never a rescaling.
 *
 * `gate_decimals` and `gate_symbol` are the chain's answers at that moment,
 * kept so the room can say "1,000 PLSX" without a node call on every render.
 * They are display only. Nothing is ever decided from them.
 */
alter table public.rooms
  add column if not exists gate_token text,
  add column if not exists min_balance numeric(78, 0),
  add column if not exists gate_decimals smallint,
  add column if not exists gate_symbol text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_gate_shape') then
    alter table public.rooms
      add constraint rooms_gate_shape
        check (gate_token is null or gate_token ~ '^0x[0-9a-f]{40}$');
  end if;

  /* A gate is a token and an amount together. Either alone is a row that
     reads as gated to one query and open to another. */
  if not exists (select 1 from pg_constraint where conname = 'rooms_gate_complete') then
    alter table public.rooms
      add constraint rooms_gate_complete
        check ((gate_token is null) = (min_balance is null));
  end if;

  /* Zero is not a gate - every address holds zero of every token - and a row
     saying so would render as a restriction that restricts nobody. */
  if not exists (select 1 from pg_constraint where conname = 'rooms_gate_positive') then
    alter table public.rooms
      add constraint rooms_gate_positive
        check (min_balance is null or min_balance > 0);
  end if;

  /*
   * A group's slug carries its own prefix, for the same reason a token
   * room's does: the prefix is what tells the app which rules apply without
   * a database round trip. `group-` plus two to twenty-four characters.
   */
  if not exists (select 1 from pg_constraint where conname = 'rooms_group_slug_shape') then
    alter table public.rooms
      add constraint rooms_group_slug_shape
        check (kind <> 'group' or slug ~ '^group-[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$');
  end if;

  /* A group has a name somebody typed. A token room deliberately never does
     - see src/config/rooms.js - and the five have theirs from the config. */
  if not exists (select 1 from pg_constraint where conname = 'rooms_group_named') then
    alter table public.rooms
      add constraint rooms_group_named
        check (kind <> 'group' or (name is not null and length(btrim(name)) between 2 and 40));
  end if;
end $$;

/*
 * Nothing here says which kinds of room may be gated.
 *
 * A group may gate on any token. A token room could be gated on the token it
 * is about, which is an appealing idea and a product decision nobody has
 * made - so this migration does not make it for them. The columns are on
 * `rooms`, and which rooms get them filled in is the endpoint's business.
 */

/* Listing the groups, which the sidebar does on every visit. */
create index if not exists rooms_groups_idx
  on public.rooms (last_message_at desc nulls last)
  where kind = 'group';

/*
 * `note_room_message` learns about groups.
 *
 * It derives the kind from the slug when it inserts, and before this a slug
 * beginning `group-` would have been filed as `fixed` - which the new check
 * constraint would then refuse, making the first post into a group fail with
 * a constraint violation rather than a sentence.
 *
 * In practice the insert branch never fires for a group: one is created by a
 * moderator, so the row already exists and this only bumps its counters. The
 * branch is corrected anyway, because "in practice never" is how a thing
 * stays broken until the day it is not.
 */
create or replace function public.note_room_message(room_slug text, author text)
returns void
language plpgsql
as $$
begin
  insert into public.rooms (slug, kind, token_address, created_by, message_count, last_message_at)
  values (
    room_slug,
    case
      when room_slug like 'token-%' then 'token'
      when room_slug like 'group-%' then 'group'
      else 'fixed'
    end,
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
 * Still no insert policy on `rooms`, and now it matters more.
 *
 * Creating a group goes through api/_routes/rooms/groups.js, which checks
 * that the caller is a moderator. A gate is a column on the same row, so an
 * insert or update policy here would let the anon key in the bundle create a
 * group, or - worse - remove the gate from somebody else's.
 *
 * The select policy from 0014 stays as it is: which rooms exist is public,
 * and so is what they are gated on. A gate nobody can see is a room people
 * are refused from for reasons they cannot read.
 */
