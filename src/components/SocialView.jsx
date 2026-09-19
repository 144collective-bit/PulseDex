import { useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import RoomList from './social/RoomList'
import RoomPanel from './social/RoomPanel'
import { DEFAULT_ROOM, findRoom } from '../config/rooms'
import '../styles/social.css'

/**
 * The social page: a handful of rooms, everyone in them.
 *
 * Reading is open to anyone who loads the site. Posting needs a wallet
 * signature, which is both the identity and the spam control - an address is
 * not free to replace the way an IP is.
 *
 * A fixed list of rooms rather than a thread per token. A screener could
 * attach one to every pair, and that is still the version worth building if
 * these get used - but it would mean thousands of rooms, almost all of them
 * empty, before anyone has said a word. Five rooms is enough to find out
 * whether people want to talk somewhere other than the Lounge.
 *
 * The room lives in state, not the URL, so a room cannot be linked to. That is
 * a real limitation and a deliberate one for now: routing here is state
 * everywhere except the token page, and making this the second exception would
 * leave the convention half-applied.
 */
export default function SocialView() {
  const [room, setRoom] = useState(DEFAULT_ROOM)
  const active = findRoom(room)

  return (
    <div className="social-view">
      <header className="social-head">
        <div className="social-head-title">
          <MessagesSquare size={18} className="social-head-icon" />
          <h1 className="font-mono">{active?.name}</h1>
        </div>
        <p className="social-head-lede">{active?.blurb}</p>
      </header>

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
            re-renders. Everything inside - messages, scroll position, whether
            the reader is following the live end - is per-conversation state,
            and a remount is how React is told that this is a different
            conversation rather than the same one with different contents.
          */}
          <RoomPanel key={room} room={room} />
        </section>
      </div>
    </div>
  )
}
