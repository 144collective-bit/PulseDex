import { useCallback } from 'react'
import { Bell, ChartCandlestick, Compass, LogIn, MessagesSquare, Rss, UserRound } from 'lucide-react'
import RoomList from './social/RoomList'
import NewGroup from './social/NewGroup'
import RoomPanel from './social/RoomPanel'
import PublicFeed from './social/PublicFeed'
import DiscoverPanel from './social/DiscoverPanel'
import NotificationsPanel from './social/NotificationsPanel'
import ProfilePage from './social/ProfilePage'
import { useSiweAuth } from '../context/SiweAuthContext'
import { useNotifications } from '../context/NotificationsContext'
import { useRoomUnread } from '../hooks/useRoomUnread'
import { useGroups } from '../hooks/useGroups'
import { DEFAULT_ROOM, findRoom, isGroupRoom, roomToken, tokenRoomLabel } from '../config/rooms'
import '../styles/social.css'

/**
 * The social section: five things, one row of tabs.
 *
 * They were scattered before this - the feed and the rooms shared a sidebar,
 * your own profile was behind a menu item in the header, and there was no way
 * at all to find somebody you did not already know about. Each was reachable
 * and none was visible, which for a section people are meant to explore is the
 * same as missing.
 *
 * A row across the top rather than more of the sidebar, because these are four
 * different places rather than four channels of one. The sidebar still exists
 * inside Chat Rooms, where it is a list of rooms and reads as one.
 */
const TABS = [
  {
    id: 'feed',
    name: 'Feed',
    icon: Rss,
    lede: 'Everything posted on PulseDex, newest first. Posts stay on your profile.',
  },
  {
    id: 'profile',
    name: 'My Profile',
    icon: UserRound,
    lede: 'Your page, as everybody else sees it.',
  },
  {
    id: 'rooms',
    name: 'Chat Rooms',
    icon: MessagesSquare,
    lede: null, // The room's own blurb goes here instead.
  },
  {
    id: 'discover',
    name: 'Discover',
    icon: Compass,
    lede: 'Find people worth following.',
  },
  /*
   * Last in the row and first in importance.
   *
   * Last because it is the one tab that is about the reader rather than about
   * the site, and a row that opens on "your stuff" reads as an account screen
   * rather than a place to look around. It carries the unread count, which is
   * the only thing in this strip that changes on its own.
   */
  {
    id: 'notifications',
    name: 'Notifications',
    icon: Bell,
    lede: 'Mentions, replies, follows and reactions.',
  },
]

