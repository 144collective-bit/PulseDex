import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Loader2, X, Reply } from 'lucide-react'
import { useSiweAuth } from '../../context/SiweAuthContext'
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
export default function ChatComposer({ room, onPosted, onTyping, replyTo, onCancelReply }) {
  const { isSignedIn, isBusy, signIn } = useSiweAuth()

  const [draft, setDraft] = useState('')

  /*
   * Aiming the cursor at the box when a reply is started.
   *
   * Pressing reply on a message four screens up and then having to click the
   * composer is two actions for one intention, and on a phone the second one
   * is what summons the keyboard. Keyed on the id rather than on the object,
   * so re-rendering the panel does not steal focus back from wherever the
   * reader has since put it.
   */
  const input = useRef(null)
  const replyId = replyTo?.id ?? null
  useEffect(() => {
    if (replyId) input.current?.focus()
  }, [replyId])

  /*
   * Saying "still typing", and stopping.
   *
   * The flag goes up on the first keystroke and comes down four seconds after
   * the last one - long enough to ride out thinking mid-sentence, short
   * enough that somebody who wandered off is not shown as typing for the rest
   * of the afternoon.
   *
   * The timer restarts on every keystroke but `onTyping` itself is idempotent
   * and ignores an unchanged value, so holding a key down is one websocket
   * message rather than one per character.
   */
  const idle = useRef(null)

  const typing = useCallback(() => {
    onTyping?.(true)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => onTyping?.(false), 4000)
  }, [onTyping])

  const stopTyping = useCallback(() => {
    clearTimeout(idle.current)
    onTyping?.(false)
  }, [onTyping])

  // Leaving the room mid-sentence should not leave the flag up behind you.
  useEffect(() => stopTyping, [stopTyping])
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
      // No name or avatar travels with a message any more. The server reads
      // both from the profile the sign-in cookie identifies, which is what
      // stops a second device renaming an account by posting from it.
      const message = await postMessage({ room, body: draft, replyTo: replyTo?.id ?? null })

      /*
       * Cleared only after the post succeeds. Clearing optimistically reads
       * better right up until the request fails, at which point whatever
       * somebody just wrote is gone and the error is about a message they can
       * no longer see.
       */
      setDraft('')
      // The reply is answered now. Left standing it would quietly attach the
      // next unrelated remark to the same message.
      onCancelReply?.()
      // Sent, so no longer typing. Waiting for the four-second timer would
      // leave the flag up over a message that has already arrived.
      stopTyping()
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
      {/*
        What is being answered, while it is being answered.

        Above the box rather than inside it: the message being written is the
        reader's, and putting somebody else's words in the same field is how
        people end up editing the quote instead of writing the answer.
      */}
      {replyTo && (
        <div className="chat-replying font-mono">
          <Reply size={11} />
          <span className="chat-replying-author">{replyTo.name}</span>
          <span className="chat-replying-body">{replyTo.body}</span>
          <button
            type="button"
            className="chat-tool"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            title="Cancel reply"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <textarea
        ref={input}
        className="chat-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          // Clearing the box is not typing - it is the opposite.
          if (e.target.value) typing()
          else stopTyping()
        }}
        onKeyDown={(e) => {
          // Enter sends, shift-enter makes a new line: what every chat does,
          // and what people try first without being told.
          if (e.key === 'Enter' && !e.shiftKey) send(e)
          // Escape drops the reply, not the draft. Whatever has been typed is
          // still worth saying; it just stops being an answer to that message.
          if (e.key === 'Escape' && replyTo) onCancelReply?.()
        }}
        placeholder={replyTo ? `Reply to ${replyTo.name}` : 'Say something'}
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
