import { useRef, useState } from 'react'
import { PenLine, Loader2 } from 'lucide-react'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { createPost } from '../../services/posts'
import { postLength, MAX_POST_LENGTH } from '../../utils/post'
import { useMentionPicker } from '../../hooks/useMentionPicker'
import ChatAvatar from './ChatAvatar'
import { formatAddress } from '../../utils/formatters'

/** Show the counter once it is worth watching, not from the first letter. */
const COUNTER_APPEARS_AT = MAX_POST_LENGTH - 300

/**
 * The box you write a post in.
 *
 * Close to ChatComposer and deliberately not shared with it. The two differ in
 * the thing a composer is mostly made of - what Enter does. In a chat Enter
 * sends, because a message is a line and the next one is coming; in a post it
 * makes a paragraph, because the whole reason a post may be two thousand
 * characters is that it can have shape. One component taking that as a prop
 * would be a component whose only real content is a conditional.
 */
export default function PostComposer({ onPosted, parentId = null }) {
  const { isSignedIn, isBusy, signIn } = useSiweAuth()

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const input = useRef(null)

  /*
   * Naming somebody, by picking them rather than by typing their name.
   *
   * The only way to mention an account whose handle contains a space - see
   * src/hooks/useMentionPicker.js. Not offered in the chat composer, where a
   * mention notifies nobody.
   */
  const mention = useMentionPicker({ value: draft, onChange: setDraft, inputRef: input })

  const length = postLength(draft)
  const overLimit = length > MAX_POST_LENGTH
  const canSend = length > 0 && !overLimit && !sending

  async function send(event) {
    event.preventDefault()
    if (!canSend) return

    setSending(true)
    setError(null)

    try {
      const post = await createPost(draft, parentId, mention.mentions)

      /*
       * Cleared only after the post succeeds. Clearing optimistically reads
       * better right up until the request fails, at which point two thousand
       * characters somebody just wrote are gone and the error is about a post
       * they can no longer see. That is a worse trade here than in the chat,
       * where the lost text is one line.
       */
      setDraft('')
      // Nobody picked, for the next post. Otherwise an address picked here
      // rides along with whatever is written next.
      mention.reset()
      if (post) onPosted(post)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="feed-composer feed-signin">
        <p className="chat-signin-text">
          Sign in with your wallet to {parentId ? 'reply' : 'post'}.
        </p>
        <button type="button" className="chat-send" onClick={signIn} disabled={isBusy}>
          {isBusy ? <Loader2 size={14} className="chat-spin" /> : null}
          {isBusy ? 'Signing in' : 'Sign in'}
        </button>
      </div>
    )
  }

  return (
    <form className="feed-composer" onSubmit={send}>
      <textarea
        ref={input}
        className="feed-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          mention.refresh()
        }}
        /* Moving the caret into a half-typed name should offer it, not only
           typing one. `selectionchange` on the document would be the thorough
           way and fires for every selection on the page. */
        onKeyUp={mention.refresh}
        onClick={mention.refresh}
        onKeyDown={(e) => {
          // The list owns the arrows and Enter while it is open. Without
          // this, Enter would pick a name and add a paragraph.
          mention.onKeyDown(e)
        }}
        /* Closed on the way out, but not before a click on the list has
           landed - `mousedown` on an option runs first and picks. */
        onBlur={() => setTimeout(() => mention.open && mention.reset(), 150)}
        placeholder={parentId ? 'Post your reply' : "What's happening on PulseChain?"}
        rows={parentId ? 2 : 3}
        role="combobox"
        aria-expanded={mention.open}
        aria-autocomplete="list"
        aria-controls="mention-options"
        /*
         * Twice the limit, so paste is not silently truncated at exactly the
         * boundary. What the counter says and what the server enforces is the
         * real limit; this only stops the box holding a novel.
         */
        maxLength={MAX_POST_LENGTH * 2}
        aria-label="Your post"
      />

      {/*
        Who you might mean.

        Under the box rather than floating over the text. A popover following
        the caret is what a desktop editor does and needs measuring the
        textarea's contents to place; this is a composer three lines tall, and
        a list under it is never in the way of what is being written.
      */}
      {mention.open && (
        <ul className="mention-options" id="mention-options" role="listbox">
          {mention.options.map((person, i) => (
            <li key={person.address} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === mention.active}
                className={`mention-option ${i === mention.active ? 'is-active' : ''}`}
                /* mousedown, not click: the textarea blurs first on a click
                   and the list would be gone before the press landed. */
                onMouseDown={(e) => {
                  e.preventDefault()
                  mention.pick(person)
                }}
                onMouseEnter={() => mention.setActive(i)}
              >
                <ChatAvatar
                  address={person.address}
                  avatarId={person.avatarId}
                  avatarUrl={person.avatarUrl}
                  size={20}
                />
                <span className="mention-handle font-mono">{person.handle}</span>
                {/* The address beside the name, always. A handle is chosen,
                    and on a site about what to buy, being mistaken for
                    somebody trusted is worth money. */}
                <span className="mention-address font-mono">{formatAddress(person.address)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="feed-composer-foot">
        {error ? (
          <span className="chat-error" role="alert">
            {error}
          </span>
        ) : (
          <span className="chat-hint font-mono">
            {parentId ? 'Replies show on your profile too' : 'Posts stay on your profile'}
          </span>
        )}

        {/*
         * Counted by the same function the server enforces with, so this
         * number and the one that decides cannot disagree.
         */}
        {length >= COUNTER_APPEARS_AT && (
          <span className={`chat-count font-mono ${overLimit ? 'over' : ''}`}>
            {length} / {MAX_POST_LENGTH}
          </span>
        )}

        <button type="submit" className="chat-send" disabled={!canSend}>
          {sending ? <Loader2 size={14} className="chat-spin" /> : <PenLine size={14} />}
          {sending ? 'Posting' : parentId ? 'Reply' : 'Post'}
        </button>
      </div>
    </form>
  )
}
