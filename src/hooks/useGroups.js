import { useCallback, useEffect, useState } from 'react'
import { fetchGroups } from '../services/rooms'

/**
 * The groups, for the sidebar.
 *
 * Fetched once and refetched on demand rather than polled. Unlike token
 * rooms, which appear as people talk about tokens, a group appears when a
 * moderator makes one - so the list changes when somebody on this page
 * creates one, which `refresh` covers, and otherwise almost never.
 *
 * Failures come back as an empty list. This sits under the five rooms that
 * always work; a database hiccup should take the groups off the sidebar, not
 * put an error message in a navigation column.
 */
export function useGroups({ enabled = true } = {}) {
  const [groups, setGroups] = useState([])
  const [round, setRound] = useState(0)

  const refresh = useCallback(() => setRound((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) return undefined

    let active = true

    fetchGroups()
      .then((found) => {
        if (active) setGroups(found)
      })
      .catch(() => {
        if (active) setGroups([])
      })

    return () => {
      active = false
    }
  }, [enabled, round])

  return { groups, refresh }
}
