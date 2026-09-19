/**
 * Who may remove a message.
 *
 * A list of wallet addresses in an environment variable, not a role in the
 * database. That is the right shape for exactly one moderator and the wrong
 * shape for ten: changing it means a redeploy, and there is no audit of who
 * removed what. It is here because a public chat with no way to remove
 * anything is a worse problem than a coarse way to remove it, and because the
 * alternative - a roles table, an admin screen - is a week of work to solve a
 * problem this site does not have yet.
 *
 * Parsed here rather than in the handler so it can be tested. Getting this
 * wrong fails in the direction that matters: a bug that widens the set hands
 * moderation to a stranger.
 */

/** A wallet address and nothing else: 0x and forty hex digits. */
const ADDRESS = /^0x[0-9a-f]{40}$/

/**
 * An address as it is stored and compared, or null.
 *
 * Every address in this database is lowercased, because every wallet and block
 * explorer displays the mixed-case checksummed form and that is what gets
 * copied and pasted. Comparing one of those against a stored address without
 * lowercasing first silently matches nothing - which, for a blocklist, fails
 * in the direction of letting somebody post.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normaliseAddress(value) {
  if (typeof value !== 'string') return null
  const lowered = value.trim().toLowerCase()
  return ADDRESS.test(lowered) ? lowered : null
}

/**
 * Read the configured moderators.
 *
 * Separated by commas, whitespace or both, because the value gets pasted into
 * a dashboard field by a person and "0xabc, 0xdef" and "0xabc 0xdef" are both
 * what they meant.
 *
 * Anything that is not an address is dropped rather than throwing. A typo in
 * one entry should not take out the endpoint that uses this - it should cost
 * that one moderator their access, which is visible and fixable, instead of
 * returning a 500 to everyone who posts.
 *
 * @param {unknown} raw
 * @returns {Set<string>} lowercased addresses; empty when nothing is set
 */
export function parseAdminAddresses(raw) {
  if (typeof raw !== 'string') return new Set()

  return new Set(
    raw
      .split(/[\s,]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => ADDRESS.test(part)),
  )
}

/**
 * Is this address allowed to remove a message?
 *
 * An empty set answers no to everyone, which is the safe direction: an unset
 * or mistyped variable leaves the chat unmoderated, not open to anybody who
 * asks. The reverse - treating "no list configured" as "no restriction" - is
 * the same bug that turns a forgotten environment variable into an open door.
 *
 * @param {unknown} address
 * @param {Set<string>} admins
 */
export function isAdminAddress(address, admins) {
  if (typeof address !== 'string') return false
  if (!(admins instanceof Set) || admins.size === 0) return false
  return admins.has(address.toLowerCase())
}
