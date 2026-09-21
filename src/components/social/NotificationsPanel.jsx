import { useEffect } from 'react'
import { AtSign, MessageSquare, UserPlus, Smile, Loader2, BellOff } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { useNotifications } from '../../context/NotificationsContext'
import { formatAddress } from '../../utils/formatters'

/**
 * What happened while you were away.
 *
 * The reason to come back, and the first surface in this app that is about
 * one person rather than about everybody. Until this existed somebody could
 * post, be replied to, be followed and be named by four people, and unless
 * they happened to be looking at the feed in those moments they would never
 * find out.
 */

const KINDS = {
  mention: { icon: AtSign, says: 'mentioned you', tone: 'is-mention' },
  reply: { icon: MessageSquare, says: 'replied to you', tone: 'is-reply' },
  follow: { icon: UserPlus, says: 'followed you', tone: 'is-follow' },
  reaction: { icon: Smile, says: 'reacted to your message', tone: 'is-reaction' },
}

export default function NotificationsPanel({ onOpenProfile }) {
  const { items, unread, loading, error, refresh, markAllRead, live } = useNotifications()

  /*
   * Opening the panel is reading it.
   *
   * No "mark all read" button, because there is nothing here somebody would
   * want to leave unread on purpose - this is a list of things that already
   * happened, not a queue of work. Marking on open is what makes the badge
   * mean "since you last looked".
   */
  useEffect(() => {
    refresh()
    // One pass, on mount. Running it whenever `unread` changes would clear
    // the count the instant a poll found something, while the reader is
    // looking at another tab entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (unread > 0) markAllRead()
  }, [unread, markAllRead])

  if (!live) {
    return (
      <div className="social-signin">
        <p>Sign in to see what people have been saying to you.</p>
      </div>
    )
  }

  return (
    <div className="xp-panel">
      {/* No header of its own. SocialView already draws the name and the
          blurb above the tab strip, and the panels beside this one - Discover,
          the feed - leave it to do that. Repeating it put "Notifications"
          twice on the screen, one line apart. */}
      {error && (
        <p className="xp-empty" role="alert">
          {error}
        </p>
      )}

      {loading && items.length === 0 && (
        <p className="xp-empty">
          <Loader2 size={14} className="tch-spin" /> Loading
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="xp-empty">
          <BellOff size={18} />
          <p>Nothing yet.</p>
          {/* An empty inbox on a new account is the ordinary state, not a
              failure, so it says what would fill it rather than apologising. */}
          <p className="xp-empty-hint">
            When somebody mentions you, replies to you, follows you or reacts to something you
            wrote, it turns up here.
          </p>
        </div>
      )}

      <ul className="notif-list">
        {items.map((item) => {
          const meta = KINDS[item.kind] || KINDS.mention
          const Icon = meta.icon
          const name = item.actor.handle || formatAddress(item.actor.address)

          return (
            <li key={item.id} className={`notif-row ${item.readAt ? '' : 'is-unread'}`}>
              <span className={`notif-icon ${meta.tone}`}>
                <Icon size={14} />
              </span>

              <button
                type="button"
                className="notif-actor"
                onClick={() => onOpenProfile?.({ address: item.actor.address })}
                aria-label={`Open ${name}'s profile`}
              >
                <ChatAvatar
                  address={item.actor.address}
                  avatarId={item.actor.avatarId}
                  avatarUrl={item.actor.avatarUrl}
                  size={28}
                />
              </button>

              <div className="notif-body">
                <p className="notif-line">
                  <button
                    type="button"
                    className="notif-name"
                    onClick={() => onOpenProfile?.({ address: item.actor.address })}
                  >
                    {name}
                  </button>{' '}
                  <span className="notif-says">{meta.says}</span>
                </p>

                {/* The post it is about, when there is one. Text, never
                    markup - the same rule as everywhere a stranger's words
                    are drawn. */}
                {item.excerpt && <p className="notif-excerpt">{item.excerpt}</p>}
              </div>

              <time className="notif-when" dateTime={item.createdAt || undefined}>
                {ago(item.createdAt)}
              </time>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * How long ago, in as few characters as possible.
 *
 * The column is narrow and the exact minute does not matter here: what a
 * reader wants from this is "is that new", which "2h" answers as well as a
 * timestamp and in a quarter of the width.
 */
function ago(iso) {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''

  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
