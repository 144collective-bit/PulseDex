-- A banner image on a profile.
--
-- Run after 0008_follows_and_replies.sql, against the same project. Safe to
-- run twice.
--
-- Public, like everything else on a profile: this column exists to be rendered
-- at the top of a page anybody can open.

/*
 * The public URL of an uploaded banner, in Supabase Storage.
 *
 * A URL rather than the image, for the same reason the avatar is. Every read
 * of a profile would otherwise carry a few hundred kilobytes of base64, and
 * Storage puts it behind a CDN the browser caches once.
 *
 * Null means no banner, and the page draws one from the address instead - so
 * an account that never uploads anything still has a distinguishable page, and
 * this column is an upgrade rather than a requirement.
 *
 * The check is a backstop rather than the control; api/_routes/profile/banner.js
 * decides what may be written. It exists so that whatever goes wrong upstream,
 * this column cannot come to hold a `javascript:` URL that some future
 * component drops into a background without looking.
 */
alter table public.profiles
  add column if not exists banner_url text
    check (banner_url is null or (banner_url like 'https://%' and char_length(banner_url) <= 500));
