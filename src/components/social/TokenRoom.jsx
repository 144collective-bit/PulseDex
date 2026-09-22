import { useCallback, useState } from 'react'
import RoomPanel from './RoomPanel'
import ClaimToken from './ClaimToken'
import { tokenRoom } from '../../config/rooms'
import { useTokenClaim } from '../../hooks/useTokenClaim'
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

  const { claim, refresh } = useTokenClaim(address)

  /*
   * Bumped when a claim lands, and used as the panel's key.
   *
   * The panel reads the claim itself, to badge the right author's messages.
   * Rather than threading a second copy into it - and giving a shared
   * component a prop only this caller has - a successful claim remounts it,
   * which makes it ask again. It happens once in the life of a token, to the
   * person who just watched their own wallet pop up, so the cost of throwing
   * away a loaded conversation is a reload nobody else ever sees.
   */
  const [claimed, setClaimed] = useState(0)

  const onClaimed = useCallback(() => {
    refresh()
    setClaimed((n) => n + 1)
  }, [refresh])

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
      {/*
        Above the conversation, because it is about who this room belongs to
        rather than about anything said in it - and because the badge it
        grants shows up on the messages below.
      */}
      <ClaimToken token={address} claim={claim} onClaimed={onClaimed} />

      <RoomPanel
        key={`${room}:${claimed}`}
        room={room}
        onOpenProfile={onOpenProfile}
        onSeen={noop}
      />
    </div>
  )
}
