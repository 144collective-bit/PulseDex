import { useEffect, useState } from 'react'
import { fetchTokenRoom } from '../services/rooms'

/**
 * This token's room, if anybody has said anything in it.
 *
 * Null covers both "no room yet" and "the query failed", and that conflation
 * is deliberate here. The only thing this feeds is a count beside a tab: a
 * token nobody has discussed and a token whose count could not be loaded
 * should both show the tab without a number, rather than one of them showing
 * an error about a feature the reader has not asked for yet.
 *
 * Fetched once per token rather than kept live. The count is a rough signal
 * of how much has been said, not a live tally - and the person who would most
 * notice it going stale is the one posting, who is looking at the messages
 * themselves rather than at the number on the tab.
 *
 * @param {string|null} address
 */
export function useTokenRoom(address) {
  const [room, setRoom] = useState(null)

  useEffect(() => {
    if (!address) {
      setRoom(null)
      return undefined
    }

    // Dropped rather than applied if the token changes mid-flight: on a board
    // where clicking through tokens is the whole interaction, a slow answer
    // for the previous one would put its count on this one's tab.
    let active = true

    fetchTokenRoom(address)
      .then((found) => {
        if (active) setRoom(found)
      })
      .catch(() => {
        if (active) setRoom(null)
      })

    return () => {
      active = false
    }
  }, [address])

  return room
}
