import { useCallback, useState } from 'react'
import { Bell, ChartCandlestick, Compass, LogIn, MessagesSquare, Rss, UserRound } from 'lucide-react'
import RoomList from './social/RoomList'
import NewGroup from './social/NewGroup'
import RoomPanel from './social/RoomPanel'
import PublicFeed from './social/PublicFeed'
import DiscoverPanel from './social/DiscoverPanel'
import NotificationsPanel from './social/NotificationsPanel'
import ProfilePage from './social/ProfilePage'
import { useSiweAuth } from '../context/SiweAuthContext'
import { useRoomUnread } from '../hooks/useRoomUnread'
import { useGroups } from '../hooks/useGroups'
import { DEFAULT_ROOM, findRoom, isGroupRoom, roomToken, tokenRoomLabel } from '../config/rooms'
import '../styles/social.css'

/**
 * The social section: three places to go, and two surfaces that are about you.
 *
 * It was five tabs, which was two too many and the wrong two. Your own
 * profile and your own inbox are not places to browse - they are things you
 * go to on purpose, from the chrome, the way every social product has settled
 * on. Leaving them in the row made the row an account screen with a feed
 * attached.
 *
 * So the tabs are the three that are about the site: the feed, the rooms, and
 * finding people. Your profile is in the account menu. The unread count is a
 * bell beside it, visible from the screener rather than only once you are
 * already here - which was the whole problem with it being a badge on a
 * sub-tab.
 *
 * Both of those surfaces still exist and still have URLs, at /me and
 * /notifications. They render here without a tab selected, which is honest:
 * you are in the section, on something that is not one of the three.
 */
/** The three the row offers. Ordered outward: everything, then the rooms,
 *  then the people you have not met. */
const TABS = [
  {
    id: 'feed',
    name: 'Feed',
    icon: Rss,
    lede: 'Everything posted on PulseDex, newest first. Posts stay on your profile.',
  },
  {
    id: 'rooms',
    name: 'Rooms',
    icon: MessagesSquare,
    lede: null, // The room's own blurb goes here instead.
  },
  {
    id: 'discover',
    name: 'Discover',
    icon: Compass,
    lede: 'Find people worth following.',
  },
]

/**
 * The two that are not in the row.
 *
 * Reached from the chrome - the account menu and the bell - and by their own
 * URLs. They need a title and a sentence like anything else, so they are
 * described here rather than special-cased in the header.
 */
const SURFACES = {
  profile: {
    name: 'My Profile',
    icon: UserRound,
    lede: 'Your page, as everybody else sees it.',
  },
  notifications: {
    name: 'Notifications',
    icon: Bell,
    lede: 'Mentions, replies, follows and reactions.',
  },
}

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

  /*
   * What somebody typed into the room filter that turned out to be a person.
   *
   * Carried across rather than dropped: the hand-off reads "Looking for a
   * person?", and answering that by clearing the box and showing an empty
   * search would be a worse outcome than the empty room list they were
   * already looking at.
   *
   * Not in the URL. A search term is what somebody is doing right now, not
   * where they are, and putting it in the address bar would make Back walk
   * backwards through their typing.
   */
  const [handoff, setHandoff] = useState(null)
  const findPeople = useCallback(
    (term) => {
      setHandoff(term || '')
      setTab('discover')
    },
    [setTab],
  )

  /*
   * Only counted while the rooms tab is open. Polling for badges nobody can
   * see is a request a minute for nothing, and somebody reading the feed is
   * not asking about the rooms.
   */
  const rooms = useRoomUnread({ activeRoom: tab === 'rooms' ? room : null })
  const { groups, refresh: refreshGroups } = useGroups({ enabled: tab === 'rooms' })

  /*
   * What is on screen, whether or not it is one of the three.
   *
   * `TABS` first, then the two that are reached from the chrome, then the
   * feed - which is where the section opens and what an unrecognised route
   * falls back to.
   */
  const active = TABS.find((t) => t.id === tab) || SURFACES[tab] || TABS[0]
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

      {/*
        The same tab strip the profile page uses, so the two read as one
        product rather than as two designs that happen to sit together.

        Drawn on /me and /notifications too, with nothing selected. Hiding it
        there would be tidier and would leave somebody on their own inbox with
        no way back into the section except the browser's Back button.
      */}
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
          </button>
        ))}
      </nav>

      {tab === 'feed' && <PublicFeed onOpenProfile={onOpenProfile} />}

      {tab === 'discover' && (
        <DiscoverPanel
          onOpenProfile={onOpenProfile}
          /* Only the once. The panel unmounts when the tab changes, so
             without clearing it a term handed over an hour ago would come
             back every time somebody opened Discover. */
          initialTerm={handoff}
          onUsedInitialTerm={() => setHandoff(null)}
        />
      )}

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
              /* A room filter that finds no rooms hands the term to the
                 surface that does search people, rather than searching them
                 twice in two places. */
              onFindPeople={findPeople}
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
              /* From /r/<slug>#m<id>. The panel scrolls to it and marks it,
                 reusing what jumping to a quoted reply already does. */
              focusMessage={route?.message || null}
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
