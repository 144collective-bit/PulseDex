# Migrations

Every file in `supabase/migrations/` is run by hand, in the Supabase SQL
editor, in numeric order. There is no migration runner in this project and
that is a deliberate consequence of where it is deployed: the app is a static
bundle plus serverless functions, neither of which has a place to run one from
or a lock to run it under.

All of them are safe to run twice. That is not a convention, it is a
requirement — with no runner there is no record of what has been applied, so
the only way to be sure is to be able to run everything again.

## Running order

| File | What it adds | Run |
| --- | --- | --- |
| `0001_chat.sql` | profiles, messages | yes |
| `0002_rooms.sql` | the fixed five, as a shape check | yes |
| `0003_profiles_and_blocking.sql` | blocking | yes |
| `0004_profile_fields.sql` | bio, links, avatar | yes |
| `0005_posts.sql` | posts | yes |
| `0007_chat_reactions.sql` | reactions | yes |
| `0008_follows_and_replies.sql` | follows, post replies | yes |
| `0009_profile_banner.sql` | banners | yes |
| `0010_notifications.sql` | mentions, notifications | yes |
| `0011_room_reads.sql` | unread counts | yes |
| `0012_message_replies.sql` | reply-to on messages | yes |
| `0013_message_search.sql` | the trigram index | yes |
| `0014_token_rooms.sql` | `rooms` as a table | yes |
| `0015_token_claims.sql` | the dev claim | yes |
| `0016_groups_and_gating.sql` | groups, holders-only | yes |
| `0017_message_reply_fk.sql` | repairs the reply foreign key | **not yet** |
| `0018_room_admin.sql` | archiving a room, gate history | **not yet** |

There is no `0006`, and this file does not know why - the number is simply
absent from `supabase/migrations/`. Left as a gap rather than renumbering,
because the files are referred to by number in commit messages and in the
comments at the top of the later migrations, and renumbering would make every
one of those references point at the wrong file.

## The two outstanding ones

**`0017_message_reply_fk.sql` must run before the current branch merges.**
Without it every room reports that it could not be loaded. `0012` created the
`reply_to` column and its foreign key in one statement:

```sql
alter table public.messages
  add column if not exists reply_to bigint references public.messages(id)
  on delete set null;
```

`add column if not exists` is one statement and the `references` clause is
part of it, so on a database where the column already exists the whole thing
is skipped — the constraint included, and silently. The chat reads every
message with an embed that names that constraint, so the schema cache has
nothing to resolve it against.

The lesson worth keeping past this file: **a constraint an application names
by string should be created by that name, in its own statement**, not left to
Postgres's default naming as a side effect of a column definition.

**`0018_room_admin.sql` is required, not optional.** It adds
`archived_at`/`archived_by` to `rooms`, narrows the anon read policy to live
rooms, and creates `room_gate_changes`.

`ROOM_FIELDS` in `src/config/queries.js` selects `archived_at`, because the
browser filters archived rooms out as well as the policy - two cheap checks
beat one that is right only after somebody has run a migration by hand. A
select naming a column that does not exist fails outright, and every room read
goes through that string, so **without this migration the room list and the
token page's chat tab will not load.**

That is the same failure shape as the missing reply key above, deliberately
so: it fails loudly, at a named place, rather than working in a way that
quietly lists rooms nobody can post in. `/api/health` names the column.

## Checking one ran

Each file ends with a query that says whether it worked, without deploying
anything. `api/_routes/health.js` is the other half: it runs every select
string in `src/config/queries.js` against the real database and names the one
that failed, which is what turns "the rooms will not load" into "this
constraint is missing".
