import { useState } from 'react'
import { Trash2, Ban, Pencil, Check, X, Reply } from 'lucide-react'
import ShareButton from './ShareButton'
import ChatAvatar from './ChatAvatar'
import DevBadge from './DevBadge'
import MessageReactions from './MessageReactions'
import { tallyReactions } from '../../services/chat'
import { messageLength, MAX_MESSAGE_LENGTH } from '../../utils/chatMessage'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'

/**
 * One message, as a bubble.
 *
 * Your own sit right and tinted with the brand green; everyone else's sit left
 * over the panel. That split is the whole reason a bubble layout is worth the
 * horizontal space it costs - a glance tells you who is speaking before you
 * have read a word.
 *
 * The author is shown as their handle when they have one and as a shortened
 * address when they do not, with the address beside the handle whenever both
 * exist. A handle is chosen and two people could once choose the same one;
 * they are unique now, but the address is still what identifies anyone, and
 * "who actually said this" should not depend on trusting a display name.
 *
 * Grouping is deliberately absent. Consecutive messages from one author could
 * tuck under a single header, and on a dense row layout they should - but a
 * bubble already carries its own edge, so a run of them reads as a run without
 * needing the header removed.
 */
export default function ChatMessageRow({
  message,
  isOwn,
  isModerator,
  account,
  onRemove,
  onBlock,
  onOpenProfile,
  onEdit,
  onReact,
  onReply,
  onJumpTo,
  canJump = false,
  highlighted = false,
  /*
   * Two different facts about the same claim, and they must not be one prop.
   *
   * `authorIsDev` is about whoever wrote this message and decides whether the
   * badge is drawn. `viewerIsRoomDev` is about whoever is reading and decides
   * whether they may remove it. Folded into one, the badge's own value would
   * have granted everybody the power to delete the dev's messages - which is
   * precisely backwards.
   *
   * Both are passed down rather than looked up per row: a room is one token,
   * so it is one question, and asking it per message would be fifty identical
   * queries.
   */
  authorIsDev = false,
  viewerIsRoomDev = false,
}) {
  const posted = Date.parse(message.createdAt)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [picking, setPicking] = useState(false)

  const tally = tallyReactions(message.reactions, account)

  /*
   * Who may do what. Three different rules, and they are not the same rule:
   *
   * Removing is yours or a moderator's - somebody who posted a wallet address
   * by mistake should not have to find a moderator to take it back.
   * Editing is yours alone. A moderator can remove a message, which is
   * visible; putting words in somebody's mouth is a different power.
   * Blocking is a moderator's, and never on your own message.
   *
   * All three are checked again by the endpoint. A control that is not drawn
   * is not a permission - it is a button somebody else can send the request
   * without.
   */
  /*
   * Removal widens for a token room's claimant; blocking does not.
   *
   * The split is the whole shape of what a claim buys. Removing a message is
   * visible, reversible by reposting, and confined to the one room somebody
   * proved a connection to. Blocking silences an account across the entire
   * site, and nobody gets that for having sent a transaction.
   */
  const canRemove = isOwn || isModerator || viewerIsRoomDev
  const canEdit = isOwn
  const canBlock = isModerator && !isOwn
  const canReact = Boolean(account)
  /*
   * Replying is everybody's, which is why it is checked separately from the
   * three above rather than folded in with them. Those are permissions over
   * somebody else's message; this is the ordinary thing a reader does, and
   * the only requirement is being signed in enough to post at all.
   */
  const canReply = Boolean(account)

  const length = messageLength(draft)
  const canSave = length > 0 && length <= MAX_MESSAGE_LENGTH && draft !== message.body

  const save = async () => {
    if (!canSave) return
    await onEdit(message.id, draft)
    setEditing(false)
  }

  return (
    <article
      className={`chat-row ${isOwn ? 'own' : ''} ${highlighted ? 'highlighted' : ''}`}
      /* How the panel finds a message to scroll to when a quote is clicked.
         An attribute rather than an `id`, because these ids are database keys
         and a bare number is not a valid one on an element. */
      data-message-id={message.id}
    >
      <button
        type="button"
        className="chat-avatar-button"
        onClick={() => onOpenProfile(message.address)}
        aria-label={`Profile for ${message.handle || formatAddress(message.address)}`}
        title="View profile"
      >
        <ChatAvatar
          address={message.address}
          avatarUrl={message.avatarUrl}
          avatarId={message.avatarId}
          size={32}
        />
      </button>

      <div className="chat-body">
        <header className="chat-meta font-mono">
          <button
            type="button"
            className="chat-author"
            title={message.address}
            onClick={() => onOpenProfile(message.address)}
          >
            {message.handle || formatAddress(message.address)}
          </button>

          {message.handle && (
            <span className="chat-address" title={message.address}>
              {formatAddress(message.address)}
            </span>
          )}

          {/* Only in the room about the token they claimed. The same account
              in the Lounge is just an account - the claim is about one token,
              so the badge belongs where that token is the subject. */}
          {authorIsDev && <DevBadge />}

          <time
            className="chat-time"
            dateTime={message.createdAt}
            title={Number.isFinite(posted) ? new Date(posted).toLocaleString() : undefined}
          >
            {formatTimeAgo(Math.floor(posted / 1000))}
          </time>

          {/*
            Shown whenever the message has been changed, and not optional.
            A silent edit is a way to change what you said after somebody
            answered it - in a room about what to buy, "I said sell" after the
            fact is worth money. This marker is why editing is allowed at all.
          */}
          {message.editedAt && (
            <span
              className="chat-edited"
              title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
            >
              edited
            </span>
          )}
        </header>

        <div className="chat-bubble">
          {/*
            What this message is answering, above it.

            Drawn from the join rather than from text quoted into the body, so
            it follows the original: an edit changes it, a removal blanks it,
            and it can be clicked. `canJump` comes from the panel, which is the
            only thing that knows whether the original is on screen - a quote
            of something 400 messages back must not look like a button that
            does nothing.
          */}
          {!editing && message.reply && (
            <QuotedMessage reply={message.reply} canJump={canJump} onJumpTo={onJumpTo} />
          )}

          {editing ? (
            <div className="chat-edit">
              <textarea
                className="chat-edit-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    save()
                  }
                  if (e.key === 'Escape') setEditing(false)
                }}
                rows={2}
                autoFocus
                aria-label="Edit your message"
              />
              <div className="chat-edit-tools">
                <button
                  type="button"
                  className="chat-tool"
                  onClick={save}
                  disabled={!canSave}
                  aria-label="Save edit"
                  title="Save"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  className="chat-tool"
                  onClick={() => {
                    // Reset as well as close, so reopening starts from what
                    // was actually saved rather than from an abandoned draft.
                    setDraft(message.body)
                    setEditing(false)
                  }}
                  aria-label="Cancel edit"
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            /*
             * Rendered as text, never as markup. Everything here was typed by
             * a stranger, and this is the one place in the app where that is
             * true of something shown at full width. React escapes it; the
             * `white-space: pre-wrap` in the stylesheet keeps the line breaks
             * the author wrote without letting them write tags.
             */
            <p className="chat-text">{message.body}</p>
          )}

          {/*
            Always drawn now, because sharing needs no permission - which is
            why this condition lost its list of them. Everything else here is
            something only some readers may do.
          */}
          {!editing && (
            <div className="chat-tools">
              {/*
                A link to this one message: `/r/<room>#m<id>`. The room comes
                from the message rather than from the panel, so a row rendered
                anywhere - a search result, a token page's chat tab - hands
                over a link that lands in the right place.
              */}
              <ShareButton
                where={{ tab: 'rooms', room: message.room, message: message.id }}
                label="Copy a link to this message"
              />

              {canReply && (
                <button
                  type="button"
                  className="chat-tool"
                  onClick={() => onReply(message)}
                  aria-label={`Reply to ${message.handle || formatAddress(message.address)}`}
                  title="Reply"
                >
                  <Reply size={12} />
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  className="chat-tool"
                  onClick={() => {
                    setDraft(message.body)
                    setEditing(true)
                  }}
                  aria-label="Edit your message"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
              )}

              {canRemove && (
                <button
                  type="button"
                  className="chat-tool danger"
                  onClick={() => onRemove(message.id)}
                  aria-label={isOwn ? 'Delete your message' : 'Remove this message'}
                  title={isOwn ? 'Delete your message' : 'Remove this message'}
                >
                  <Trash2 size={12} />
                </button>
              )}

              {canBlock && (
                <button
                  type="button"
                  className="chat-tool danger"
                  onClick={() => onBlock(message.address)}
                  aria-label="Block this author"
                  title="Block this author from posting"
                >
                  <Ban size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        <MessageReactions
          tally={tally}
          canReact={canReact}
          picking={picking}
          onPick={() => setPicking((v) => !v)}
          onToggle={(emoji, on) => {
            setPicking(false)
            onReact(message.id, emoji, on)
          }}
        />
      </div>
    </article>
  )
}

/**
 * The one-line quote above a reply.
 *
 * A button when the original is loaded and a plain block when it is not,
 * rather than a button that is disabled: a disabled control says "not now",
 * and the truth here is that there is nowhere to go, which is a different
 * thing and does not want a hover state promising otherwise.
 *
 * Clamped to one line. The point is to say which remark is being answered,
 * not to reproduce it - a three-line quote above a one-line reply inverts the
 * room, and whoever wants the whole thing can click through to it.
 */
function QuotedMessage({ reply, canJump, onJumpTo }) {
  const who = reply.handle || formatAddress(reply.address)

  const inner = (
    <>
      <Reply size={11} className="chat-quote-icon" />
      <span className="chat-quote-author">{who}</span>
      {/* Removed messages keep their row and lose their text, so the quote
          says what happened instead of going blank and looking broken. */}
      <span className={`chat-quote-body ${reply.removed ? 'removed' : ''}`}>
        {reply.removed ? 'message removed' : reply.body}
      </span>
    </>
  )

  if (!canJump) return <div className="chat-quote">{inner}</div>

  return (
    <button
      type="button"
      className="chat-quote is-link"
      onClick={() => onJumpTo(reply.id)}
      title={`Go to the message from ${who}`}
    >
      {inner}
    </button>
  )
}
