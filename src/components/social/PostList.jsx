import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import PostCard from './PostCard'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { usePostActions } from '../../hooks/usePostActions'
import { usePostReactions } from '../../hooks/usePostReactions'
import { useBookmarks } from '../../hooks/useBookmarks'

/**
 * A list of posts somebody asked for, with no composer and no paging.
 *
 * Used by the two profile tabs that are not a feed: Reacted and Saved. Both
 * are a fixed set fetched once - "the posts this account reacted to", "the
 * posts I saved" - rather than a window onto a stream, so neither wants
 * `useFeed`, whose realtime subscription and cursor paging exist for a
 * timeline that keeps growing from the top.
 *
 * One component for both rather than two near-copies, because the difference
 * between them is a loader function and a sentence. What they share is the
 * part worth not writing twice: every post in this app carries the same
 * controls, and a surface that quietly lacked removal or reporting would be a
 * hole in moderation exactly where somebody had collected things.
 *
 * @param {object} props
 * @param {() => Promise<Array<{ post: object, badge?: string }>>} props.load
 * @param {string} props.empty what to say when there is nothing
 * @param {string} [props.loading] what to say while fetching
 */
export default function PostList({ load, empty, loading = 'Loading posts', onOpenProfile, onOpenPost }) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()

  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const posts = entries.map((entry) => entry.post)
  const reactions = usePostReactions(posts)
  const bookmarks = useBookmarks()

  const { actionError, reported, noteAlreadyReported, onRemove, onReport, onBlock } =
    usePostActions({
      // Taken off this list as well as told to the endpoint, so a removal
      // does not leave the post sitting there until a reload.
      onRemoved: (id) => setEntries((current) => current.filter((e) => e.post.id !== id)),
    })

  useEffect(() => {
    let alive = true
    setStatus('loading')

    load()
      .then((found) => {
        if (!alive) return
        setEntries(found)
        setStatus('ready')
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message)
        setStatus('failed')
      })

    return () => {
      alive = false
    }
  }, [load])

  const onEdited = useCallback((updated) => {
    setEntries((current) =>
      current.map((e) => (e.post.id === updated.id ? { ...e, post: updated } : e)),
    )
  }, [])

  const mine = account ? account.toLowerCase() : null

  if (status === 'loading') {
    return (
      <p className="chat-notice">
        <Loader2 size={15} className="chat-spin" />
        <span>{loading}</span>
      </p>
    )
  }

  if (status === 'failed') {
    return (
      <p className="chat-notice">
        <AlertTriangle size={15} />
        <span>{error || 'That could not be loaded.'}</span>
      </p>
    )
  }

  return (
    <div className="feed-panel">
      {(actionError || reactions.error || bookmarks.error) && (
        <p className="chat-error" role="alert">
          {actionError || reactions.error || bookmarks.error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="chat-empty">{empty}</p>
      ) : (
        entries.map(({ post, badge }) => (
          <div key={post.id} className="feed-item">
            {/*
              What this row is doing here, when that is not obvious from the
              post itself. On the Reacted tab it is which of the six
              reactions was left - because there is no single "like" on this
              site, and flattening six into one would claim an endorsement
              nobody gave. 👀 "Watching" on a scam warning is not agreement
              with it.
            */}
            {badge && <p className="post-list-badge font-mono">{badge}</p>}

            <PostCard
              post={post}
              isOwn={Boolean(mine) && post.address === mine}
              isModerator={isModerator}
              onOpenProfile={onOpenProfile}
              onRemove={onRemove}
              onReport={reported.has(post.id) ? noteAlreadyReported : onReport}
              onBlock={onBlock}
              /* No thread here. These lists are a collection rather than a
                 conversation, and opening one would mean a composer inside a
                 list that has no composer of its own. The post's own page is
                 one press away through the share link or the quote card. */
              onToggleReplies={undefined}
              reactions={reactions.reactionsFor(post.id)}
              canReact={reactions.canReact}
              onToggleReaction={reactions.toggle}
              saved={bookmarks.isSaved(post.id)}
              onToggleSave={bookmarks.toggle || undefined}
              onOpenPost={onOpenPost}
              onEdited={onEdited}
            />
          </div>
        ))
      )}
    </div>
  )
}
