import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useSiweAuth } from './SiweAuthContext'
import { hasSupabase } from '../config/supabase'
import { fetchNotifications, markNotificationsRead } from '../services/notifications'

const NotificationsContext = createContext(null)

/**
 * How often to ask, when nobody is looking at the inbox.
 *
 * A minute, and polling rather than realtime - which is the opposite of how
 * the chat works and for a reason. Supabase realtime enforces row-level
 * security, and the notifications table deliberately has no read policy,
 * because sign-in here is a cookie this app sets rather than Supabase auth
 * and RLS therefore cannot express "your own rows". A subscription would
 * either see nothing or, if the table were opened up to make it work, see
 * everybody's.
 */
const POLL_MS = 60_000

/**
 * The unread count, shared.
 *
 * In a context rather than a hook each caller runs, because two things want
 * it - the badge in the navigation and the panel itself - and two independent
 * polls would mean two requests a minute and two answers that disagree for
 * the second in between.
 */
export function NotificationsProvider({ children }) {
  const { isSignedIn } = useSiweAuth()
  const live = isSignedIn && hasSupabase

  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!live) return
    setLoading(true)
    try {
      const { items: rows, unread: count } = await fetchNotifications()
      setItems(rows)
      setUnread(count)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [live])

  /*
   * Poll while signed in, and stop entirely when not.
   *
   * Signing out clears the list as well as the timer. Leaving it would show
   * the previous account's inbox to whoever signs in next on a shared
   * machine, which is the same reasoning as the watchlist being scoped to an
   * address.
   */
  useEffect(() => {
    if (!live) {
      setItems([])
      setUnread(0)
      setError(null)
      return undefined
    }

    let cancelled = false
    const tick = () => {
      if (cancelled) return
      fetchNotifications()
        .then(({ items: rows, unread: count }) => {
          if (cancelled) return
          setItems(rows)
          setUnread(count)
        })
        // Silent. A failed poll is a badge that does not move, not a problem
        // worth interrupting somebody mid-trade to report.
        .catch(() => {})
    }

    tick()
    const timer = setInterval(tick, POLL_MS)

    // Coming back to the tab is the moment somebody most wants this to be
    // current, and the moment a poll is most likely to be stale.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live])

  /**
   * Mark everything read.
   *
   * The badge clears immediately rather than after the request settles. It is
   * a count of things the person is looking at, so waiting for the server to
   * agree would leave a "3" over a list they have plainly just read.
   */
  const markAllRead = useCallback(async () => {
    if (!live || unread === 0) return
    setUnread(0)
    setItems((rows) => rows.map((r) => (r.readAt ? r : { ...r, readAt: new Date().toISOString() })))
    await markNotificationsRead()
  }, [live, unread])

  return (
    <NotificationsContext.Provider
      value={{ unread, items, loading, error, refresh, markAllRead, live }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (!context) {
    // A component reading this outside the provider would otherwise get
    // `undefined` and fail on the first property, several frames later and
    // nowhere near the cause.
    throw new Error('useNotifications must be used inside a NotificationsProvider')
  }
  return context
}
