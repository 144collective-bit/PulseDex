-- Linking an X account to a PulseDex profile.
--
-- Run after 0005_posts.sql, against the same project. Safe to run twice.
--
-- Everything added here is public, and has to be - these columns exist to be
-- rendered next to somebody's name, and profiles is readable with the anon key
-- that ships in the bundle. Nothing secret is stored: no access token, no
-- refresh token, no email. What is kept is the same information anybody could
-- read by visiting the account on x.com. The only thing this table adds is the
-- assertion that this PulseDex account proved control of it.

-- ── The link ────────────────────────────────────────────────────────────────

/*
 * The numeric account id, as text.
 *
 * This is the link. Everything else below is a snapshot that can go stale; the
 * id is what identifies the account forever.
 *
 * Text rather than bigint because X ids are snowflakes past the range a
 * JavaScript number holds exactly - an id that rounds in transit is an id
 * pointing at somebody else, which is the one failure this whole feature
 * exists to prevent.
 */
alter table public.profiles
  add column if not exists x_user_id text check (x_user_id ~ '^[0-9]{1,25}$');

/*
 * One X account, one wallet.
 *
 * Without this, somebody could link a single X account to any number of
 * addresses and have every one of them display as the same well-known
 * project - which is the impersonation this feature is supposed to make
 * harder, arriving through the feature itself. Unlinking frees it.
 */
create unique index if not exists profiles_x_user_id_unique
  on public.profiles (x_user_id)
  where x_user_id is not null;

-- ── The snapshot ────────────────────────────────────────────────────────────

/*
 * Taken once, when the account is linked, and not refreshed.
 *
 * The alternative is storing a refresh token so these can be updated in the
 * background, which means holding long-lived credentials to every linked X
 * account. That is a much larger thing to lose in a breach than a handle
 * anybody can already read, and it buys a follower count that is a few weeks
 * fresher. `x_linked_at` is stored so the interface can say how old the
 * numbers are rather than implying they are live.
 */
alter table public.profiles
  add column if not exists x_handle text check (x_handle ~ '^[A-Za-z0-9_]{1,15}$');

alter table public.profiles
  add column if not exists x_name text check (char_length(x_name) <= 50);

/*
 * Which X subscription the account had at link time, or null.
 *
 * Constrained to the three tiers X reports, so an unexpected value from the
 * API cannot reach the column and be rendered as a badge. Note what this is
 * and is not: a paid subscription, not an identity check. Anybody may buy one,
 * including an account impersonating a project, which is why the interface
 * shows it apart from the handle rather than as one combined mark.
 */
alter table public.profiles
  add column if not exists x_verified_type text
    check (x_verified_type is null or x_verified_type in ('blue', 'business', 'government'));

alter table public.profiles
  add column if not exists x_followers integer check (x_followers is null or x_followers >= 0);

-- When the X account itself was created. The signal a subscription cannot buy:
-- an account opened last week is a different proposition from one opened in
-- 2013, whatever badge it carries.
alter table public.profiles
  add column if not exists x_account_created_at timestamptz;

-- When the link was made here, so the snapshot above can be shown with its age
-- rather than as though it were current.
alter table public.profiles
  add column if not exists x_linked_at timestamptz;
