import { ROOMS, isTokenRoom, tokenRoomLabel } from '../../config/rooms'
import { useTokenRooms } from '../../hooks/useTokenRooms'

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
 *
 * Two groups now, and the split is real rather than decorative. The five were
 * written by a person, are the same five on every deployment, and are always
 * here. A token room exists because somebody said something about a token,
 * there is one for every address anybody cares to open, and the list below
 * is the handful with something happening in them - so the second group
 * changes under the reader while the first never does. Presenting them as one
 * list would mean a room appearing and disappearing among the fixtures.
 */
export default function RoomList({ current, onSelect, unread = {} }) {
  const tokenRooms = useTokenRooms()

  /*
   * The room being read, when it is a token room nobody else is talking in.
   *
   * Without this, opening a quiet token room from a chart and then coming to
   * the sidebar shows no room selected at all - the list holds the busiest
   * eight and this one is not among them. Prepended rather than sorted in, so
   * where the reader is stays where they can see it.
   */
  const listed = tokenRooms.some((room) => room.slug === current)
  const shown =
    !listed && isTokenRoom(current)
      ? [{ slug: current, address: null, messageCount: 0 }, ...tokenRooms]
      : tokenRooms

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
                {/*
                  Only where there is something, and never on the room being
                  read. A badge showing "0" is a badge that has stopped
                  meaning anything, and one on the room in front of you is
                  counting what you are looking at.
                */}
                {!active && unread[room.slug] > 0 && (
                  <span
                    className="room-unread"
                    aria-label={`${unread[room.slug]} unread`}
                  >
                    {unread[room.slug] > 99 ? '99+' : unread[room.slug]}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {shown.length > 0 && (
        <>
          <h2 className="room-group font-mono">Tokens</h2>
          <ul role="tablist" aria-orientation="vertical">
            {shown.map((room) => {
              const active = room.slug === current
              return (
                <li key={room.slug}>
                  <button
                    type="button"
                    role="tab"
                    id={`room-tab-${room.slug}`}
                    aria-selected={active}
                    aria-controls="room-panel"
                    className={`room-item is-token ${active ? 'active' : ''}`}
                    onClick={() => onSelect(room.slug)}
                  >
                    {/*
                      The address, shortened, because a token room has no
                      name. One could be taken from whoever posted first,
                      which would put a stranger's text - "OFFICIAL", "DO NOT
                      BUY" - on a room about somebody else's token, in a
                      sidebar everybody sees.
                    */}
                    <span className="room-name font-mono">{tokenRoomLabel(room.slug)}</span>

                    {/*
                      How much has been said, rather than how much is unread.
                      These rooms carry no unread badge: the badges are for
                      the five somebody watches, and a count on every token
                      anybody has ever mentioned is a column of numbers about
                      conversations the reader never joined.
                    */}
                    {room.messageCount > 0 && (
                      <span className="room-count font-mono">{room.messageCount}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </nav>
  )
}
