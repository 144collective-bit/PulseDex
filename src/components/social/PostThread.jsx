import { useCallback, useEffect, useState } from 'react'
import { Loader2, CornerDownRight } from 'lucide-react'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import { fetchReplies } from '../../services/posts'
import { useSiweAuth } from '../../context/SiweAuthContext'

/**
 * The replies under one post, and the box to add one.
 *
 * Opened from the post rather than shown always. A feed where every item
 * carries its conversation is a feed you cannot scan, and most posts have no
 * replies at all - so this is fetched when somebody asks for it and not
 * before.
 *
 * Oldest first, which is the one place in this app that ordering is used. A
 * timeline reads newest-first because you want what you have not seen; a
 * conversation reads in the order it happened, or the answers arrive before
 * the questions.
 */
export default function PostThread({ post, onOpenProfile, onRemove, onReport, onBlock, isModerator }) {
  const { account, isSignedIn } = useSiweAuth()

  const [replies, setReplies] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setStatus('loading')

    fetchReplies(post.id)
      .then((found) => {
        if (!active) return
        setReplies(found)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setStatus('failed')
      })

    return () => {
      active = false
    }
  }, [post.id])

  /*
   * A new reply is shown at once rather than refetched.
   *
   * Appended, not prepended, because this list is oldest first - and the
   * endpoint has already returned the stored row, so what goes on screen is
   * what the database holds rather than an optimistic guess.
   */
  const onReplied = useCallback((reply) => {
    setReplies((current) => [...current, reply])
  }, [])

  const mine = account ? account.toLowerCase() : null

  return (
    <div className="post-thread">
      {status === 'loading' && (
        <p className="chat-notice">
          <Loader2 size={14} className="chat-spin" />
          <span>Loading replies</span>
        </p>
      )}

      {status === 'failed' && (
        <p className="chat-error" role="alert">
          {error || 'The replies could not be loaded.'}
        </p>
      )}

      {status === 'ready' &&
        replies.map((reply) => (
          <div key={reply.id} className="post-reply">
            <CornerDownRight size={13} className="post-reply-mark" aria-hidden="true" />
            <PostCard
              post={reply}
              isOwn={Boolean(mine) && reply.address === mine}
              isModerator={isModerator}
              onOpenProfile={onOpenProfile}
              onRemove={onRemove}
              onReport={onReport}
              onBlock={onBlock}
            />
          </div>
        ))}

      {/*
        The composer is last, under the conversation, because that is where
        somebody is once they have read it. Signed out it is absent rather
        than disabled - PostComposer draws its own sign-in prompt, and one
        prompt per open thread would be a wall of them.
      */}
      {isSignedIn && (
        <div className="post-reply is-composer">
          <CornerDownRight size={13} className="post-reply-mark" aria-hidden="true" />
          <PostComposer parentId={post.id} onPosted={onReplied} />
        </div>
      )}
    </div>
  )
}
