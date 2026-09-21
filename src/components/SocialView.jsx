import { useState } from 'react'
import { Bell, Compass, LogIn, MessagesSquare, Rss, UserRound } from 'lucide-react'
import RoomList from './social/RoomList'
import RoomPanel from './social/RoomPanel'
import PublicFeed from './social/PublicFeed'
import DiscoverPanel from './social/DiscoverPanel'
import NotificationsPanel from './social/NotificationsPanel'
import ProfilePage from './social/ProfilePage'
import { useSiweAuth } from '../context/SiweAuthContext'
import { useNotifications } from '../context/NotificationsContext'
import { DEFAULT_ROOM, findRoom } from '../config/rooms'
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

export default function SocialView({ onOpenProfile }) {
  const { account, isSignedIn, signIn, isBusy } = useSiweAuth()

  const [tab, setTab] = useState('feed')
  const [room, setRoom] = useState(DEFAULT_ROOM)
  const { unread } = useNotifications()

  const active = TABS.find((t) => t.id === tab) || TABS[0]
  const activeRoom = findRoom(room)
  const Icon = active.icon

  return (
    <div className="social-view">
      <header className="social-head">
        <div className="social-head-title">
          <Icon size={18} className="social-head-icon" />
          <h1 className="font-mono">{tab === 'rooms' ? activeRoom?.name : active.name}</h1>
        </div>
        <p className="social-head-lede">
          {tab === 'rooms' ? activeRoom?.blurb : active.lede}
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
          <RoomList current={room} onSelect={setRoom} />

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
            <RoomPanel key={room} room={room} onOpenProfile={onOpenProfile} />
          </section>
        </div>
      )}
    </div>
  )
}
