import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMessagePage, subscribeToMessages } from '../services/chat'
import { oldestCursor } from '../utils/chatPaging'
import { hasSupabase } from '../config/supabase'

export const CHAT_STATUS = {
  unconfigured: 'unconfigured',
  loading: 'loading',
  ready: 'ready',
  failed: 'failed',
}

/**
 * The conversation: what has been said, and what is being said now.
 *
 * Two sources feed one list. The first is a fetch of recent history on mount;
 * the second is the realtime feed, which delivers every message posted from
 * then on, including this browser's own.
 *
 * That overlap is the thing to get right. A message can arrive twice - once in
 * the reply to the post that created it, once from the feed a moment later -
 * and a chat that shows your message twice looks broken in a way that makes
 * people stop trusting the rest of it. Everything here is keyed by id and
 * merged rather than appended.
 *
 * Scoped to one room, and re-run from scratch when it changes: both the query
 * and the realtime subscription are filtered server-side, so reading a quiet
 * room costs nothing when a busy one is active.
 *
 * @param {string} room slug from src/config/rooms.js
 */
export function useChatMessages(room) {
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState(
    hasSupabase ? CHAT_STATUS.loading : CHAT_STATUS.unconfigured,
  )
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  /*
   * Held in a ref as well as state so the merge can read the current list
   * without depending on it. Without this, every arriving message would
   * rebuild the subscription - tearing down and reopening a websocket per
   * message, which drops the messages that land in between.
   */
  const byId = useRef(new Map())

  const merge = useCallback((incoming) => {
    const next = byId.current
    for (const message of incoming) next.set(message.id, message)

    setMessages(
      [...next.values()].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id,
      ),
    )
  }, [])

  const forget = useCallback((id) => {
    byId.current.delete(id)
    setMessages((current) => current.filter((m) => m.id !== id))
  }, [])

  useEffect(() => {
    if (!hasSupabase) return undefined

    let active = true

    fetchMessagePage({ room })
      .then((page) => {
        if (!active) return
        merge(page.messages)
        setHasMore(page.hasMore)
        setStatus(CHAT_STATUS.ready)
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setStatus(CHAT_STATUS.failed)
      })

    /*
     * Subscribed immediately, not after the history arrives. A message posted
     * during that fetch would otherwise land in neither - too late for the
     * query, too early for the subscription - and vanish until a reload. The
     * merge makes the overlap harmless.
     */
    const unsubscribe = subscribeToMessages({
      room,
      onMessage: (message) => {
        if (active) merge([message])
      },
      onRemoved: (id) => {
        if (active) forget(id)
      },
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [room, merge, forget])

  /**
   * Fetch the page before the oldest message held.
   *
   * Guarded against overlapping calls. Two requests in flight would both page
   * from the same cursor and fetch the same messages, which the merge would
   * absorb - leaving a button that looks broken because pressing it twice
   * quickly appears to do nothing.
   */
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return
    const before = oldestCursor([...byId.current.values()])
    if (!before) return

    setLoadingOlder(true)
    try {
      const page = await fetchMessagePage({ room, before })
      merge(page.messages)
      setHasMore(page.hasMore)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingOlder(false)
    }
  }, [room, hasMore, loadingOlder, merge])

  return {
    messages,
    status,
    error,
    hasMore,
    loadingOlder,
    loadOlder,
    /** Show a message this browser just posted, without waiting for the feed
     *  to bring it back around. */
    add: useCallback((message) => merge([message]), [merge]),
    remove: forget,
  }
}
