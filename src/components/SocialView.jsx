import { useCallback, useEffect, useRef, useState } from 'react'
import { MessagesSquare, Loader2, AlertTriangle } from 'lucide-react'
import ChatMessageRow from './social/ChatMessageRow'
import ChatComposer from './social/ChatComposer'
import { useChatMessages, CHAT_STATUS } from '../hooks/useChatMessages'
import { useIsModerator } from '../hooks/useIsModerator'
import { useSiweAuth } from '../context/SiweAuthContext'
import { removeMessage } from '../services/chat'
import '../styles/social.css'

/** Close enough to the bottom that the reader is following along rather than
 *  reading back through history. */
const FOLLOWING_THRESHOLD_PX = 120

/**
 * The social page: one room, everyone in it.
 *
 * Reading is open to anyone who loads the site. Posting needs a wallet
 * signature, which is both the identity and the spam control - an address is
 * not free to replace the way an IP is.
 *
 * One room rather than a room per token, deliberately, and it is the decision
 * most likely to be revisited. A screener could attach a thread to every pair,
 * which is the version worth building if people use this at all; a hundred
 * empty rooms is the version that gets built when nobody has found out yet.
 */
export default function SocialView() {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const { messages, status, error, add, remove } = useChatMessages()

  const scroller = useRef(null)
  const [following, setFollowing] = useState(true)
  const [removeError, setRemoveError] = useState(null)

  /*
   * Follow the conversation, unless the reader has scrolled away from it.
   *
   * Yanking someone back to the bottom while they are reading what was said
   * ten minutes ago is the single most irritating thing a chat does, and it
   * happens every time somebody else types.
   */
  useEffect(() => {
    if (!following) return
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, following])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setFollowing(distanceFromBottom < FOLLOWING_THRESHOLD_PX)
  }, [])

  const onRemove = useCallback(
    async (id) => {
      setRemoveError(null)
      /*
       * Taken off the screen before the request answers. The realtime feed
       * will say the same thing a moment later and the merge ignores the
       * repeat; if the request fails, the message comes back on the next
       * load, which is the right way round - a moderator seeing a removal
       * they have to redo beats one believing something is gone when it is
       * still on everybody else's screen.
       */
      remove(id)
      try {
        await removeMessage(id)
      } catch (err) {
        setRemoveError(err.message)
      }
    },
    [remove],
  )

  return (
    <div className="social-view">
      <header className="social-head">
        <div className="social-head-title">
          <MessagesSquare size={18} className="social-head-icon" />
          <h1 className="font-mono">Lounge</h1>
        </div>
        <p className="social-head-lede">
          One room for everyone on PulseDex. Read freely; sign in with your wallet to post.
        </p>
      </header>

      <section className="social-panel">
        {status === CHAT_STATUS.unconfigured && (
          <Notice icon={AlertTriangle}>
            Chat is not configured on this deployment yet.
          </Notice>
        )}

        {status === CHAT_STATUS.loading && (
          <Notice icon={Loader2} spinning>
            Loading the conversation
          </Notice>
        )}

        {status === CHAT_STATUS.failed && (
          <Notice icon={AlertTriangle}>{error || 'The chat could not be loaded.'}</Notice>
        )}

        {status === CHAT_STATUS.ready && (
          <>
            <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
              {messages.length === 0 ? (
                <p className="chat-empty">Nobody has said anything yet. Go first.</p>
              ) : (
                messages.map((message) => (
                  <ChatMessageRow
                    key={message.id}
                    message={message}
                    isOwn={Boolean(account) && message.address === account.toLowerCase()}
                    canRemove={isModerator}
                    onRemove={onRemove}
                  />
                ))
              )}
            </div>

            {!following && messages.length > 0 && (
              <button
                type="button"
                className="chat-jump font-mono"
                onClick={() => setFollowing(true)}
              >
                Jump to latest
              </button>
            )}

            {removeError && (
              <p className="chat-error" role="alert">
                {removeError}
              </p>
            )}

            <ChatComposer onPosted={add} />
          </>
        )}
      </section>
    </div>
  )
}

/** The three states that are not a conversation, said the same way. */
function Notice({ icon: Icon, spinning = false, children }) {
  return (
    <p className="chat-notice">
      <Icon size={15} className={spinning ? 'chat-spin' : undefined} />
      <span>{children}</span>
    </p>
  )
}
