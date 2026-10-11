import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import { fetchReplies } from '../../services/posts'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { usePostReactions } from '../../hooks/usePostReactions'
import { usePostActions } from '../../hooks/usePostActions'
import { useBookmarks } from '../../hooks/useBookmarks'
import { formatAddress } from '../../utils/formatters'

/**
 * The conversation under one post.
 *
 * Opened from the post rather than shown always. A feed where every item
 * carries its conversation is a feed you cannot scan, and most posts have no
 * replies at all - so this is fetched when somebody asks for it and not
 * before.
 *
 * Oldest first, which is the one place in this app that ordering is reversed.
 * A timeline reads newest-first because you want what you have not seen; a
 * conversation reads in the order it happened, or the answers arrive before
 * the questions.
 *
 * What makes this a thread rather than a list of replies, which is what it was
 * until Batch 3:
 *
 * - **The original author is marked.** On a site about which tokens to buy,
 *   "is this reply from the person whose post this is" is the question a
 *   reader most needs answered, and working it out by comparing two shortened
 *   addresses is work nobody does. It is also the shape of the obvious scam:
 *   a reply impersonating the author, agreeing with them, pointing somewhere
 *   else.
 * - **Consecutive replies by one person are grouped**, so somebody answering
 *   three points in a row is one block rather than three cards with the same
 *   face on each.
 * - **Replies carry the same controls as posts**: reactions, saving, quoting
 *   and removal. A reply is a post, and moderation that worked everywhere
 *   except inside a thread would be moderation with a hole exactly where an
 *   argument happens.
 * - **The count is stated.** "4 replies" above the list tells somebody whether
 *   it is worth reading before they read it.
 */
export default function PostThread({
  post,
  onOpenProfile,
  isModerator,
  onOpenPost,
}) {
  const { account, isSignedIn } = useSiweAuth()

  const [replies, setReplies] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const reactions = usePostReactions(replies)
  const bookmarks = useBookmarks()

  /*
   * Its own moderation controls rather than the parent's, and the reason is an
   * ordering bug the first version had.
   *
   * `usePostActions` confirms before it removes and then calls `onRemoved` -
   * so taking the reply out of this list has to be what that callback does.
   * The first version filtered the list and *then* called the parent's
   * `onRemove`, which meant pressing delete and cancelling the confirm left
   * the reply gone from the screen until a reload.
   *
   * `reported` being per-thread rather than shared with the feed is fine: it
   * exists so a second press gets an answer, and the endpoint treats a repeat
   * as success anyway.
   */
  const { actionError, reported, noteAlreadyReported, onRemove, onReport, onBlock } =
    usePostActions({
      onRemoved: (id) => setReplies((current) => current.filter((r) => r.id !== id)),
    })

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

  /** A reply edited in place, put back where it was. Order here is by
   *  `created_at`, which an edit does not change. */
  const onEdited = useCallback((updated) => {
    setReplies((current) => current.map((r) => (r.id === updated.id ? updated : r)))
  }, [])

  const mine = account ? account.toLowerCase() : null
  const author = post.address ? post.address.toLowerCase() : null

  return (
    <div className="post-thread">
      {status === 'ready' && replies.length > 0 && (
        <p className="post-thread-count font-mono">
          <MessageSquare size={11} />
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </p>
      )}

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

      {(actionError || reactions.error || bookmarks.error) && (
        <p className="chat-error" role="alert">
          {actionError || reactions.error || bookmarks.error}
        </p>
      )}

      {status === 'ready' && replies.length === 0 && (
        <p className="chat-empty">No replies yet.</p>
      )}

      {status === 'ready' &&
        replies.map((reply, i) => {
          const replier = reply.address ? reply.address.toLowerCase() : null
          const byAuthor = Boolean(author) && replier === author

          /*
           * Grouped with the one above when it is the same person. Somebody
           * answering three points in a row is one block, not three cards
           * with the same face on each - and the grouping is only visual, so
           * every reply keeps its own controls and its own timestamp.
           */
          const grouped = i > 0 && replies[i - 1].address?.toLowerCase() === replier

          return (
            <div
              key={reply.id}
              className={`post-reply ${grouped ? 'is-grouped' : ''} ${byAuthor ? 'is-author' : ''}`}
            >
              {/*
                Said in words, not by a colour.

                A tint would be read as decoration or missed entirely by
                anybody who cannot see it, and this is the one fact in a
                thread a reader actually needs: whether the person answering
                is the person who posted. It is also the shape of the obvious
                scam here - a reply impersonating the author and pointing
                somewhere else.
              */}
              {byAuthor && !grouped && (
                <span className="post-reply-author font-mono" title={post.address}>
                  {post.handle || formatAddress(post.address)} · author
                </span>
              )}

              <PostCard
                post={reply}
                isOwn={Boolean(mine) && replier === mine}
                isModerator={isModerator}
                onOpenProfile={onOpenProfile}
                onRemove={onRemove}
                onReport={reported.has(reply.id) ? noteAlreadyReported : onReport}
                onBlock={onBlock}
                /* No reply control inside a thread: replies are one level
                   deep, and the endpoint refuses a reply to a reply. Offering
                   it would be offering something that cannot work. */
                onToggleReplies={undefined}
                reactions={reactions.reactionsFor(reply.id)}
                canReact={reactions.canReact}
                onToggleReaction={reactions.toggle}
                saved={bookmarks.isSaved(reply.id)}
                onToggleSave={bookmarks.toggle || undefined}
                onOpenPost={onOpenPost}
                onEdited={onEdited}
              />
            </div>
          )
        })}

      {/*
        The composer is last, under the conversation, because that is where
        somebody is once they have read it. Signed out it is absent rather
        than disabled - PostComposer draws its own sign-in prompt, and one
        prompt per open thread would be a wall of them.
      */}
      {isSignedIn && (
        <div className="post-reply is-composer">
          <PostComposer parentId={post.id} onPosted={onReplied} />
        </div>
      )}
    </div>
  )
}
