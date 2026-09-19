import { Trash2 } from 'lucide-react'
import { PRESET_AVATARS } from '../../context/UserProfileContext'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'

/**
 * One message.
 *
 * The author is shown as their handle when they have set one and as a
 * shortened address when they have not - but the address is always present
 * underneath, because a handle is a display name anybody can choose and two
 * people can choose the same one. On a chat about which tokens to buy, "who
 * actually said this" has to be answerable without trusting the name.
 */
export default function ChatMessageRow({ message, isOwn, canRemove, onRemove }) {
  const avatar =
    PRESET_AVATARS.find((a) => a.id === message.avatarId) || PRESET_AVATARS[0]

  const posted = Date.parse(message.createdAt)

  return (
    <article className={`chat-row ${isOwn ? 'own' : ''}`}>
      <div
        className="chat-avatar"
        style={{ background: avatar.bg }}
        aria-hidden="true"
      >
        <span>{avatar.icon}</span>
      </div>

      <div className="chat-body">
        <header className="chat-meta font-mono">
          <span className="chat-author" title={message.address}>
            {message.handle || formatAddress(message.address)}
          </span>

          {/*
           * Shown beside a handle, and only then. The name is chosen and two
           * people can choose the same one, so the address has to be on the
           * row for anyone to be told apart - but when there is no handle the
           * author is already the address, and printing it twice reads as a
           * bug rather than as care.
           */}
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

          {canRemove && (
            <button
              type="button"
              className="chat-remove"
              onClick={() => onRemove(message.id)}
              aria-label="Remove this message"
              title="Remove this message"
            >
              <Trash2 size={12} />
            </button>
          )}
        </header>

        {/*
         * Rendered as text, never as markup. Everything in here was typed by a
         * stranger, and this is the one place in the app where that is true of
         * something displayed at full width. React escapes it by default; the
         * `white-space: pre-wrap` in the stylesheet is what keeps the line
         * breaks the author wrote without letting them write tags.
         */}
        <p className="chat-text">{message.body}</p>
      </div>
    </article>
  )
}
