import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { useUserProfile } from '../../context/UserProfileContext'
import { postMessage } from '../../services/chat'
import { messageLength, MAX_MESSAGE_LENGTH } from '../../utils/chatMessage'

/** Show the counter once it is worth watching, not from the first letter. */
const COUNTER_APPEARS_AT = MAX_MESSAGE_LENGTH - 100

/**
 * The box you type in, and the sign-in wall in front of it.
 *
 * Reading the chat needs nothing; posting needs a wallet signature. The wall
 * is here rather than over the whole page because a conversation nobody can
 * read until they connect a wallet is a conversation nobody joins.
 */
export default function ChatComposer({ room, onPosted }) {
  const { isSignedIn, isBusy, signIn } = useSiweAuth()
  const { profile } = useUserProfile()

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const length = messageLength(draft)
  const overLimit = length > MAX_MESSAGE_LENGTH
  const canSend = length > 0 && !overLimit && !sending

  async function send(event) {
    event.preventDefault()
    if (!canSend) return

    setSending(true)
    setError(null)

    try {
      const message = await postMessage({
        room,
        body: draft,
        handle: profile.displayName,
        avatarId: profile.avatarId,
      })

      /*
       * Cleared only after the post succeeds. Clearing optimistically reads
       * better right up until the request fails, at which point whatever
       * somebody just wrote is gone and the error is about a message they can
       * no longer see.
       */
      setDraft('')
      if (message) onPosted(message)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="chat-composer chat-signin">
        <p className="chat-signin-text">Sign in with your wallet to join the conversation.</p>
        <button type="button" className="chat-send" onClick={signIn} disabled={isBusy}>
          {isBusy ? <Loader2 size={14} className="chat-spin" /> : null}
          {isBusy ? 'Signing in' : 'Sign in'}
        </button>
      </div>
    )
  }

  return (
    <form className="chat-composer" onSubmit={send}>
      <textarea
        className="chat-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, shift-enter makes a new line: what every chat does,
          // and what people try first without being told.
          if (e.key === 'Enter' && !e.shiftKey) send(e)
        }}
        placeholder="Say something"
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH * 2}
        aria-label="Your message"
      />

      <div className="chat-composer-foot">
        {error ? (
          <span className="chat-error" role="alert">
            {error}
          </span>
        ) : (
          <span className="chat-hint font-mono">Enter to send</span>
        )}

        {/*
         * Counted by the same function the server enforces with, so this
         * number and the one that decides cannot disagree. A counter reading
         * 480 above a rejection at 501 is how an emoji-heavy message becomes
         * a bug report.
         */}
        {length >= COUNTER_APPEARS_AT && (
          <span className={`chat-count font-mono ${overLimit ? 'over' : ''}`}>
            {length} / {MAX_MESSAGE_LENGTH}
          </span>
        )}

        <button type="submit" className="chat-send" disabled={!canSend}>
          {sending ? <Loader2 size={14} className="chat-spin" /> : <Send size={14} />}
          {sending ? 'Sending' : 'Send'}
        </button>
      </div>
    </form>
  )
}
