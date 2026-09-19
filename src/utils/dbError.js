/**
 * Turning a database failure into something a reader can act on.
 *
 * Every one of these call sites used to do `throw new Error(error.message)`,
 * which put PostgREST's own words on the screen. Two things wrong with that.
 *
 * The first is what it says to whoever is looking: a trader who opens the feed
 * and is told `relation "public.posts" does not exist` has learned nothing
 * they can use, and neither has the person they report it to.
 *
 * The second is what it says to everybody else. PostgREST error text names the
 * schema, the table, the column, the constraint and sometimes the policy that
 * refused - `new row violates row-level security policy for table "profiles"`
 * describes the shape of the database and where its edges are. That belongs in
 * a log, not in an element on a public page.
 *
 * So: a sentence for the reader, the detail to the console for whoever is
 * debugging, and the original kept on the error as `cause` for anything that
 * wants to inspect it.
 */

/** What the reader is told when a read fails and we have nothing better. */
const GENERIC = 'Could not load that just now. Try again in a moment.'

/**
 * The few failures worth naming, because they mean different things to do.
 *
 * Matched on PostgREST's own codes rather than its prose, which is not a
 * stable interface. Anything not listed here gets the generic sentence - the
 * safe default, since a message nobody has read is a message nobody has
 * checked for what it discloses.
 */
const BY_CODE = {
  // Postgres: undefined table or column. A migration has not been run.
  '42P01': 'This part of PulseDex is not set up yet.',
  '42703': 'This part of PulseDex is not set up yet.',
  // PostgREST: row-level security refused the write.
  '42501': 'You are not allowed to do that.',
  // Unique violation - a handle somebody else already holds.
  '23505': 'That is already taken.',
  // PostgREST could not parse the request. Ours to fix, not the reader's.
  PGRST100: GENERIC,
  // No rows where exactly one was required.
  PGRST116: 'That could not be found.',
}

/**
 * Build the error to throw for a failed Supabase call.
 *
 * `where` is a short phrase naming what was being done, for the console line
 * only - it never reaches the page.
 */
export function dbError(error, where = 'database call') {
  const code = error?.code ? String(error.code) : ''
  const message = Object.hasOwn(BY_CODE, code) ? BY_CODE[code] : GENERIC

  // The detail, for whoever is looking at a console - not for the page.
  if (typeof console !== 'undefined') {
    console.error(`${where} failed:`, error?.code || '(no code)', error?.message || error)
  }

  const err = new Error(message)
  err.code = code
  // Kept rather than dropped, so a caller that genuinely needs to branch on
  // the original still can without it being rendered by default.
  err.cause = error
  return err
}

/**
 * Every sentence this module can put on a page.
 *
 * Exported so a check can assert that what a reader was shown is one of ours
 * and not something that came back from the database. Matching on a single
 * sentence would pass or fail on which code the fixture happened to use.
 */
export const DB_MESSAGES = [GENERIC, ...new Set(Object.values(BY_CODE))]

export { GENERIC as GENERIC_DB_MESSAGE }
