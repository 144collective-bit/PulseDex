import { useEffect, useState } from 'react'
import { fetchActiveTokenRooms } from '../services/rooms'

/** Long enough not to be a poll, short enough that a room somebody just
 *  created appears without a reload. */
const REFRESH_MS = 120_000

/**
 * The token rooms worth listing, busiest-first.
 *
 * Fetched rather than subscribed to. Supabase realtime applies row-level
 * security, and `rooms` is anon-readable, so a subscription would work - but
 * it would be a websocket kept open to learn that a list of at most eight
 * entries has reordered. A refetch every couple of minutes says the same
 * thing for nothing.
 *
 * Failures are swallowed into an empty list. This sits under the five rooms
 * that always work; a database hiccup should take the token rooms off the
 * sidebar, not put an error message in a navigation column.
 */
export function useTokenRooms({ enabled = true, limit = 8 } = {}) {
  const [rooms, setRooms] = useState([])

  useEffect(() => {
    if (!enabled) return undefined

    let active = true

    const load = () => {
      fetchActiveTokenRooms({ limit })
        .then((found) => {
          if (active) setRooms(found)
        })
        .catch(() => {
          if (active) setRooms([])
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
