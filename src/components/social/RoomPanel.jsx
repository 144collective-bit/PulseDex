import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, ChevronUp, Users } from 'lucide-react'
import ChatMessageRow from './ChatMessageRow'
import ChatComposer from './ChatComposer'
import ChatProfileCard from './ChatProfileCard'
import { useChatMessages, CHAT_STATUS } from '../../hooks/useChatMessages'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useRoomPresence } from '../../hooks/useRoomPresence'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { removeMessage, editMessage, setReaction } from '../../services/chat'
import { blockAddress } from '../../services/profile'
import { useChatIdentity } from '../../hooks/useChatIdentity'
import { formatAddress } from '../../utils/formatters'

/** Close enough to the bottom that the reader is following along rather than
 *  reading back through history. */
const FOLLOWING_THRESHOLD_PX = 120

/**
 * One room's conversation.
 *
 * Split out from the page so it can be mounted with the room as its `key`.
 * That is the whole reason this file exists: switching rooms then throws this
 * component away and builds a new one, and every piece of state in it - the
 * messages, the scroll position, whether the reader is following the live end,
 * a failed removal - starts empty because it is new, rather than because
 * something remembered to clear it.
 *
 * The alternative was resetting each of those when the room changed, which
 * works right up until someone adds a sixth piece of state and forgets. A
 * conversation is not the same conversation when the room changes, and saying
 * so to React is cheaper than maintaining the list.
 */
