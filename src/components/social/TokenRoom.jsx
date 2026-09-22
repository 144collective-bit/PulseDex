import { useCallback } from 'react'
import RoomPanel from './RoomPanel'
import { tokenRoom } from '../../config/rooms'
import '../../styles/social.css'

/**
 * The conversation about one token, on the token's own page.
 *
 * The same `RoomPanel` the chat section renders, in different chrome - which
 * is the whole reason this file is three lines of logic. Replies, search,
 * moderation, presence and the sign-in wall are not reimplemented here, so a
 * fix to any of them lands in both places, and the room somebody reaches from
 * a chart is the same room somebody reaches from the sidebar rather than a
 * second one that happens to share a name.
 *
 * Keyed by the room upstream for the same reason the chat section keys it:
 * every piece of state inside belongs to one conversation.
 *
 * `social.css` is imported here as well as by SocialView, and that is not
 * redundant. Vite attaches a stylesheet to whichever chunk imports it, and
 * these are two lazy entry points - the token page reached directly at
 * /token/<address> loads none of the social chunk, so without this import the
 * chat renders completely unstyled. That has happened once already, on the
 * public profile page.
 */
export default function TokenRoom({ address, onOpenProfile }) {
  const room = tokenRoom(address)

  /*
   * Nothing to mark read from here.
   *
   * The unread badges are for the five rooms in the sidebar. A token room is
   * reached by opening the token, not by watching a list for a number to
   * appear, so there is no badge to clear and no reason to write a read mark
   * on every chart somebody looks at.
   */
  const noop = useCallback(() => {}, [])

  /*
   * A token whose address has not resolved yet - or is not an address at all.
   * `tokenRoom` returns null rather than building `token-undefined`, and the
   * honest thing to draw for a room that cannot be named is nothing.
   */
  if (!room) return null

  return (
    <div className="token-room">
      <RoomPanel key={room} room={room} onOpenProfile={onOpenProfile} onSeen={noop} />
    </div>
  )
}
