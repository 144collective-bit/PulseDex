-- A profile that is worth visiting: a picture, a line about yourself, links.
--
-- Run after 0003_profiles_and_blocking.sql, against the same project. Safe to
-- run twice.
--
-- Everything added here is published. The handle and the preset avatar already
-- were, but those are a word and a choice from a list of eight; a photograph
-- and a free-text bio are the point at which a profile stops being a label on
-- a message and starts being something a stranger can learn about you from.
-- That is the intended feature, and it is worth saying plainly in the schema
-- that these columns are readable by anyone with the anon key - which is
-- everyone, because it ships in the bundle.

-- ── Picture ─────────────────────────────────────────────────────────────────

/*
 * The public URL of an uploaded picture, in Supabase Storage.
 *
 * A URL rather than the image, deliberately. Postgres would hold a 40KB data
 * URL happily enough, but every message in the chat joins this table, so the
 * picture would be re-sent with every page of fifty messages and again with
 * every realtime insert. Storage puts it behind a CDN that the browser caches
 * once.
 *
 * The check is a backstop, not the control - api/profile/avatar.js decides
 * what may be written. It exists so that whatever goes wrong upstream, this
 * column cannot come to hold a `javascript:` URL that some future component
 * drops into an <img src> without looking.
 */
alter table public.profiles
  add column if not exists avatar_url text
    check (avatar_url is null or (avatar_url like 'https://%' and char_length(avatar_url) <= 500));

-- ── Bio ─────────────────────────────────────────────────────────────────────

-- The same 300 as MAX_BIO_LENGTH in src/utils/profileFields.js. If the two
-- disagree, a bio the app accepted becomes a database error rather than a
-- sentence explaining what went wrong.
alter table public.profiles
  add column if not exists bio text check (char_length(bio) <= 300);

-- ── Links ───────────────────────────────────────────────────────────────────

/*
 * Up to three links, each `{ "url": ..., "host": ... }`.
 *
 * jsonb rather than a side table because they are read only as a whole, always
 * with the profile, and never queried across accounts - the shape a side table
 * pays for buys nothing here.
 *
 * `host` is stored alongside `url` because it is what the interface displays.
 * Deriving it at render time would work, but then it is derived in every place
 * that renders one, and the day somebody displays a label the account supplied
 * instead is the day a link reading "pulsex.com" leads somewhere else. Storing
 * the host means no such label exists to be displayed.
 */
alter table public.profiles
  add column if not exists links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 3);

-- ── Storage ─────────────────────────────────────────────────────────────────

/*
 * The `avatars` bucket is NOT created here, and that is not an oversight.
 *
 * Storage buckets live in the `storage` schema, which this SQL editor session
 * can write to only as the project owner - so an `insert into storage.buckets`
 * here either works or fails with a permissions error depending on who pasted
 * it, which is the worst kind of migration step. api/profile/avatar.js creates
 * the bucket on first use instead, with the service role key, which can always
 * do it. Nothing to set up by hand.
 */
