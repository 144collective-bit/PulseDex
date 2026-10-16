-- Safety that scales past one person: mute, auto-hide, and an audit trail.
--
-- Run after 0020_posts_worth_making.sql, against the same project. Safe to run
-- twice.
--
-- Moderation here has been one human reading a queue, with no record of what
-- they did and no way for a reader to opt out of somebody without a moderator
-- being involved. This adds the three things that change, and one of them is a
-- decision reversed from an earlier batch - see the auto-hide section, which
-- says what changed and why.

-- ── Mute: a reader's own choice ─────────────────────────────────────────────

/*
 * Who one account has chosen not to see.
 *
 * Distinct from `blocked` in 0003 in every way that matters. A block is a
 * moderator stopping an account from posting, for everybody; a mute is one
 * reader deciding not to read somebody, for themselves. The muted account is
 * never told, loses nothing, and goes on posting to everyone else.
 *
 * Private, and handled the way `post_bookmarks` is rather than the way
 * `blocked` is - which is the same table shape for a different reason. The
 * blocklist is private because publishing it would be publishing a list of
 * accusations. This is private because "who I cannot stand" is a list about
 * the reader, not about the people on it, and a social site that published it
 * would be publishing the one thing nobody would ever opt into.
 *
 * So: no read policy for any browser-facing role, and the reasoning 0010 and
 * 0020 both wrote down applies again - sign-in here is a wallet signature and
 * a JWT in a cookie, NOT Supabase auth, so `auth.uid()` is null in every
 * browser request and a policy saying `using (address = auth.uid())` would not
 * restrict this table, it would empty it.
 */
/*
 * Both foreign keys are NAMED, rather than left to Postgres to generate.
 *
 * This table reaches `profiles` twice, so PostgREST refuses to guess between
 * them and api/_routes/mutes.js has to say which: `profiles!muted_muted_fkey`.
 * The generated names would be these anyway - but that is exactly what was
 * assumed about `follows` in 0008 and `post_reports` in 0005, and both times
 * the assumption had to be verified afterwards by a later migration because
 * nobody had written the name down. Writing it down costs two clauses.
 */
create table if not exists public.muted (
  -- The reader doing the muting.
  address    text not null constraint muted_address_fkey
               references public.profiles(address) on delete cascade,
  -- The account they would rather not see.
  muted      text not null constraint muted_muted_fkey
               references public.profiles(address) on delete cascade,
  created_at timestamptz not null default now(),
  -- Address first, because every read of this table is one reader's list. The
  -- pair as the key makes muting idempotent: twice is one row.
  primary key (address, muted),
  -- Muting yourself would hide your own posts from your own feed, which is a
  -- state with no way back from inside the interface.
  constraint muted_not_self check (address <> muted)
);

alter table public.muted enable row level security;

/*
 * No policy. None, for any role, read or write.
 *
 * With row level security enabled, an operation no policy permits is refused,
 * so the anon key that ships in the bundle can do nothing here at all. Reads
 * and writes go through api/_routes/mutes.js with the service role and an
 * address taken from the cookie.
 *
 * This blank space is deliberate and is not an omission. If somebody later
 * adds `using (true)` to make a query work from the browser, they will have
 * published everybody's mute list - which on a site where accounts are wallet
 * addresses is a public graph of who refuses to read whom.
 */

-- ── Auto-hide, pending review ──────────────────────────────────────────────

