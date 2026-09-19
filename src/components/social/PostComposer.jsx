import { useState } from 'react'
import { PenLine, Loader2 } from 'lucide-react'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { createPost } from '../../services/posts'
import { postLength, MAX_POST_LENGTH } from '../../utils/post'

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

  const length = postLength(draft)
  const overLimit = length > MAX_POST_LENGTH
  const canSend = length > 0 && !overLimit && !sending

  async function send(event) {
    event.preventDefault()
    if (!canSend) return

    setSending(true)
    setError(null)

    try {
      const post = await createPost(draft, parentId)

      /*
       * Cleared only after the post succeeds. Clearing optimistically reads
       * better right up until the request fails, at which point two thousand
       * characters somebody just wrote are gone and the error is about a post
       * they can no longer see. That is a worse trade here than in the chat,
       * where the lost text is one line.
       */
      setDraft('')
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
        className="feed-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={parentId ? 'Post your reply' : "What's happening on PulseChain?"}
        rows={parentId ? 2 : 3}
        /*
         * Twice the limit, so paste is not silently truncated at exactly the
         * boundary. What the counter says and what the server enforces is the
         * real limit; this only stops the box holding a novel.
         */
        maxLength={MAX_POST_LENGTH * 2}
        aria-label="Your post"
      />

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
