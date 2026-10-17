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
import { usePostReactions } from '../../hooks/usePostReactions'
import { useBookmarks } from '../../hooks/useBookmarks'
import { useMutes } from '../../hooks/useMutes'
import { useFeedRanking } from '../../hooks/useFeedRanking'
import { setPostHidden } from '../../services/moderation'

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
  /** Opens one post's page, for a press on a quote card. */
  onOpenPost,
  /** Whether this list offers a Media filter. Only a profile's Media tab
   *  passes it; the main feed shows everything. */
  media = false,
  /*
   * Whether this list may be ranked rather than put in time order.
   *
   * Only "For you" passes it. A profile is a record of what one account wrote
   * and has to be in the order they wrote it - ranking somebody's own page by
   * what the reader engaged with would make their timeline a different shape
   * for every visitor, which is not a profile. "Following" is deliberately
   * left chronological too: somebody who went to the trouble of choosing who
   * to follow has already done the ranking, and reordering it is overriding
   * the one explicit instruction they gave.
   */
  rankable = false,
}) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const isModeratorView = isModerator

  /*
   * The mute set, asked once for the whole list - the same lesson as
   * reactions and saves.
   *
   * Applied as a filter on the feed and NOT on a profile. Visiting somebody's
   * page after muting them and finding it empty would read as the account
   * having been deleted; a mute means "keep them out of my feed", and
   * deliberately opening their page is not that. `author` is the test, because
   * it is set on exactly the surfaces that are one person's.
   */
  const mutes = useMutes()
  const mutedHere = author ? null : mutes.addresses

  const { posts, status, error, add, replace, remove, hasMore, loadingOlder, loadOlder } = useFeed({
    author,
    authors,
    replies,
    media,
    /*
     * Who is reading, so their own hidden posts come back to them - an author
     * who is not told their post is pending review has simply had it vanish.
     * A moderator sees every hidden post, which is what makes the queue
     * reviewable from the feed as well as from the panel.
     */
    viewer: account || null,
    showHidden: isModeratorView,
    muted: mutedHere,
  })

  /*
   * Reactions and saves, asked once for the whole list rather than per row.
   *
   * Both are the same lesson from two directions: a hook per card meant a
   * request per card, and a page of twenty posts came to sixty requests on a
   * browser that runs six at a time. Reactions arrive embedded with the posts
   * so there is no request at all; saves are one.
   */
  const reactions = usePostReactions(posts)
  const bookmarks = useBookmarks()

  /*
   * The post the composer is quoting, if somebody pressed Quote on one.
   *
   * Held here rather than in the composer, because the press happens on a card
   * and the composer is a sibling of the list - and because clearing it after
   * a successful post is the composer's job, which it does through the
   * callback.
   */
  const [quoting, setQuoting] = useState(null)

  /* Removing, reporting and blocking, shared with the single-post page so
     the two cannot drift. See src/hooks/usePostActions.js. */
  const { actionError, reported, noteAlreadyReported, onRemove, onReport, onBlock } =
    usePostActions({ onRemoved: remove })

  /*
   * Quoting scrolls to the composer as well as filling it.
   *
   * Without it, pressing Quote on the fortieth post of a feed appears to do
   * nothing: the composer is filled in, at the top, off screen. The press and
   * its result have to be in the same place.
   */
  const onQuote = useCallback((post) => {
    setQuoting(post)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /*
   * Hiding, for a moderator, from the feed rather than only from the panel.
   *
   * The post is replaced from what is already on screen rather than refetched,
   * which is the one place this differs from ModerationPanel - that panel
   * reloads so the audit trail beside it cannot disagree with the state. Here
   * there is no log on screen to disagree with, and a feed that refetched
   * itself on every hide would lose the reader's place.
   */
  const onToggleHide = useCallback(
    async (id, on) => {
      const post = posts.find((row) => row.id === id)
      try {
        await setPostHidden({ id, on })
        if (post) {
          replace({
            ...post,
            hiddenAt: on ? new Date().toISOString() : null,
            // The address, because a moderator did this. The pair is what
            // tells the author a person read it rather than a threshold.
            hiddenBy: on ? account || null : null,
          })
        }
      } catch {
        /*
         * Swallowed, and the post left as it was. The alternative is an error
         * banner over a feed for a control only a handful of accounts can see
         * - and the panel at /moderation reports failures properly, which is
         * where somebody doing this deliberately is working.
         */
      }
    },
    [posts, replace, account],
  )

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
  const withoutPinned = pinnedPostId ? posts.filter((post) => post.id !== pinnedPostId) : posts

  /*
   * The order, which only "For you" lets out of time order.
   *
   * Applied after the pinned post is removed rather than before, so the pin
   * cannot be scored and re-inserted into a list it is already drawn above.
   */
  const ranking = useFeedRanking(rankable ? withoutPinned : null)
  const shownPosts = rankable ? ranking.posts || withoutPinned : withoutPinned

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
      {(!author || ownProfile) && (
        <PostComposer
          onPosted={add}
          quoting={quoting}
          onClearQuote={() => setQuoting(null)}
        />
      )}

      {(actionError || reactions.error || bookmarks.error) && (
        <p className="chat-error" role="alert">
          {actionError || reactions.error || bookmarks.error}
        </p>
      )}

      {/*
        The order, and the way out of it.

        Drawn only where ranking is possible and only for somebody signed in -
        there is nothing to rank on otherwise, and a control that cannot change
        anything is a control that lies about what the feed is doing.

        This is the part that makes ranking defensible on this site rather than
        merely conventional: the order decides which claims about money get
        read first, and a reader who cannot refuse it has to take it on trust.
        So the switch says plainly which order it is in, and the choice is
        remembered.
      */}
      {rankable && ranking.canRank && (
        <div className="feed-order">
          {/*
            The label and the button read the PREFERENCE, not whether ranking
            is currently doing anything. Those differ for a moment on every
            cold load while the reading history arrives, and a control that
            described the transient state instead of the setting did nothing
            when pressed during it.
          */}
          <span className="feed-order-label">
            {ranking.prefers ? 'Ranked for you' : 'Newest first'}
          </span>
          <button
            type="button"
            className="feed-order-switch"
            onClick={() => ranking.choose(!ranking.prefers)}
          >
            {ranking.prefers ? 'Show newest first' : 'Rank for me'}
          </button>
          {/* The method, only once ranking is actually in effect: describing
              how the order is computed while the feed is still in time order
              would be explaining something that has not happened. */}
          {ranking.ranked && (
            <p className="feed-order-note">
              Posts from accounts you read come first, then posts established
              accounts engaged with. Recency outweighs both. Nothing is hidden —
              this only changes the order.
            </p>
          )}
        </div>
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
            reactions={reactions.reactionsFor(post.id)}
            canReact={reactions.canReact}
            onToggleReaction={reactions.toggle}
            saved={bookmarks.isSaved(post.id)}
            onToggleSave={bookmarks.toggle || undefined}
            /* Quoting is offered where there is a composer to open. On
               somebody else's profile there is none - the box is hidden
               there, because a post written under their name would go to the
               feed rather than to them. */
            onQuote={!author || ownProfile ? onQuote : undefined}
            onOpenPost={onOpenPost}
            onEdited={replace}
            /*
             * Muting, offered on everybody else's posts. Absent when signed
             * out, because the list is stored per account - `toggle` is null
             * then, and the control simply is not drawn.
             */
            onMute={mutes.toggle ? (address) => mutes.toggle(address, true) : undefined}
            onToggleHide={isModeratorView ? onToggleHide : undefined}
            /* Why this post is here, when something other than time put it
               there. Null for most posts, and the card draws nothing. */
            rankReason={post.rank?.reason || null}
          />

          {openThread === post.id && (
            <PostThread
              post={post}
              isModerator={isModerator}
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
              onMute={mutes.toggle ? (address) => mutes.toggle(address, true) : undefined}
              /* No `onToggleHide`: the thread owns one, because it owns the
                 list a hidden reply is in. This component's handler replaces a
                 post in the feed, and a reply is not in the feed. */
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
