-- A profile worth visiting: a pinned post, a wallet's age, and holdings the
-- account chooses to show.
--
-- Run after 0018_room_admin.sql, against the same project. Safe to run twice.
--
-- Everything added here is readable with the anon key, which ships in the
-- bundle - so it is readable by everyone. That is stated plainly because one
-- of these columns is a switch about somebody's money, and a schema comment
-- is the last place anybody reads before deciding what to put in it.

-- ── A pinned post ───────────────────────────────────────────────────────────

/*
 * Which of their own posts this account wants at the top of their page.
 *
 * On `profiles` rather than a flag on `posts`, because the rule being
 * expressed is "one per account" and that is what a single column on the
 * account enforces. A boolean on `posts` would allow two, and the day it
 * allowed two is the day the page has to pick one and nobody can say which.
 */
alter table public.profiles
  add column if not exists pinned_post_id bigint;

/*
 * The foreign key, in its own statement, deliberately.
 *
 * `add column if not exists ... references ...` is ONE statement and the
 * `references` clause is part of it, so on a database where the column
 * already exists the whole thing is skipped - the constraint included, and
 * silently. That is not a hypothetical: it is exactly what 0012 did to
 * `messages.reply_to`, and 0017 exists to repair it. Every room in the app
 * reported that it could not be loaded, for a day, because of it.
 *
 * So: the column above, the constraint here, guarded on its own name. And the
 * name is given rather than left to Postgres, because a constraint an
 * application might name by string should be created by that name rather than
 * inherited as a side effect of a column definition.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_pinned_post_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_pinned_post_fkey
      foreign key (pinned_post_id) references public.posts(id) on delete set null;
  end if;
end $$;

/*
 * `on delete set null` covers a hard delete and does nothing for the ordinary
 * case, which is worth saying so nobody relies on it.
 *
 * Posts are removed by setting `deleted_at`, not by deleting the row - that is
 * what keeps a reply's parent readable and a moderator's decision auditable.
 * So a pinned post that has been taken down still satisfies this constraint
 * and still sits in this column. The read is what has to cope: every path that
 * loads a pinned post filters `deleted_at is null` and treats a removed one as
 * no pin at all. See fetchPinnedPost in src/services/profile.js.
 */

-- ── Wallet age ──────────────────────────────────────────────────────────────

/*
 * When the chain first saw this address.
 *
 * Cached here because it is immutable. An address's first transaction does not
 * change, ever, so this is written once per account and read from then on -
 * which is the difference between a profile page that costs one database read
 * and one that costs an explorer round trip for every visitor.
 *
 * Null means "not looked up yet", not "new". The two are very different to
 * anybody reading the page, and the interface says nothing rather than
 * guessing - see walletAgeLabel in src/utils/walletAge.js.
 *
 * This is shown on every profile by default, and that is the privacy decision
 * of this migration, taken deliberately:
 *
 *   A date is not a balance. "First seen March 2024" says nothing about what
 *   somebody holds or what they did, and it is the single most useful thing a
 *   reader can know about an account on a site where the main risk is being
 *   talked into a token by a wallet that was created this morning. It fights
 *   impersonation, which is the harm this app is most exposed to.
 *
 *   Holdings are the opposite, and are opt-in below.
 */
alter table public.profiles
  add column if not exists first_seen_at timestamptz;

/*
 * When we last asked, whether or not we got an answer.
 *
 * Without this a lookup that fails is a lookup that is retried by every
 * visitor to that page forever. The explorer is a public API with its own
 * limits and our own fail-closed behaviour, so the failure case has to be
 * remembered as well as the success case - otherwise one address the explorer
 * does not know about becomes a steady outbound request per page view.
 */
alter table public.profiles
  add column if not exists first_seen_checked_at timestamptz;

-- ── Holdings, opt-in ────────────────────────────────────────────────────────

/*
 * Whether this account wants its token holdings shown on its page.
 *
 * Default false, and the default is the decision.
 *
 * The argument for true is that none of this is secret: balances are on the
 * chain, and a block explorer will show anybody's to anybody. The argument
 * that wins is that publishing them here does not change what is knowable, it
 * changes what is *findable*. Today you need somebody's address to look at
 * their money. Bound to a handle and drawn on a page, their money is reachable
 * by name - by anyone who read one of their posts, and by anyone deciding
 * whether they are worth robbing.
 *
 * That is a real change in exposure and it is not ours to make on somebody's
 * behalf, so it is a switch they throw. An account that wants to show its
 * conviction can; an account that posts under a handle keeps the pseudonymity
 * the chain already gave it.
 *
 * Reversible, and reversible immediately: turning it off hides the panel on
 * the next read. What it cannot do is un-see anything already seen, and the
 * toggle in the interface says so rather than implying a privacy it cannot
 * deliver.
 */
alter table public.profiles
  add column if not exists show_holdings boolean not null default false;

-- ── The follow graph's foreign keys, asserted rather than assumed ───────────

/*
 * This migration adds nothing to `follows`. It checks something.
 *
 * Batch 2 makes followers and following into browsable lists, which means
 * reading `follows` with the profile attached - and `follows` reaches
 * `profiles` twice, through `follower` and through `followee`. PostgREST
 * refuses to guess between two paths, so the select has to name the
 * constraint: `profiles!follows_follower_fkey`.
 *
 * Those names were never written down. 0008 declared both columns with inline
 * `references`, so the names are whatever Postgres generated - and this
 * project has already been taken down once by relying on a constraint name it
 * never stated. So the names are verified here, loudly, at the one moment
 * somebody is watching: if they are not what the application asks for, this
 * raises rather than leaving a profile page to fail in production.
 */
do $$
declare
  missing text;
begin
  select string_agg(want, ', ')
    into missing
    from (values ('follows_follower_fkey'), ('follows_followee_fkey')) as wanted(want)
   where not exists (
     select 1
       from pg_constraint
      where conname = wanted.want
        and conrelid = 'public.follows'::regclass
   );

  if missing is not null then
    raise exception
      'follows is missing the foreign key name(s) the app selects by: %. '
      'src/config/queries.js names these in FOLLOW_PROFILE_FIELDS. Rename the '
      'existing constraints to match rather than adding new ones.', missing;
  end if;
end $$;

-- ── Did it work? ────────────────────────────────────────────────────────────

/*
 * The same shape as every other migration here: one query that says whether
 * this ran, without deploying anything.
 *
 * Four rows, all true, is a pass. api/_routes/health.js is the other half -
 * it runs the application's real select strings against this database and
 * names the one that failed, which is what turns "the profile will not load"
 * into "this column is missing".
 */
select
  'pinned_post_id'        as column_name,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'pinned_post_id') as present
union all
select 'first_seen_at',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'first_seen_at')
union all
select 'first_seen_checked_at',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'first_seen_checked_at')
union all
select 'show_holdings',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'show_holdings');
