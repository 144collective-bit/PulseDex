import { useState } from 'react'
import { Trash2, Ban, Pencil, Check, X } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
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
  const canRemove = isOwn || isModerator
  const canEdit = isOwn
  const canBlock = isModerator && !isOwn
  const canReact = Boolean(account)

  const length = messageLength(draft)
  const canSave = length > 0 && length <= MAX_MESSAGE_LENGTH && draft !== message.body

  const save = async () => {
    if (!canSave) return
    await onEdit(message.id, draft)
    setEditing(false)
  }

  return (
    <article className={`chat-row ${isOwn ? 'own' : ''}`}>
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

          {!editing && (canRemove || canEdit || canBlock) && (
            <div className="chat-tools">
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