/*
 * When a post was taken out of the feed pending a moderator reading it.
 *
 * **This reverses a decision recorded in an earlier batch, so the reversal is
 * written down rather than quietly applied.** api/_routes/posts/report.js and
 * PostCard.jsx both said: "Nothing is done with a report automatically... an
 * endpoint that hid a post at some threshold of reports would be a brigading
 * tool wearing a safety feature's name." That was right about a plain count
 * and is the reason this is not one.
 *
 * What makes this version different is what has to be true before it fires:
 * several DISTINCT reporters, each of whose wallets the chain first saw more
 * than a month ago. 0019 already caches that date, so the check costs nothing.
 * A plain threshold can be reached by N people who dislike a post; this one
 * needs N aged wallets, which is a different kind of thing to arrange - and
 * the whole point is that it is expensive rather than merely against the
 * rules. See shouldAutoHide in src/utils/autoHide.js, which has a test per
 * branch.
 *
 * `hidden_by` is null when the system did it and an address when a moderator
 * did. Not a paired-null check like 0018's `rooms_archived_shape`, because
 * null here is meaningful rather than a half-written row: the two cases read
 * differently in the audit trail and on the page.
 */
alter table public.posts
  add column if not exists hidden_at timestamptz;

alter table public.posts
  add column if not exists hidden_by text
    check (hidden_by is null or hidden_by ~ '^0x[0-9a-f]{40}$');

/*
 * **A hide is a visibility measure and never a containment one.** Said here
 * because it is the thing most likely to be misread from the column name.
 *
 * The anon read policy on `posts` is `using (deleted_at is null)` and is
 * deliberately NOT narrowed to `hidden_at is null`. It cannot be: row level
 * security has no identity to compare against here, so a policy that hid these
 * rows would hide them from their own author too - and an author who is not
 * told their post is pending review has simply had it disappear.
 *
 * So a hidden post still comes back from the database, and what implements the
 * hide is the query filter in src/services/posts.js plus what the interface
 * draws. Anybody determined enough to read the database with the anon key can
 * still see it, exactly as they could before it was hidden.
 *
 * If a post needs to be genuinely unreadable, that is `deleted_at`, which the
 * policy does enforce. A moderator reaching for containment should remove.
 */

-- The feed and every profile list filter on this, so it rides on the same
-- partial indexes they already use. Only the hidden rows need an index of
-- their own, for the moderator queue that lists them.
create index if not exists posts_hidden_idx
  on public.posts (hidden_at desc)
  where deleted_at is null and hidden_at is not null;

-- ── An audit trail for every moderator action ──────────────────────────────

/*
 * What was done, to whom, by whom, and when.
 *
 * The gap this fills is named in src/utils/chatAdmin.js, which has said since
 * it was written that moderation is "a list of wallet addresses in an
 * environment variable... and there is no audit of who removed what". This is
 * that audit. The environment variable stays - a roles table is still a week
 * of work for a problem this site does not have - but the actions it authorises
 * are now recorded.
 *
 * One table for every kind of action rather than a column on each thing acted
 * on. A moderator asking "what happened on this account" wants one list in
 * time order, and five tables with five timestamps is five queries and a merge
 * done by hand. The things acted on keep their own state; this says who
 * changed it.
 */
create table if not exists public.moderation_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  /*
   * The moderator, or null when the system acted.
   *
   * Null is how an auto-hide is recorded, and the distinction matters more
   * than it looks: "this was hidden because three established accounts
   * reported it" and "this was hidden because a moderator read it" are
   * different facts about the same row, and a log that flattened them would
   * make the automatic case unauditable.
   *
   * No foreign key to `profiles`. A moderator is an address in an environment
   * variable and may never have posted, so may have no profile row - and a
   * log entry that could not be written because the actor had no profile is a
   * log with holes exactly where somebody was moderating without posting.
   */
  actor   text check (actor is null or actor ~ '^0x[0-9a-f]{40}$'),
  action  text not null check (
    action in (
      'block', 'unblock',
      'hide_post', 'unhide_post', 'auto_hide_post',
      'remove_post', 'remove_message',
      'remove_images',
      'revoke_claim',
      'archive_room', 'edit_room_gate'
    )
  ),
  /*
   * What was acted on. Both nullable, because the actions point at different
   * things - a block names an account and no post, a removal names a post.
   * The same shape 0010 gave `notifications`, for the same reason.
   *
   * No foreign keys here either, and this one is the important one: the log
   * has to outlive what it describes. A `references posts(id) on delete
   * cascade` would mean a hard delete of a post erased the record that
   * somebody removed it, which is precisely the record worth keeping.
   */
  subject_address text check (subject_address is null or subject_address ~ '^0x[0-9a-f]{40}$'),
  subject_post_id bigint,
  subject_room    text check (subject_room is null or char_length(subject_room) <= 48),
  /*
   * The moderator's note, never shown to anybody but a moderator.
   *
   * The same decision `blocked.reason` and `token_claims.revoked_reason` both
   * made: this is a note about a person, written by somebody with power over
   * them, and the anon key is readable by everybody. It exists for whoever
   * reads this table in six months.
   */
  note    text check (char_length(note) <= 300),
  /*
   * For an auto-hide: how many qualifying reports there were.
   *
   * Recorded at the time rather than recounted later, because the reports can
   * be deleted with their reporters' profiles and the question a reviewer asks
   * is "what did the system see when it acted", not "what is there now".
   */
  evidence integer check (evidence is null or evidence >= 0)
);

