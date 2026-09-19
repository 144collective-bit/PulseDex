import { useCallback, useState } from 'react'
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import { useFeed, FEED_STATUS } from '../../hooks/useFeed'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { deletePost, reportPost } from '../../services/posts'
import { blockAddress } from '../../services/profile'
import { formatAddress } from '../../utils/formatters'

/**
 * A list of posts, with the box to add one.
 *
 * Used twice: once for everybody's posts and once, with an `author`, for one
 * person's on their profile. The two are the same component because they are
 * the same thing with a filter on it - and because the moderation controls,
 * the paging and the "your own post can be deleted" rule would otherwise exist
 * in two places and drift.
 *
 * The composer is hidden on somebody else's profile. Writing a post there
 * would publish it to the feed, not to them, which is not what the box under
 * their name appears to promise.
 */
export default function FeedPanel({ author = null, onOpenProfile }) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const { posts, status, error, add, remove, hasMore, loadingOlder, loadOlder } = useFeed({ author })

  const [actionError, setActionError] = useState(null)
  const [reported, setReported] = useState(() => new Set())

  const mine = account ? account.toLowerCase() : null
  const ownProfile = Boolean(author) && author.toLowerCase() === mine

  const onRemove = useCallback(
    async (id) => {
      /*
       * Confirmed, unlike removing a chat message. A message can be reposted
       * in seconds; a post is the thing somebody wrote at length and meant to
       * keep, and the removal is soft in the database but final from here -
       * there is no undo control in this interface.
       */
      if (!window.confirm('Delete this post? This cannot be undone from here.')) return

      setActionError(null)
      /*
       * Taken off the screen before the request answers. The realtime feed
       * will say the same thing a moment later and the merge ignores the
       * repeat; if the request fails, the post comes back on the next load,
       * which is the right way round - seeing a removal you have to redo
       * beats believing something is gone when it is still on everybody
       * else's screen.
       */
      remove(id)
      try {
        await deletePost(id)
      } catch (err) {
        setActionError(err.message)
      }
    },
    [remove],
  )

  const onReport = useCallback(async (post) => {
    const reason = window.prompt(
      'What is wrong with this post? A moderator will read it. (Optional)',
    )
    // Cancel is null; an empty string is somebody pressing OK without typing,
    // which is a report with no reason rather than no report.
    if (reason === null) return

    setActionError(null)
    try {
      await reportPost({ id: post.id, reason })
      // Remembered so the same post cannot be reported twice from one screen.
      // The endpoint refuses the duplicate anyway; this is so the reader gets
      // an answer rather than a silent no-op.
      setReported((prev) => new Set(prev).add(post.id))
    } catch (err) {
      setActionError(err.message)
    }
  }, [])

  const onBlock = useCallback(async (address) => {
    const ok = window.confirm(
      `Block ${formatAddress(address)} from posting? Their existing posts stay.`,
    )
    if (!ok) return

    setActionError(null)
    try {
      await blockAddress({ address })
    } catch (err) {
      setActionError(err.message)
    }
  }, [])

  if (status === FEED_STATUS.unconfigured) {
    return <Notice icon={AlertTriangle}>Posting is not configured on this deployment yet.</Notice>
  }

  if (status === FEED_STATUS.loading) {
    return (
      <Notice icon={Loader2} spinning>
        Loading posts
      </Notice>
    )
  }

  if (status === FEED_STATUS.failed) {
    return <Notice icon={AlertTriangle}>{error || 'The feed could not be loaded.'}</Notice>
  }

  return (
    <div className="feed-panel">
      {/* On your own profile the composer belongs here as much as on the
          feed - it is your page. On anybody else's it would be a box that
          looks like a reply and is not one. */}
      {(!author || ownProfile) && <PostComposer onPosted={add} />}

      {actionError && (
        <p className="chat-error" role="alert">
          {actionError}
        </p>
      )}

      {posts.length === 0 ? (
        <p className="chat-empty">
          {author ? 'Nothing posted yet.' : 'Nobody has posted yet. Go first.'}
        </p>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isOwn={Boolean(mine) && post.address === mine}
            isModerator={isModerator}
            onOpenProfile={onOpenProfile}
            onRemove={onRemove}
            onReport={reported.has(post.id) ? noteAlreadyReported : onReport}
            onBlock={onBlock}
          />
        ))
      )}

      {hasMore && (
        <button
          type="button"
          className="chat-older font-mono"
          onClick={loadOlder}
          disabled={loadingOlder}
        >
          {loadingOlder ? <Loader2 size={12} className="chat-spin" /> : <ChevronDown size={12} />}
          {loadingOlder ? 'Loading' : 'Load older posts'}
        </button>
      )}
    </div>
  )
}

/** Once a post has been reported from this screen, the button says so rather
 *  than filing a second report the endpoint would refuse. */
function noteAlreadyReported() {
  window.alert('You have already reported this post. A moderator will look at it.')
}

/** The three states that are not a feed, said the same way the chat says them. */
function Notice({ icon: Icon, spinning = false, children }) {
  return (
    <p className="chat-notice">
      <Icon size={15} className={spinning ? 'chat-spin' : undefined} />
      <span>{children}</span>
    </p>
  )
}
