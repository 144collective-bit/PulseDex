import { Trash2, Ban } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
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
export default function ChatMessageRow({ message, isOwn, canRemove, onRemove, onBlock, onOpenProfile }) {
  const posted = Date.parse(message.createdAt)

  return (
    <article className={`chat-row ${isOwn ? 'own' : ''}`}>
      {/*
        A real button, not a div that listens for clicks. It opens a dialog,
        so it has to be reachable by keyboard and has to say what it does - and
        the avatar inside it is aria-hidden, which would leave a stop
        announcing nothing at all without the label.
      */}
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
        </header>

        <div className="chat-bubble">
          {/*
           * Rendered as text, never as markup. Everything here was typed by a
           * stranger, and this is the one place in the app where that is true
           * of something shown at full width. React escapes it; the
           * `white-space: pre-wrap` in the stylesheet keeps the line breaks
           * the author wrote without letting them write tags.
           */}
          <p className="chat-text">{message.body}</p>

          {canRemove && (
            <div className="chat-tools">
              <button
                type="button"
                className="chat-tool"
                onClick={() => onRemove(message.id)}
                aria-label="Remove this message"
                title="Remove this message"
              >
                <Trash2 size={12} />
              </button>

              <button
                type="button"
                className="chat-tool danger"
                onClick={() => onBlock(message.address)}
                aria-label="Block this author"
                title="Block this author from posting"
              >
                <Ban size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