-- Read in time order, newest first, and filtered to one account or one post
-- when somebody is asking about one of those.
create index if not exists moderation_log_recent_idx on public.moderation_log (at desc);
create index if not exists moderation_log_subject_idx
  on public.moderation_log (subject_address, at desc)
  where subject_address is not null;

alter table public.moderation_log enable row level security;

/*
 * No policy, for any role. The same blank space as `blocked` and `muted`, and
 * the same reasoning as `blocked` specifically: this is a list of actions
 * taken against named wallet addresses, with a moderator's note attached. A
 * select policy would publish it to everybody including the people in it.
 *
 * Reads go through api/_routes/moderation/log.js, which is moderator-only.
 */

/*
 * Append-only by discipline, not by constraint.
 *
 * Worth saying plainly rather than implying: the service role can update and
 * delete anything, so nothing here makes this table immutable. What keeps it
 * append-only is that exactly one module writes it - logAction in
 * api/_lib/moderation.js - and that module only inserts. A trigger refusing
 * updates would be worth adding the day somebody other than that module needs
 * to write here.
 */

-- ── The report graph's foreign key, asserted rather than assumed ───────────

/*
 * This migration adds nothing to `post_reports`. It checks something, exactly
 * as 0019 does for `follows`, and for the same reason it was worth doing there.
 *
 * Auto-hide has to read a post's reporters with each reporter's `first_seen_at`
 * attached, which is `post_reports` embedding `profiles`. PostgREST can get
 * from one to the other two ways - directly through `reporter`, or treating
 * `posts` as a junction - and refuses to guess, so api/_lib/moderation.js
 * names the constraint: `profiles!post_reports_reporter_fkey`.
 *
 * That name was never written down. 0005 declared the column with an inline
 * `references`, so it is whatever Postgres generated. This project has been
 * taken down twice by relying on a constraint name it never stated, so the
 * name is verified here, loudly, while somebody is watching - rather than
 * leaving the first report after this deploys to be the thing that finds out.
 */
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'post_reports_reporter_fkey'
       and conrelid = 'public.post_reports'::regclass
  ) then
    raise exception
      'post_reports is missing the foreign key name the app selects by: '
      'post_reports_reporter_fkey. api/_lib/moderation.js names it in '
      'maybeAutoHide. Rename the existing constraint to match rather than '
      'adding a new one.';
  end if;
end $$;

-- ── Did it work? ────────────────────────────────────────────────────────────

/*
 * One query that says whether this ran, without deploying anything - the same
 * shape every migration here ends with. Four rows, all true, is a pass.
 */
select 'muted' as thing,
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'muted') as present
union all
select 'moderation_log',
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'moderation_log')
union all
select 'posts.hidden_at',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'posts'
             and column_name = 'hidden_at')
union all
select 'posts.hidden_by',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'posts'
             and column_name = 'hidden_by');
