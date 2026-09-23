import { Bell } from 'lucide-react'
import { useNotifications } from '../context/NotificationsContext'
import { useSiweAuth } from '../context/SiweAuthContext'

/**
 * The unread count, in the chrome rather than in the section it belongs to.
 *
 * It used to be a badge on a sub-tab inside the social section, which meant
 * it was only visible once you had already gone looking - and on a screener,
 * where people sit watching charts, that is never. A count nobody sees until
 * they open the thing it is counting is not a notification.
 *
 * So it lives beside the account button, on every tab, and the inbox stays
 * where it was at /notifications.
 *
 * Drawn only when signed in. Signed out there is nothing to count and nobody
 * to count it for, and a bell that is always empty teaches people to ignore
 * the one place on this page that is allowed to demand attention.
 */
export default function NotificationBell({ onOpen }) {
  const { isSignedIn } = useSiweAuth()
  const { unread } = useNotifications()

  if (!isSignedIn) return null

  return (
    <button
      type="button"
      className={`notif-bell btn-icon-round ${unread > 0 ? 'has-unread' : ''}`}
      onClick={onOpen}
      /*
       * The count is in the label rather than only in the badge, because a
       * screen reader gets nothing from a number sitting in a span next to an
       * icon called "Bell".
       */
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      title={unread > 0 ? `${unread} unread` : 'Notifications'}
    >
      <Bell size={16} />

      {/* Only when it is not zero. A badge showing "0" is a badge that has
          stopped meaning anything. */}
      {unread > 0 && (
        <span className="notif-bell-count font-mono" aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
