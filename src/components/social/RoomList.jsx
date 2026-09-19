import { Rss } from 'lucide-react'
import { ROOMS } from '../../config/rooms'

/**
 * The rooms, down the left.
 *
 * A list of buttons rather than links, because the app routes by state rather
 * than by URL everywhere except the token page - making these anchors would be
 * the only place in the product where a nav item changed the address bar, and
 * a half-applied convention is worse than either one.
 *
 * Marked up as a tablist so the relationship between the buttons and the
 * conversation beside them is stated rather than implied. That also buys the
 * arrow-key behaviour people expect from tabs for free in most screen readers.
 *
 * The feed sits at the top and is separated from the rooms below it, because
 * it is not one of them. A room is a place to talk; the feed is everything
 * anybody has published. Listed as a sixth room it would read as a sixth
 * subject, and people would post to it expecting the Lounge.
 */
export default function RoomList({ current, onSelect }) {
  return (
    <nav className="room-list" aria-label="Rooms and feed">
      <ul role="tablist" aria-orientation="vertical">
        <li>
          <button
            type="button"
            role="tab"
            id="room-tab-feed"
            aria-selected={current === 'feed'}
            aria-controls="room-panel"
            className={`room-item is-feed ${current === 'feed' ? 'active' : ''}`}
            onClick={() => onSelect('feed')}
            title="Everything posted on PulseDex"
          >
            <Rss size={12} />
            <span className="room-name font-mono">Feed</span>
          </button>
        </li>

        <li className="room-divider" aria-hidden="true" />

        {ROOMS.map((room) => {
          const active = room.slug === current
          return (
            <li key={room.slug}>
              <button
                type="button"
                role="tab"
                id={`room-tab-${room.slug}`}
                aria-selected={active}
                aria-controls="room-panel"
                className={`room-item ${active ? 'active' : ''}`}
                onClick={() => onSelect(room.slug)}
                title={room.blurb}
              >
                <span className="room-name font-mono">{room.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
