import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import PostThread from './PostThread'
import { useFeed, FEED_STATUS } from '../../hooks/useFeed'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { fetchReplyCounts } from '../../services/posts'
import { usePostActions } from '../../hooks/usePostActions'

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
export default function FeedPanel({
  author = null,
  authors = null,
  replies = false,
  onOpenProfile,
  /* Which post is pinned, and how to change it. Both come from the profile
     page, which owns the pin - this list only draws the control. Absent
     everywhere else, which is what keeps the control off the main feed, where
     there is nothing for a post to be pinned to. */
  pinnedPostId = null,
  onTogglePin,
}) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const { posts, status, error, add, remove, hasMore, loadingOlder, loadOlder } = useFeed({ author, authors, replies })

  /* Removing, reporting and blocking, shared with the single-post page so
     the two cannot drift. See src/hooks/usePostActions.js. */
  const { actionError, reported, noteAlreadyReported, onRemove, onReport, onBlock } =
    usePostActions({ onRemoved: remove })

  // Which post's conversation is open, or null. One at a time: several open
  // threads turn a feed into a wall with no shape to it.
  const [openThread, setOpenThread] = useState(null)

  // How many replies each visible post has, fetched for the whole page at
  // once rather than per post.
  const [replyCounts, setReplyCounts] = useState(() => new Map())

  const mine = account ? account.toLowerCase() : null

  /*
   * The pinned post, dropped from this list because it is drawn above it.
   *
   * Caught by the browser harness and by nothing else: the pin and the feed
   * are two queries that both legitimately return the same row, so every unit
   * test passed and the page showed the same post twice, once under the word
   * "Pinned" and once in date order. That reads as a bug rather than a
   * feature, which is the whole problem with it.
   *
   * It costs the page one row out of a page of twenty rather than
   * re-requesting, which is the right trade - asking the database to exclude
   * one id would be a second query shape to keep in step with this one for
   * the sake of one row.
   *
   * `pinnedPostId` is only passed on a profile, so the main feed is untouched:
   * somebody's pinned post is still an ordinary post there, because there is
   * nothing on that page for it to be pinned to.
   */
  const shownPosts = pinnedPostId ? posts.filter((post) => post.id !== pinnedPostId) : posts

  /*
   * Reply counts for whatever is on screen.
   *
   * Keyed by the ids rather than by `posts`, so scrolling in new posts asks
   * once for the new ones and a re-render for any other reason asks not at
   * all. A reply arriving in realtime does not update these - the number is a
   * hint about whether a conversation exists, and one that is briefly one
   * behind costs nothing.
   */
  const idsKey = posts.map((p) => p.id).join(',')
  useEffect(() => {
    if (!posts.length || replies) return undefined

    let active = true
    fetchReplyCounts(posts.map((p) => p.id)).then((counts) => {
      if (active) setReplyCounts(counts)
    })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, replies])
  const ownProfile = Boolean(author) && author.toLowerCase() === mine

  const toggleThread = useCallback((post) => {
    setOpenThread((current) => (current === post.id ? null : post.id))
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

      {shownPosts.length === 0 ? (
        /*
         * Nothing to say when the only post is the one pinned above. An
         * account whose single post is its pinned post has a page with
         * something on it, and "Nothing here yet" underneath that post would
         * be contradicted by the thing directly above it.
         */
        pinnedPostId ? null : (
          <p className="chat-empty">{emptyText({ author, ownProfile, replies })}</p>
        )
      ) : (
        shownPosts.map((post) => (
          <div key={post.id} className="feed-item">
          <PostCard
            post={post}
            isOwn={Boolean(mine) && post.address === mine}
            isModerator={isModerator}
            onOpenProfile={onOpenProfile}
            onRemove={onRemove}
            onReport={reported.has(post.id) ? noteAlreadyReported : onReport}
            onBlock={onBlock}
            /* A reply is already inside a conversation; opening one under it
               would be the nesting the endpoint refuses. */
            onToggleReplies={replies ? undefined : toggleThread}
            replyCount={replyCounts.get(post.id) || 0}
            threadOpen={openThread === post.id}
            /*
             * Pinning only on your own profile, and only for top-level posts.
             *
             * `ownProfile` is the condition rather than `isOwn`: your own post
             * appears in the main feed too, and a pin control there would be
             * offering to change a page you are not looking at. A reply is
             * excluded because a pin is what an account leads with, and
             * leading with your half of somebody else's conversation says
             * nothing about you.
             */
            pinned={post.id === pinnedPostId}
            onTogglePin={ownProfile && !replies ? onTogglePin : undefined}
          />

          {openThread === post.id && (
            <PostThread
              post={post}
              isModerator={isModerator}
              onOpenProfile={onOpenProfile}
              onRemove={onRemove}
              onReport={onReport}
              onBlock={onBlock}
            />
          )}
          </div>
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

/**
 * What an empty list says.
 *
 * Five sentences rather than two, because "Nothing posted yet." was the same
 * answer to five different questions - and on your own brand new profile it
 * was the answer to the only one that matters, which is "what do I do now".
 * An empty state on a page somebody owns should be a next step; on somebody
 * else's it should be a fact and nothing more.
 */
function emptyText({ author, ownProfile, replies }) {
  if (ownProfile) {
    return replies
      ? 'You have not replied to anything yet. Replying is how anybody finds you.'
      : 'Nothing here yet. The box above posts to the feed, and whatever you write stays on this page.'
  }

  if (author) {
    return replies ? 'No replies from this account yet.' : 'This account has not posted yet.'
  }

  return 'Nobody has posted yet. Go first.'
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
