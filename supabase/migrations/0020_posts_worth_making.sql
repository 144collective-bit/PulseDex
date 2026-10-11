-- Posts worth making: an image, an edit, a quote, a reaction, a bookmark, and
-- a cache for link previews.
--
-- Run after 0019_profile_depth.sql, against the same project. Safe to run
-- twice.
--
-- Six things, and they divide cleanly by who can read them. The image, the
-- edit stamp, the quote and the reactions are all published - readable with
-- the anon key, which ships in the bundle, which means readable by everyone.
-- Bookmarks are the first private thing in this schema and are handled as
-- such: no read policy for any browser-facing role at all.

-- ── An image on a post ──────────────────────────────────────────────────────

/*
 * The public URL of an image in Supabase Storage.
 *
 * A URL rather than the bytes, exactly as `profiles.avatar_url` is, and for a
 * sharper version of the same reason: a feed is fifty posts, and an image held
 * in Postgres would be re-sent with every page of them and again with every
 * realtime insert. Storage puts it behind a CDN the browser caches once.
 *
 * The check is a backstop and not the control - api/_routes/posts/image.js
 * decides what may be written here. It exists so that whatever goes wrong
 * upstream, this column cannot come to hold a `javascript:` URL that some
 * future component drops into an <img src> without looking.
 */
alter table public.posts
  add column if not exists image_url text
    check (image_url is null or (image_url like 'https://%' and char_length(image_url) <= 500));

/*
 * How big it is, so the page can keep the space before it arrives.
 *
 * Stored rather than measured on load, and this is the one piece of this
 * migration that is purely about how the page feels. A feed that reserves no
 * room for an image reflows every time one decodes: you start reading a post
 * and it jumps up the screen. Knowing the aspect ratio up front means the box
 * is the right shape from the first paint.
 *
 * Bounded by the longest edge the browser produces (see postImage.js), with
 * room to spare rather than exactly - a tighter check would turn a change to
 * the output size into a constraint violation on the next upload.
 */
alter table public.posts
  add column if not exists image_w integer check (image_w is null or image_w between 1 and 4096);

alter table public.posts
  add column if not exists image_h integer check (image_h is null or image_h between 1 and 4096);

/*
 * All three together or none of them.
 *
 * A URL with no dimensions is a box the page cannot reserve; dimensions with
 * no URL is nothing at all. Both halves are written by one statement in one
 * endpoint, so this constraint should never fire - which is exactly when a
 * constraint is worth having, because the day it does fire is the day
 * something is writing this column that nobody remembered about.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_image_shape'
  ) then
    alter table public.posts
      add constraint posts_image_shape
      check (
        (image_url is null and image_w is null and image_h is null)
        or (image_url is not null and image_w is not null and image_h is not null)
      );
  end if;
end $$;

-- ── An edit window ──────────────────────────────────────────────────────────

/*
 * When a post was last changed, or null if it never was.
 *
 * The roadmap said this column already existed. It did not: 0007 added
 * `edited_at` to `messages`, and nothing ever added it to `posts`. Worth
 * recording, because the plan was written confidently and a plan that is
 * wrong about the schema is how a feature gets built against a column that
 * is not there.
 *
 * A column rather than silently rewriting `body`, for the reason 0007 gave
 * about messages and which is stronger here: an edit that leaves no trace is
 * a way to change what you said after somebody replied to it or quoted it. On
 * a site where people talk about what to buy, "I said sell" after the fact is
 * worth money. The interface shows an "edited" marker whenever this is set,
 * and that marker is the whole point of the column.
 */
alter table public.posts
  add column if not exists edited_at timestamptz;

-- ── Quote posts ─────────────────────────────────────────────────────────────

/*
 * The post this one is quoting, if any.
 *
 * A column on `posts` rather than a table of its own, the same call 0008 made
 * for replies and for the same reason: a quote post is a post. It has the same
 * body rules, the same author, the same removal and reporting paths, and
 * belongs in the same feed. A second table would be this table with a column
 * added and every one of those behaviours written out again beside it.
 *
 * Distinct from `parent_id`, which is a reply. A reply lives under the post it
 * answers and is not in the main feed; a quote is a post of its own, in the
 * feed, that happens to carry somebody else's words. Conflating them would
 * mean either quotes vanish from the feed or replies appear in it twice.
 */
alter table public.posts
  add column if not exists quote_id bigint;