export default function SocialView({ route, onNavigate, onOpenProfile, onOpenToken }) {
  const { account, isSignedIn, signIn, isBusy } = useSiweAuth()

  /*
   * Which surface and which room, from the URL.
   *
   * Held nowhere in this component, and that is the change: a tab in state
   * and a path in the address bar are two copies of one fact, and the copy
   * that is not shown is the one that goes stale. Reading both from the route
   * means a cold load, a Back press and a click all arrive the same way.
   *
   * The defaults cover a caller that has not routed yet - the section always
   * opens on the feed, and the rooms surface on the room every new visitor
   * lands in.
   */
  const tab = route?.tab || 'feed'
  const room = route?.room || DEFAULT_ROOM

  const setTab = useCallback((id) => onNavigate?.({ tab: id }), [onNavigate])
  const setRoom = useCallback((slug) => onNavigate?.({ tab: 'rooms', room: slug }), [onNavigate])

  const { unread } = useNotifications()

  /*
   * Only counted while the rooms tab is open. Polling for badges nobody can
   * see is a request a minute for nothing, and somebody reading the feed is
   * not asking about the rooms.
   */
  const rooms = useRoomUnread({ activeRoom: tab === 'rooms' ? room : null })
  const { groups, refresh: refreshGroups } = useGroups({ enabled: tab === 'rooms' })

  const active = TABS.find((t) => t.id === tab) || TABS[0]
  /*
   * What to call the room at the top of the page.
   *
   * `findRoom` only knows the five. A token room has no name and no blurb -
   * see src/config/rooms.js for why it deliberately never will - so it is
   * titled by its address and described by what it is, which is the same
   * sentence for every one of them.
   */
  const activeRoom = findRoom(room)
  const activeToken = roomToken(room)
  /*
   * A group is named by whoever made it, so its name comes from the row
   * rather than from anywhere in this bundle. Found in the list the sidebar
   * is already holding, which avoids a second query for one string.
   */
  const activeGroup = isGroupRoom(room) ? groups.find((g) => g.slug === room) : null

  const roomName =
    activeRoom?.name || activeGroup?.name || (activeToken ? tokenRoomLabel(room) : null)
  const roomLede =
    activeRoom?.blurb ||
    activeGroup?.blurb ||
    (activeToken ? 'Everyone talking about this token.' : null)
  const Icon = active.icon

  return (
    <div className="social-view">
      <header className="social-head">
        <div className="social-head-title">
          <Icon size={18} className="social-head-icon" />
          <h1 className="font-mono">{tab === 'rooms' ? roomName : active.name}</h1>
        </div>
        <p className="social-head-lede">
          {tab === 'rooms' ? roomLede : active.lede}
          {/*
            Back to the chart, from the conversation about it.

            The other direction already exists - the token page has a Chat tab
            - and without this the room is a dead end: somebody arriving from
            the sidebar can read what is being said about a token and has no
            way to see the token. One link closes the loop.
          */}
          {tab === 'rooms' && activeToken && onOpenToken && (
            <button
              type="button"
              className="social-head-link font-mono"
              onClick={() => onOpenToken(activeToken)}
            >
              <ChartCandlestick size={11} />
              View the token
            </button>
          )}
        </p>
      </header>

      {/* The same tab strip the profile page uses, so the two read as one
          product rather than as two designs that happen to sit together. */}
      <nav className="xp-tabs social-tabs" role="tablist" aria-label="Social sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`xp-tab ${tab === entry.id ? 'active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            <entry.icon size={13} className="social-tab-icon" />
            <span>{entry.name}</span>
            {/* Only on the tab it belongs to, and only when it is not zero:
                a badge showing "0" is a badge that has stopped meaning
                anything. */}
            {entry.id === 'notifications' && unread > 0 && (
              <span className="xp-tab-badge" aria-label={`${unread} unread`}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'feed' && <PublicFeed onOpenProfile={onOpenProfile} />}

      {tab === 'discover' && <DiscoverPanel onOpenProfile={onOpenProfile} />}

      {tab === 'notifications' && <NotificationsPanel onOpenProfile={onOpenProfile} />}

      {tab === 'profile' &&
        (isSignedIn && account ? (
          /*
           * The same page a stranger would see, rendered without its own
           * chrome. Not a second "my profile" screen: one component means the
           * thing you are shown here and the thing others get cannot drift,
           * which is the entire promise of a public profile.
           */
          <ProfilePage
            key={account}
            route={{ address: account.toLowerCase(), handle: null }}
            embedded
            onOpenProfile={onOpenProfile}
            onOpenToken={onOpenToken}
          />
        ) : (
          <div className="social-signin">
            <UserRound size={20} />
            <h2>You do not have a profile yet</h2>
            <p>
              Sign in with your wallet and this becomes your page - your posts, your
              bio, and whoever follows you.
            </p>
            <button type="button" className="chat-send" onClick={signIn} disabled={isBusy}>
              <LogIn size={14} />
              {isBusy ? 'Signing in' : 'Sign in'}
            </button>
          </div>
        ))}

      {tab === 'rooms' && (
        <div className="social-body">
          <div className="room-column">
            <RoomList
              current={room}
              onSelect={setRoom}
              unread={rooms.unread}
              groups={groups}
            />
            <NewGroup onCreated={refreshGroups} />
          </div>

          <section
            className="social-panel"
            id="room-panel"
            role="tabpanel"
            aria-labelledby={`room-tab-${room}`}
          >
            {/*
              Keyed by the room, so changing rooms remounts rather than
              re-renders. Everything inside - messages, scroll position,
              whether the reader is following the live end - is
              per-conversation state, and a remount is how React is told that
              this is a different conversation rather than the same one with
              different contents.
            */}
            <RoomPanel
              key={room}
              room={room}
              onOpenProfile={onOpenProfile}
              onSeen={rooms.seen}
              /* The row the sidebar already holds, so the panel can state the
                 room's rule without asking for it again. */
              gatedOn={activeGroup}
            />
          </section>
        </div>
      )}
    </div>
  )
}
