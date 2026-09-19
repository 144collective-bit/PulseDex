import { useState } from 'react'
import { MessagesSquare, Rss } from 'lucide-react'
import RoomList from './social/RoomList'
import RoomPanel from './social/RoomPanel'
import PublicFeed from './social/PublicFeed'
import { findRoom } from '../config/rooms'
import '../styles/social.css'

/**
 * The social page: a feed, and a handful of rooms.
 *
 * Two shapes, on purpose, because they are good at different things. A room is
 * live and ephemeral - you had to be there - which is right for people
 * reacting to a price as it moves. The feed is the opposite: a post belongs to
 * its author rather than to a room, it is still there next week, and it is
 * what gives a profile something to be a page of.
 *
 * Making one do both jobs was the alternative and would have been worse in
 * both directions: a chat with permanent messages is an archive nobody wants
 * to be held to, and a feed that scrolls away is a feed with no memory.
 *
 * Reading either needs nothing. Posting to either needs a wallet signature,
 * which is both the identity and the spam control - an address is not free to
 * replace the way an IP is.
 *
 * What is selected lives in state rather than the URL, which means neither a
 * room nor the feed can be linked to. That is a real limitation and a
 * deliberate one: routing here is state everywhere except the token page and
 * now a profile, and both of those earn the exception by being things people
 * paste to each other. A room does not.
 */
export default function SocialView({ onOpenProfile }) {
  const [view, setView] = useState('feed')
  const active = findRoom(view)
  const onFeed = view === 'feed'

  return (
    <div className="social-view">
      <header className="social-head">
        <div className="social-head-title">
          {onFeed ? (
            <Rss size={18} className="social-head-icon" />
          ) : (
            <MessagesSquare size={18} className="social-head-icon" />
          )}
          <h1 className="font-mono">{onFeed ? 'Feed' : active?.name}</h1>
        </div>
        <p className="social-head-lede">
          {onFeed
            ? 'Everything posted on PulseDex, newest first. Posts stay on your profile.'
            : active?.blurb}
        </p>
      </header>

      <div className="social-body">
        <RoomList current={view} onSelect={setView} />

        <section
          className="social-panel"
          id="room-panel"
          role="tabpanel"
          aria-labelledby={`room-tab-${view}`}
        >
          {onFeed ? (
            <PublicFeed onOpenProfile={onOpenProfile} />
          ) : (
            /*
              Keyed by the room, so changing rooms remounts rather than
              re-renders. Everything inside - messages, scroll position,
              whether the reader is following the live end - is
              per-conversation state, and a remount is how React is told that
              this is a different conversation rather than the same one with
              different contents.
            */
            <RoomPanel key={view} room={view} onOpenProfile={onOpenProfile} />
          )}
        </section>
      </div>
    </div>
  )
}