/*
 * The foreign key in its own statement, guarded on its own name.
 *
 * `add column if not exists ... references ...` is ONE statement, so on a
 * database where the column already exists the whole thing is skipped - the
 * constraint included, and silently. That is what 0012 did to
 * `messages.reply_to`, what 0017 exists to repair, and what 0019 avoided the
 * same way for `pinned_post_id`. Third time stating it, because the trap does
 * not get less sharp for being known.
 *
 * `on delete set null` and not cascade: quoting somebody must not mean a hard
 * delete of their post takes yours with it. The ordinary removal is a
 * `deleted_at` stamp, which this constraint never sees - so the read is what
 * copes, and a quote whose target was taken down renders as "that post is not
 * here" rather than as a gap. See fetchPost and QUOTE_FIELDS.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_quote_fkey'
  ) then
    alter table public.posts
      add constraint posts_quote_fkey
      foreign key (quote_id) references public.posts(id) on delete set null;
  end if;
end $$;

/*
 * A post cannot quote itself.
 *
 * Refused in the schema rather than only in the endpoint, because it is a rule
 * about the data and not about a request - and because a self-quote is an
 * infinite render for anything that draws a quote inside a quote.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_quote_not_self'
  ) then
    alter table public.posts
      add constraint posts_quote_not_self check (quote_id is null or quote_id <> id);
  end if;
end $$;

-- Reading "who quoted this post", which is what a quote count needs. Partial,
-- because the overwhelming majority of posts quote nothing and have no
-- business taking up space in this index.
create index if not exists posts_quote_idx
  on public.posts (quote_id)
  where deleted_at is null and quote_id is not null;

-- ── Reactions on posts ──────────────────────────────────────────────────────

/*
 * One row per person per emoji per post. The same shape as
 * `message_reactions` in 0007, deliberately identical so that the two cannot
 * drift in behaviour: same primary key, same cap on `emoji`, same public read.
 *
 * `emoji` is capped at 8 characters rather than 1 - one emoji can be several
 * code points once skin tones and zero-width joiners are involved. The real
 * constraint is not here: the endpoint only accepts values from the fixed list
 * in src/config/reactions.js, because a free-text column rendered beside
 * somebody else's post is a way to publish arbitrary text without it being a
 * post - past the length limit, past the rate limit, and onto every screen.
 */
create table if not exists public.post_reactions (
  post_id    bigint not null references public.posts(id) on delete cascade,
  address    text not null references public.profiles(address) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (post_id, address, emoji)
);

/*
 * Two reads, two indexes.
 *
 * The primary key leads with `post_id`, which serves "the reactions on this
 * page of posts". The profile's Reacted tab asks the other question - "which
 * posts has this account reacted to", newest first - and that leads with the
 * address. Without this index that tab is a full scan of every reaction in the
 * table.
 */
create index if not exists post_reactions_address_idx
  on public.post_reactions (address, created_at desc);

alter table public.post_reactions enable row level security;

/*
 * Public, like the posts they sit under, and worth saying plainly because
 * Batch 3 makes it visible in a new way: 0007 made who-reacted-to-what
 * readable, and a profile tab listing somebody's reactions is that fact
 * becoming a page. A reaction here is a public act, not an anonymous vote.
 */
drop policy if exists "anyone may read post reactions" on public.post_reactions;
create policy "anyone may read post reactions"
  on public.post_reactions for select to anon, authenticated using (true);

-- No insert, update or delete policy for any role. Writing happens in
-- api/_routes/posts/reactions.js with the service role key, behind the
-- sign-in cookie.

/*
 * Realtime, so a reaction appears without a reload.
 *
 * Guarded, like 0005's and 0007's. On a delete Postgres publishes only the
 * replica identity, which for this table is the primary key - and the primary
 * key here is every column that matters, so a removal arrives with its post,
 * its author and its emoji and the browser can undo it without a round trip.
 */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_reactions'
  ) then
    alter publication supabase_realtime add table public.post_reactions;
  end if;
end
$$;

-- ── Bookmarks, which are private ────────────────────────────────────────────

/*
 * What somebody saved to read later.
 *
 * The first private table in this schema, and it is handled the way
 * `notifications` is rather than the way everything else is. The reason is
 * written down in 0010 and bears repeating here because it is the thing most
 * likely to be got wrong by whoever adds the next private feature:
 *
 *   Sign-in on this site is a wallet signature and a JWT this app sets in an
 *   httpOnly cookie. It is NOT Supabase auth. So `auth.uid()` is null in every
 *   request the browser makes, and row level security cannot express "your own
 *   rows" - there is no identity for it to compare against.
 *
 * Which means a policy like `using (address = auth.uid())` would not restrict
 * this table, it would empty it. The only correct answer is no browser-facing
 * read policy at all, and every read going through an endpoint that holds the
 * service role key and knows who is asking from the cookie.
 *
 * A bookmark being private is the point of it. "Saved to read later" is a list
 * of what somebody is interested in but has not said anything about, which on
 * a site about which tokens to buy is a more revealing list than their posts.
 */
create table if not exists public.post_bookmarks (
  address    text not null references public.profiles(address) on delete cascade,
  post_id    bigint not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Address first, because every read of this table is one account's list.
  -- The pair as the key is what makes saving idempotent: twice is one row.
  primary key (address, post_id)
);

