import { useEffect, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'

/**
 * Whether the signed-in wallet may remove a message.
 *
 * Asked of the server rather than decided here, because the list of moderators
 * is an environment variable that should stay on the server - shipping it to
 * the browser would publish who moderates the site to anyone who reads the
 * bundle.
 *
 * This only decides whether a control is drawn. The endpoint checks the same
 * thing again when a removal is actually requested, because a button that is
 * not rendered is not a permission - it is a button someone else can send the
 * request without.
 */
export function useIsModerator() {
  const { isSignedIn, account } = useSiweAuth()

  /*
   * The address moderation was granted to, not a bare yes.
   *
   * Two accounts can be used in one session, and a plain boolean left over
   * from the first would draw a delete control for the second until the next
   * request answered. Holding the address means the answer below is false the
   * instant the account changes, without anything having to remember to clear
   * it.
   */
  const [grantedTo, setGrantedTo] = useState(null)

  useEffect(() => {
    // Deliberately no state update on the way out. Signing out is answered by
    // the comparison below, and setting state synchronously here would start
    // a second render for a value that is already decided.
    if (!isSignedIn || !account) return undefined

    let active = true
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (active && data.isAdmin && data.address) setGrantedTo(data.address)
      })
      .catch(() => {
        // Unreachable means no moderation controls, which is the harmless
        // direction: the endpoint would refuse the removal anyway.
      })

    return () => {
      active = false
    }
  }, [isSignedIn, account])

  return Boolean(isSignedIn && account && grantedTo === account.toLowerCase())
}
