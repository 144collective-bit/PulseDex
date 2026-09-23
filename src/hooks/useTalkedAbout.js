import { useEffect, useState } from 'react'
import { fetchActiveTokenRooms } from '../services/rooms'
import { byToken } from '../utils/talkedAbout'

/** Long enough not to be a poll, short enough that a token somebody just
 *  started talking about turns up without a reload. Matches useTokenRooms. */
const REFRESH_MS = 120_000

/**
 * Which tokens on screen anybody is talking about.
 *
 * One query for the whole list rather than one per row, which is the entire
 * reason `rooms` carries a denormalised `message_count` - see 0014. The
 * screener draws a hundred rows and a count per row would be a hundred
 * aggregates over `messages`.
 *
 * A wider limit than the sidebar's eight. That list is "the handful with
 * something happening in them" and is read as a list; this is a lookup, and a
 * row that is being discussed and shows no badge is worse than one more row
 * in the query.
 *
 * Failures are swallowed into an empty map. This decorates a screener that
 * works without it; a database hiccup should take the badges off, not put an
 * error on a trading surface.
 */
export function useTalkedAbout({ enabled = true, limit = 60 } = {}) {
  const [rooms, setRooms] = useState(() => new Map())

  useEffect(() => {
    if (!enabled) return undefined

    let active = true

    const load = () => {
      fetchActiveTokenRooms({ limit })
        .then((found) => {
          if (active) setRooms(byToken(found))
        })
        .catch(() => {
          if (active) setRooms(new Map())
        })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [enabled, limit])

  return rooms
}