-- Newest first, which is how a saved list reads. The primary key leads with
-- address but orders by post_id within it, which is insertion order by
-- coincidence rather than by meaning - so the ordering column is stated.
create index if not exists post_bookmarks_recent_idx
  on public.post_bookmarks (address, created_at desc);

alter table public.post_bookmarks enable row level security;

/*
 * No policy. None, for any role, read or write.
 *
 * With row level security enabled, an operation no policy permits is refused -
 * so the anon key that ships in the bundle can do nothing here at all, which
 * is the entire security model for this table. Reads and writes go through
 * api/_routes/posts/bookmarks.js.
 *
 * This blank space is deliberate and is not an omission. If somebody later
 * adds `using (true)` to make a query work from the browser, they will have
 * published every bookmark on the site.
 */

-- Deliberately NOT added to the realtime publication. Realtime is a
-- browser-facing subscription authorised by the anon key, and this table's
-- whole premise is that the anon key cannot see it.

-- ── Link previews ───────────────────────────────────────────────────────────

/*
 * What a linked page says about itself, fetched once by us and kept.
 *
 * The reason this is server-side is the reader, not the writer. A preview
 * rendered by fetching the page from the browser - or by loading the target's
 * og:image into an <img> - tells the linked site the IP address of everybody
 * who scrolled past the post. On a site where a post might link to a token's
 * page, that is a list of this app's readers handed to whoever wrote the link.
 *
 * So our server fetches it, once, and every reader gets our copy. Which makes
 * this table the cache that keeps "once" true.
 *
 * Keyed by a hash of the URL rather than the URL itself, because a URL can be
 * longer than an index can key on, and because the hash is a fixed-width
 * primary key. The URL is stored alongside for whoever reads this table.
 */
create table if not exists public.link_previews (
  -- sha256 of the normalised URL, hex. 64 characters, always.
  url_hash    text primary key check (char_length(url_hash) = 64),
  url         text not null check (char_length(url) <= 2000),
  title       text check (char_length(title) <= 300),
  description text check (char_length(description) <= 500),
  site_name   text check (char_length(site_name) <= 100),
  /*
   * Whether the fetch worked.
   *
   * False is a cached failure and is as valuable as a cached success: without
   * it, a URL that times out is re-fetched by our server for every reader who
   * scrolls past the post, forever.
   */
  ok          boolean not null default false,
  fetched_at  timestamptz not null default now()
);

/*
 * There is deliberately no `image_url` column.
 *
 * An og:image is the obvious thing to put in a preview and it is the one thing
 * that would undo this table's reason for existing. Rendering it means the
 * reader's browser requests it from the linked site, which hands that site the
 * reader's IP address, their user agent and a referrer - which is precisely
 * what fetching the preview on the server avoids. Re-hosting the image would
 * work and is a second storage bucket, a second moderation surface and a
 * second thing to take down when somebody links to something vile.
 *
 * So previews are text. If an image is ever wanted here, re-host it; do not
 * add a column that holds somebody else's URL and hand it to an <img>.
 */

alter table public.link_previews enable row level security;

/*
 * Public read. This holds what a public page says about itself, fetched from
 * a public URL - there is nothing in it that belongs to anybody, and the
 * browser reads it directly so that drawing a feed is one query rather than
 * one request per link.
 */
drop policy if exists "anyone may read link previews" on public.link_previews;
create policy "anyone may read link previews"
  on public.link_previews for select to anon, authenticated using (true);

-- No write policy for any role. Writing happens in
-- api/_routes/links/preview.js with the service role key - which is the only
-- place that is allowed to make the outbound request in the first place.

-- Stale rows, for a refetch. Partial on the successes, because a failed row is
-- retried on a schedule of its own.
create index if not exists link_previews_fetched_idx
  on public.link_previews (fetched_at)
  where ok;

-- ── Did it work? ────────────────────────────────────────────────────────────

/*
 * One query that says whether this ran, without deploying anything - the same
 * shape every migration here ends with.
 *
 * Seven rows, all true, is a pass. api/_routes/health.js is the other half: it
 * runs the application's real select strings against this database and names
 * the one that failed.
 */
select 'posts.image_url' as thing,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'posts'
             and column_name = 'image_url') as present
union all
select 'posts.edited_at',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'posts'
             and column_name = 'edited_at')
union all
select 'posts.quote_id',
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'posts'
             and column_name = 'quote_id')
union all
select 'posts_quote_fkey',
  exists (select 1 from pg_constraint where conname = 'posts_quote_fkey')
union all
select 'post_reactions',
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'post_reactions')
union all
select 'post_bookmarks',
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'post_bookmarks')
union all
select 'link_previews',
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'link_previews');
