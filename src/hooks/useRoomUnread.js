import { useCallback, useEffect, useRef, useState } from 'react'
import { useSiweAuth } from '../context/SiweAuthContext'
import { hasSupabase } from '../config/supabase'
import { fetchUnread, markRoomRead } from '../services/chatReads'

/**
 * Which rooms have something new in them.
 *
 * The sidebar was five identical words. Nothing said which of them had moved,
 * so finding out meant opening all five, and the usual outcome was opening
 * none.
 *
 * Polled rather than subscribed, for the same reason the inbox is: the
 * `room_reads` table has no read policy, deliberately, and Supabase realtime
 * enforces row-level security - so a subscription would see nothing. The
 * counts are also cheap to be slightly stale, which is the other half of why
 * this is not worth a socket.
 */
const POLL_MS = 45_000

export function useRoomUnread({ activeRoom } = {}) {
  const { isSignedIn } = useSiweAuth()
  const live = isSignedIn && hasSupabase

  const [unread, setUnread] = useState({})

  /*
   * The room being looked at, held in a ref as well as read from props.
   *
   * The poll runs on a timer and closes over whatever the room was when the
   * timer was made. Without this it would happily put a badge on the room
   * currently open - which somebody is, by definition, reading.
   */
  const openRoom = useRef(activeRoom)
  openRoom.current = activeRoom

  const refresh = useCallback(async () => {
    if (!live) return
    try {
      const counts = await fetchUnread()
      // Never badge the room in front of them.
      if (openRoom.current) delete counts[openRoom.current]
      setUnread(counts)
    } catch {
      // Silent: a count that does not move is not worth interrupting anybody.
    }
  }, [live])

  useEffect(() => {
    if (!live) {
      // Signing out clears it, so the next person on a shared machine does
      // not inherit somebody else's badges.
      setUnread({})
      return undefined
    }

    refresh()
    const timer = setInterval(refresh, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live, refresh])

  /**
   * Opening a room is reading it.
   *
   * The badge clears here rather than after the request settles: it counts
   * things the reader is now looking at, so waiting for the server to agree
   * would leave a number over a conversation plainly already open.
   */
  useEffect(() => {
    if (!live || !activeRoom) return
    setUnread((current) => {
      if (!(activeRoom in current)) return current
      const next = { ...current }
      delete next[activeRoom]
      return next
    })
    markRoomRead(activeRoom)
  }, [live, activeRoom])

  /**
   * Called when a message lands in the room already open.
   *
   * Without it, reading a busy room for ten minutes and then leaving marks it
   * read as of arrival, and everything said while it was on screen comes back
   * as unread. The mark is what moves; nothing is drawn differently.
   */
  const seen = useCallback(() => {
    if (live && openRoom.current) markRoomRead(openRoom.current)
  }, [live])

  return { unread, refresh, seen, live }
}