export default function RoomPanel({ room, onOpenProfile }) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const { messages, status, error, add, remove, replace, react, hasMore, loadingOlder, loadOlder } =
    useChatMessages(room)
  const present = useRoomPresence(room)
  const { error: identityError } = useChatIdentity()

  const scroller = useRef(null)
  const [following, setFollowing] = useState(true)
  const [removeError, setRemoveError] = useState(null)

  /*
   * Whose profile is open, or null. An address rather than the message it was
   * opened from: the card is about the person, and two messages from the same
   * author should not be able to open two different versions of them.
   */
  const [openProfile, setOpenProfile] = useState(null)

  /*
   * Follow the conversation, unless the reader has scrolled away from it.
   *
   * Yanking someone back to the bottom while they are reading what was said
   * ten minutes ago is the single most irritating thing a chat does, and it
   * happens every time somebody else types.
   */
  useEffect(() => {
    if (!following) return
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, following])

  /*
   * Hold the reader's place when older messages are prepended.
   *
   * Adding content above the viewport moves everything down by its height, so
   * without this the line someone was reading jumps off the screen and the view
   * lands somewhere in the newly-loaded past. Measuring the scroll height
   * before and after, and adding the difference, keeps the same line under the
   * same pixel.
   *
   * Done in a layout effect rather than an ordinary one: this has to run after
   * the DOM grows but before the browser paints, or the jump is visible.
   */
  const heightBeforeLoad = useRef(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || heightBeforeLoad.current === null) return
    el.scrollTop += el.scrollHeight - heightBeforeLoad.current
    heightBeforeLoad.current = null
  }, [messages])

  const onLoadOlder = useCallback(() => {
    const el = scroller.current
    heightBeforeLoad.current = el ? el.scrollHeight : null
    loadOlder()
  }, [loadOlder])

  // Stable, because ChatProfileCard hangs an Escape listener off it: a fresh
  // arrow every render would tear that listener down and rebuild it on every
  // keystroke in the composer.
  const closeProfile = useCallback(() => setOpenProfile(null), [])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setFollowing(distanceFromBottom < FOLLOWING_THRESHOLD_PX)
  }, [])

  const onBlock = useCallback(async (address) => {
    /*
     * Confirmed, unlike removal. Removing one message is visible and
     * reversible by reposting; blocking silences an account until a moderator
     * undoes it, and there is no undo control in this interface yet.
     */
    const ok = window.confirm(
      `Block ${formatAddress(address)} from posting? Their existing messages stay.`,
    )
    if (!ok) return

    setRemoveError(null)
    try {
      await blockAddress({ address })
    } catch (err) {
      setRemoveError(err.message)
    }
  }, [])

  const onEdit = useCallback(
    async (id, body) => {
      setRemoveError(null)
      try {
        const updated = await editMessage({ id, body })
        // Shown at once rather than waiting for the feed to echo it. The merge
        // absorbs the repeat when it arrives a moment later.
        if (updated) replace(updated)
      } catch (err) {
        setRemoveError(err.message)
      }
    },
    [replace],
  )

  const onReact = useCallback(
    async (id, emoji, on) => {
      setRemoveError(null)

      /*
       * Applied locally first, so pressing a reaction is instant. If the
       * request fails it is put back - which is the right way round for
       * something this small: a reaction that flickers and reverts is a
       * better failure than one that appears to do nothing for a second.
       */
      const mine = account ? account.toLowerCase() : null
      if (mine) react({ message_id: id, address: mine, emoji, on })

      try {
        await setReaction({ id, emoji, on })
      } catch (err) {
        if (mine) react({ message_id: id, address: mine, emoji, on: !on })
        setRemoveError(err.message)
      }
    },
    [account, react],
  )

  const onRemove = useCallback(
    async (id) => {
      setRemoveError(null)
      /*
       * Taken off the screen before the request answers. The realtime feed
       * will say the same thing a moment later and the merge ignores the
       * repeat; if the request fails, the message comes back on the next
       * load, which is the right way round - a moderator seeing a removal
       * they have to redo beats one believing something is gone when it is
       * still on everybody else's screen.
       */
      remove(id)
      try {
        await removeMessage(id)
      } catch (err) {
        setRemoveError(err.message)
      }
    },
    [remove],
  )

  if (status === CHAT_STATUS.unconfigured) {
    return <Notice icon={AlertTriangle}>Chat is not configured on this deployment yet.</Notice>
  }

  if (status === CHAT_STATUS.loading) {
    return (
      <Notice icon={Loader2} spinning>
        Loading the conversation
      </Notice>
    )
  }

  if (status === CHAT_STATUS.failed) {
    return <Notice icon={AlertTriangle}>{error || 'The chat could not be loaded.'}</Notice>
  }

  return (
    <>
      <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
        {hasMore && (
          <button
            type="button"
            className="chat-older font-mono"
            onClick={onLoadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? (
              <Loader2 size={12} className="chat-spin" />
            ) : (
              <ChevronUp size={12} />
            )}
            {loadingOlder ? 'Loading' : 'Load older messages'}
          </button>
        )}

        {messages.length === 0 ? (
          <p className="chat-empty">Nobody has said anything here yet. Go first.</p>
        ) : (
          messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              isOwn={Boolean(account) && message.address === account.toLowerCase()}
              isModerator={isModerator}
              account={account}
              onRemove={onRemove}
              onBlock={onBlock}
              onOpenProfile={setOpenProfile}
              onEdit={onEdit}
              onReact={onReact}
            />
          ))
        )}
      </div>

      {!following && messages.length > 0 && (
        <button
          type="button"
          className="chat-jump font-mono"
          onClick={() => setFollowing(true)}
        >
          Jump to latest
        </button>
      )}

      {(removeError || identityError) && (
        <p className="chat-error" role="alert">
          {removeError || identityError}
        </p>
      )}

      {present > 0 && (
        <p className="chat-presence font-mono" aria-live="polite">
          <Users size={11} />
          {present === 1 ? 'Just you here' : `${present} here`}
        </p>
      )}

      <ChatComposer room={room} onPosted={add} />

      {openProfile && (
        <ChatProfileCard
          address={openProfile}
          canModerate={isModerator}
          onClose={closeProfile}
          onOpenFullProfile={onOpenProfile}
        />
      )}
    </>
  )
}

/** The three states that are not a conversation, said the same way. */
function Notice({ icon: Icon, spinning = false, children }) {
  return (
    <p className="chat-notice">
      <Icon size={15} className={spinning ? 'chat-spin' : undefined} />
      <span>{children}</span>
    </p>
  )
}
