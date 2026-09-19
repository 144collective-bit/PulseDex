import { SmilePlus } from 'lucide-react'
import { REACTIONS } from '../../config/reactions'

/**
 * The reactions under a message, and the way to add one.
 *
 * Only reactions somebody has actually left are shown. An always-visible row
 * of six greyed emoji would triple the height of every message in the room to
 * display nothing - the picker is behind one button, and the tallies stand on
 * their own once they exist.
 *
 * Your own are outlined, which is what makes the button a toggle rather than a
 * counter: pressing one you are already in takes it back, and the outline is
 * the only thing on screen that says so beforehand.
 */
export default function MessageReactions({ tally, canReact, onToggle, picking, onPick }) {
  // Nothing left and no way to leave one: draw nothing rather than an empty
  // row that pushes every message apart.
  if (!tally.length && !canReact) return null

  return (
    <div className="chat-reactions">
      {tally.map((entry) => (
        <button
          key={entry.emoji}
          type="button"
          className={`chat-reaction ${entry.mine ? 'is-mine' : ''}`}
          onClick={() => onToggle(entry.emoji, !entry.mine)}
          disabled={!canReact}
          aria-pressed={entry.mine}
          title={entry.mine ? 'Take back your reaction' : 'React'}
        >
          <span aria-hidden="true">{entry.emoji}</span>
          <span className="chat-reaction-count font-mono">{entry.count}</span>
        </button>
      ))}

      {canReact && (
        <div className="chat-reaction-add">
          <button
            type="button"
            className="chat-reaction is-add"
            onClick={onPick}
            aria-expanded={picking}
            aria-label="Add a reaction"
            title="Add a reaction"
          >
            <SmilePlus size={12} />
          </button>

          {picking && (
            /*
             * A fixed six rather than an emoji picker. The value is stored and
             * then drawn beside somebody else's words, so free text here would
             * be a way to post arbitrary content without it being a message -
             * past the length limit, past the invisible-character stripping,
             * and past the rate limit on posting.
             */
            <div className="chat-reaction-menu" role="menu">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  role="menuitem"
                  className="chat-reaction-option"
                  onClick={() => onToggle(reaction.emoji, true)}
                  title={reaction.label}
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                  <span className="visually-hidden">{reaction.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
