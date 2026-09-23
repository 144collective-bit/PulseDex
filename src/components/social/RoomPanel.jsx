import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle, ChevronUp, Users, PenLine, Search, X, Lock, CornerUpLeft } from 'lucide-react'
import ChatMessageRow from './ChatMessageRow'
import ChatComposer from './ChatComposer'
import ChatProfileCard from './ChatProfileCard'
import RoomSearchResults from './RoomSearchResults'
import { useChatMessages, CHAT_STATUS } from '../../hooks/useChatMessages'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useRoomPresence } from '../../hooks/useRoomPresence'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { removeMessage, editMessage, setReaction } from '../../services/chat'
import { blockAddress } from '../../services/profile'
import { useChatIdentity } from '../../hooks/useChatIdentity'
import { useUserProfile } from '../../context/UserProfileContext'
import { typingLine, countAfter } from '../../utils/chatPresence'
import { searchTerm } from '../../utils/chatSearch'
import { roomToken } from '../../config/rooms'
import { fromBaseUnits, roomGate } from '../../utils/gate'
import { useTokenClaim } from '../../hooks/useTokenClaim'
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
export default function RoomPanel({
  room,
  onOpenProfile,
  onSeen,
  gatedOn = null,
  /* A message somebody was linked to, from `/r/<slug>#m<id>`. Null for an
     ordinary visit, which is almost every visit. */
  focusMessage = null,
}) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const { messages, status, error, add, remove, replace, react, hasMore, loadingOlder, loadOlder } =
    useChatMessages(room)
  const { profile } = useUserProfile()

  /*
   * Who, if anybody, has claimed the token this room is about.
   *
   * One question per room rather than per message: a room is one token, so
   * the answer is the same for every row in it. Null for the five fixed
   * rooms, which are about no token and where nobody carries this badge.
   */
  /*
   * The room's gate in words, or null.
   *
   * Passed in rather than fetched: the caller already holds the room row -
   * the sidebar listed it, the token page loaded it - and a second query per
   * room open would be one for a string that is never used to decide
   * anything.
   */
  const gate = describeGate(gatedOn)

  const { claim } = useTokenClaim(roomToken(room))
  const devAddress = claim?.address || null

  /*
   * Whether the person reading may moderate this room because they claimed
   * its token. Separate from `devAddress`, which is about the author of a
   * given message - see ChatMessageRow for why keeping them apart matters.
   *
   * The endpoint checks the same thing again on every removal. A control that
   * is not drawn is not a permission; it is a button somebody else can send
   * the request without.
   */
  const viewerIsRoomDev =
    Boolean(devAddress) && Boolean(account) && account.toLowerCase() === devAddress
  /*
   * The name broadcast while typing. Whatever this account is called here,
   * falling back to nothing rather than to an address: "0x1a2b... is typing"
   * is noise, and an unnamed typer is simply not announced.
   */
  const present = useRoomPresence(room, { name: profile?.username || profile?.displayName || null })

  /*
   * Reading a room while it moves keeps it read.
   *
   * Without this, sitting in a busy room for ten minutes marks it read as of
   * when it was opened, and everything said while it was on the screen comes
   * back as unread the moment the reader leaves. Keyed on the newest message
   * rather than the count, so an older page loading in does not re-mark
   * anything.
   */
  const newest = messages.length > 0 ? messages[messages.length - 1].id : null

  useEffect(() => {
    if (newest) onSeen?.()
  }, [newest, onSeen])
  const { error: identityError } = useChatIdentity()

  const scroller = useRef(null)
  const [following, setFollowing] = useState(true)
  const [removeError, setRemoveError] = useState(null)

  /*
   * What is in the search box.
   *
   * Held here rather than inside the search component because the room has to
   * know: while there is a term the conversation is replaced by the results,
   * and the controls that are about a scroll position have nothing to point
   * at. Kept as raw text - trimming it here would stop anybody typing a space
   * between two words.
   */
  const [query, setQuery] = useState('')
  const searching = searchTerm(query).length > 0

  /*
   * What the composer is answering, or null.
   *
   * Held here rather than in the composer because it is started from a message
   * row, and the two are siblings. Flattened to what the strip needs - a name
   * and a line of text - so holding it does not pin a whole message object in
   * state long after the list has replaced it.
   *
   * Nothing clears it on a room change: this panel is mounted with the room as
   * its key, so switching rooms builds a new one and this starts null because
   * it is new.
   */
  const [replyTo, setReplyTo] = useState(null)
  const cancelReply = useCallback(() => setReplyTo(null), [])

  const onReply = useCallback((message) => {
    setReplyTo({
      id: message.id,
      name: message.handle || formatAddress(message.address),
      body: message.body,
    })
  }, [])

  /*
   * Which message a quote or a result has just been followed to, so it can be
   * marked for a moment. Landing in the middle of a wall of text with no
   * indication of which line was the destination is the failure mode of every
   * jump-to-message that does not do this.
   */
  const [highlighted, setHighlighted] = useState(null)
  const highlightTimer = useRef(null)
  useEffect(() => () => clearTimeout(highlightTimer.current), [])

  /*
   * Which messages are on screen, for deciding whether a quote or a result
   * can be followed. Built once per render rather than searched per row: a
   * room holds fifty messages and a scan of the list from each of them is the
   * kind of quadratic that only shows up once somebody has a long room open
   * on a phone.
   */
  const loadedIds = useMemo(() => new Set(messages.map((m) => m.id)), [messages])

  const onJumpTo = useCallback((id) => {
    /*
     * Out of the results before the scroll. The conversation is still mounted
     * underneath - that is the point of hiding it rather than unmounting it -
     * but it is `display: none`, and scrolling something with no box does
     * nothing at all. A frame later it has one.
     */
    setQuery('')

    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector(`[data-message-id="${id}"]`)
      if (!el) return

      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setHighlighted(id)
      clearTimeout(highlightTimer.current)
      highlightTimer.current = setTimeout(() => setHighlighted(null), 1600)
    })
  }, [])

  /*
   * Somebody arrived on a link to one message.
   *
   * Fired once per id rather than whenever the list changes: the list grows
   * as older pages load and as people talk, and re-jumping on each of those
   * would drag the reader back to the linked message every time anybody said
   * anything.
   *
   * Below `onJumpTo` and `loadedIds`, and that is not cosmetic - the same
   * mistake in this file once threw "Cannot access before initialization" on
   * every room open, past lint, the suite and the build.
   */
  const jumped = useRef(null)

  useEffect(() => {
    if (!focusMessage || jumped.current === focusMessage) return
    // Not loaded yet. Either the page has not arrived or the message is
    // further back than it reaches; the notice below covers the second case.
    if (!loadedIds.has(focusMessage)) return

    jumped.current = focusMessage
    onJumpTo(focusMessage)
  }, [focusMessage, loadedIds, onJumpTo])

  /*
   * Whether to say that the linked message is not on screen.
   *
   * Only once the room has loaded, so this does not flash while the first
   * page is in flight - and it goes away by itself if loading older messages
   * brings the message into view, because `loadedIds` is what it is computed
   * from.
   */
  const missingFocus =
    Boolean(focusMessage) && status === CHAT_STATUS.ready && !loadedIds.has(focusMessage)

  /*
   * How much arrived while the reader was not looking at the live end.
   *
   * Below `following`, and that is not cosmetic - it read it from above and
   * threw "Cannot access before initialization" the moment the room opened,
   * which lint, 855 tests and the build all passed.
   *
   * Marked by the newest message at the moment they scrolled away, and
   * counted forward from it rather than by comparing list lengths: the list
   * also grows upward when older messages load, and a length comparison calls
   * a backfill of fifty fifty new arrivals.
   */
  const awayFrom = useRef(null)
  useEffect(() => {
    // Only on the way out. Setting it while following would move the mark to
    // every new message and the count would never be anything but zero.
    if (!following && awayFrom.current === null) awayFrom.current = newest
    if (following) awayFrom.current = null
  }, [following, newest])

  const missed = following ? 0 : countAfter(messages, awayFrom.current)

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
      {/*
        Above the conversation rather than in the room's header, because it
        searches this room and only this room - put beside the room's title it
        would read as searching the chat, which is deliberately not what it
        does.
      */}
      <div className="chat-search">
        <Search size={13} className="chat-search-icon" />
        <input
          type="search"
          className="chat-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears, which is what a browser's own search field does
            // and what people try before looking for a button.
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Search this room"
          aria-label="Search this room"
        />
        {searching && (
          <button
            type="button"
            className="chat-tool"
            onClick={() => setQuery('')}
            aria-label="Clear the search"
            title="Clear"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/*
        The results stand in for the conversation while there is a term, and
        the conversation is not unmounted - it is this component's own state,
        so clearing the box puts it back exactly as it was rather than
        reloading the room.
      */}
      {searching && (
        <RoomSearchResults
          room={room}
          term={query}
          loadedIds={loadedIds}
          onJumpTo={onJumpTo}
          onOpenProfile={setOpenProfile}
        />
      )}

      <div className={`chat-scroll ${searching ? 'is-hidden' : ''}`} ref={scroller} onScroll={onScroll}>
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
              authorIsDev={Boolean(devAddress) && message.address === devAddress}
              viewerIsRoomDev={viewerIsRoomDev}
              onReply={onReply}
              onJumpTo={onJumpTo}
              canJump={Boolean(message.reply) && loadedIds.has(message.reply.id)}
              highlighted={highlighted === message.id}
            />
          ))
        )}
      </div>

      {/* Hidden while searching: it is about a scroll position in a list that
          is not on screen, and pressing it would look like it did nothing. */}
      {!searching && !following && messages.length > 0 && (
        <button
          type="button"
          className={`chat-jump font-mono ${missed > 0 ? 'has-new' : ''}`}
          onClick={() => setFollowing(true)}
        >
          {/*
            The count is the whole point of the button on a busy room. "Jump
            to latest" says there is a bottom; "12 new messages" says whether
            going there is worth losing your place.
          */}
          {missed > 0
            ? `${missed > 99 ? '99+' : missed} new message${missed === 1 ? '' : 's'}`
            : 'Jump to latest'}
        </button>
      )}

      {(removeError || identityError) && (
        <p className="chat-error" role="alert">
          {removeError || identityError}
        </p>
      )}

      {/*
        Typing, where there is any, and the head count otherwise.

        One line, not two. They answer the same question - is anybody else
        here - and stacking them means the composer jumps down the moment
        somebody touches a key, which moves the thing the reader is aiming at.
      */}
      {present.typing.length > 0 ? (
        <p className="chat-presence is-typing font-mono" aria-live="polite">
          <PenLine size={11} />
          {typingLine(present.typing)}
        </p>
      ) : (
        present.count > 0 && (
          <p className="chat-presence font-mono" aria-live="polite">
            <Users size={11} />
            {present.count === 1 ? 'Just you here' : `${present.count} here`}
          </p>
        )
      )}

      {/*
        What this room requires, said before anybody types.

        Nothing here enforces it - the endpoint checks a balance on every
        write, and a client-side check would be decoration. This exists so
        that a refusal is not the first anybody hears of the rule: writing
        three sentences and then being told the room is for holders is a
        worse experience than knowing going in.
      */}
      {/*
        A link to a message further back than this page reaches.

        Said rather than swallowed: somebody who followed a link and landed on
        an ordinary room would otherwise think the link was broken, when what
        actually happened is that the conversation has moved on past it.
      */}
      {missingFocus && (
        <p className="chat-gate font-mono" role="status">
          <CornerUpLeft size={11} />
          That message is further back — load older messages to reach it.
        </p>
      )}

      {gate && (
        <p className="chat-gate font-mono">
          <Lock size={11} />
          Holders only: {gate}
        </p>
      )}

      <ChatComposer
        room={room}
        onPosted={add}
        onTyping={present.setTyping}
        replyTo={replyTo}
        onCancelReply={cancelReply}
      />

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

/**
 * A room's holders-only rule, in words, or null when there is not one.
 *
 * Built from what was stored when the gate was set rather than from a fresh
 * chain read: the decimals and symbol were captured then precisely so drawing
 * this costs nothing. Falls back to base units rather than to silence - a
 * rule that cannot state itself is a rule nobody can satisfy on purpose.
 */
function describeGate(room) {
  const gate = roomGate(room)
  if (!gate) return null

  const amount = fromBaseUnits(room.min_balance, room.gate_decimals)
  const symbol = room.gate_symbol || 'tokens'
  return amount ? `${amount} ${symbol}` : `${room.min_balance} base units`
}
