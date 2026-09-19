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
 * Rooms and nothing else. The feed briefly lived at the top of this list and
 * has moved to a tab of its own, which is where it belonged: a room is a
 * place to talk, the feed is everything anybody published, and listing them
 * together made the feed read as a sixth subject.
 */
export default function RoomList({ current, onSelect }) {
  return (
    <nav className="room-list" aria-label="Chat rooms">
      <ul role="tablist" aria-orientation="vertical">
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
