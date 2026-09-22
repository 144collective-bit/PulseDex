import { Loader2, Search, CornerDownRight } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { useMessageSearch, SEARCH_STATUS } from '../../hooks/useMessageSearch'
import { SEARCH_LIMIT } from '../../services/chat'
import { splitHighlight } from '../../utils/chatSearch'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'

/**
 * What was said in this room, matching a phrase.
 *
 * Shown in place of the conversation rather than over it. An overlay would
 * need a way out that is not the box you are typing in, and the conversation
 * is still one keystroke away - clearing the field puts it back, unchanged,
 * because the room underneath was never unmounted.
 *
 * A result is a reading surface first and a link second. Most of what search
 * turns up is older than the fifty messages on screen, and there is no honest
 * way to scroll to something the room is not holding - so each result shows
 * the whole message, and offers to jump only for the ones that are actually
 * down there. A button that scrolls nowhere is worse than no button.
 */
export default function RoomSearchResults({ room, term, loadedIds, onJumpTo, onOpenProfile }) {
  const { results, matched, status, error, term: asked } = useMessageSearch(room, term)

  if (status === SEARCH_STATUS.failed) {
    return (
      <div className="chat-results">
        <p className="chat-error" role="alert">
          {error}
        </p>
      </div>
    )
  }

  /*
   * The spinner shows only while there is nothing to show. Once results are
   * on screen, refining the term leaves them in place until the new ones
   * arrive - swapping a list for a spinner on every keystroke makes a search
   * box flash, and the previous results are the better guess in the meantime.
   */
  if (status === SEARCH_STATUS.searching && results.length === 0) {
    return (
      <div className="chat-results">
        <p className="chat-results-note">
          <Loader2 size={14} className="chat-spin" />
          Searching this room
        </p>
      </div>
    )
  }

  if (status === SEARCH_STATUS.done && results.length === 0) {
    return (
      <div className="chat-results">
        <p className="chat-results-note">
          <Search size={14} />
          Nothing in this room matches “{asked}”.
        </p>
      </div>
    )
  }

  return (
    <div className="chat-results">
      <p className="chat-results-count font-mono">
        {/* Said plainly when the list is capped, so a room where the phrase
            appears two hundred times does not read as one where it appears
            exactly thirty. */}
        {results.length >= SEARCH_LIMIT
          ? `First ${SEARCH_LIMIT} matches, newest first`
          : `${results.length} match${results.length === 1 ? '' : 'es'}, newest first`}
      </p>

      {results.map((message) => {
        const posted = Date.parse(message.createdAt)
        const here = loadedIds.has(message.id)

        return (
          <article className="chat-result" key={message.id}>
            <button
              type="button"
              className="chat-avatar-button"
              onClick={() => onOpenProfile(message.address)}
              aria-label={`Profile for ${message.handle || formatAddress(message.address)}`}
            >
              <ChatAvatar
                address={message.address}
                avatarUrl={message.avatarUrl}
                avatarId={message.avatarId}
                size={24}
              />
            </button>

            <div className="chat-result-body">
              <header className="chat-meta font-mono">
                <span className="chat-author">
                  {message.handle || formatAddress(message.address)}
                </span>
                <time
                  className="chat-time"
                  dateTime={message.createdAt}
                  title={Number.isFinite(posted) ? new Date(posted).toLocaleString() : undefined}
                >
                  {formatTimeAgo(Math.floor(posted / 1000))}
                </time>

                {/* Offered only where it can be honoured. */}
                {here && (
                  <button
                    type="button"
                    className="chat-result-jump"
                    onClick={() => onJumpTo(message.id)}
                  >
                    <CornerDownRight size={11} />
                    Go to it
                  </button>
                )}
              </header>

              {/*
                Rendered as segments rather than as markup with the match
                wrapped in it. Both the message and the term were typed by
                somebody else, and building HTML out of the pair is the one
                shape of this feature that could put a stranger's tags on the
                page.
              */}
              <p className="chat-text">
                {splitHighlight(message.body, matched).map((segment, i) =>
                  segment.match ? (
                    <mark className="chat-hit" key={i}>
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  ),
                )}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
