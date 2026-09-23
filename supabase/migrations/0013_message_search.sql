-- Searching what was said in a room.
--
-- Run after 0012_message_replies.sql, against the same project. Safe to run
-- twice.

/*
 * Trigram matching, so `ilike '%term%'` can use an index.
 *
 * Without this, searching a room is a sequential scan of every message in it.
 * That is genuinely fine at the size this is now - a few thousand rows answer
 * in single-digit milliseconds - and it stops being fine quietly, in the one
 * room that got popular, on the day somebody types into the box while two
 * hundred thousand messages sit behind it.
 *
 * A B-tree cannot help: it can find a prefix, and a search box is asked for
 * substrings. `pg_trgm` is the extension Postgres ships for exactly this, and
 * Supabase has it available.
 */
create extension if not exists pg_trgm;

/*
 * The index itself.
 *
 * `gin_trgm_ops` rather than GiST: GIN is slower to update and faster to
 * search, and messages are written once and searched repeatedly. The write
 * cost lands on posting a message, which is already a round trip to an
 * endpoint that checks a signature and a rate limit - a few hundred
 * microseconds of index maintenance is not what anybody will notice.
 *
 * Partial, on the messages that can actually be found. A removed message is
 * excluded from every search (its row stays, its text does not come back), so
 * carrying it in the index would be paying to store what the query filters out.
 */
create index if not exists messages_body_trgm_idx
  on public.messages using gin (body gin_trgm_ops)
  where deleted_at is null;

/*
 * Why the room is not in this index.
 *
 * A search is always scoped to one room, so `(room, body)` looks like the
 * obvious shape - but a GIN index cannot lead with an equality column the way
 * a B-tree does, and `messages_room_since_idx` from 0011 already narrows by
 * room. The planner picks between them, or uses both: which one wins depends
 * on how common the term is and how big the room is, and it is better at that
 * judgement than a guess made here would be.
 */
