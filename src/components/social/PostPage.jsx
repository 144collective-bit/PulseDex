import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, MessageSquareOff } from 'lucide-react'
import PostCard from './PostCard'
import PostThread from './PostThread'
import { fetchPost } from '../../services/posts'
import { usePostActions } from '../../hooks/usePostActions'
import { usePostReactions } from '../../hooks/usePostReactions'
import { useBookmarks } from '../../hooks/useBookmarks'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useMutes } from '../../hooks/useMutes'
import { setPostHidden } from '../../services/moderation'
import { useSiweAuth } from '../../context/SiweAuthContext'

/**
 * One post, on its own page, at `/p/<id>`.
 *
 * The surface a notification lands on and the thing a shared link points at.
 * Until this existed, "somebody mentioned you" could only open that person's
 * profile - the notification named an event and then could not show it, which
 * is the one thing an inbox is for.
 *
 * Deliberately not "the feed, scrolled to a post". The feed is paginated and
 * ordered by time, so a fragment on it stops finding anything the moment the
 * post is a day old, which is when most links are clicked. Fetched by id
 * instead, so a link works for as long as the post does.
 *
 * The conversation is open from the start rather than behind the reply
 * control. In the feed a thread is opened on purpose because several open
 * threads make a list unreadable; here there is one post and the replies are
 * usually the reason somebody followed the link.
 */
export default function PostPage({ id, onOpenProfile, onOpenPost }) {
  const { account } = useSiweAuth()
  const isModerator = useIsModerator()
  const mutes = useMutes()

  /*
   * Hiding, offered here because this is where the report queue's "Open it"
   * lands - a moderator reading the post they are deciding about should be
   * able to act on it without going back.
   *
   * The post is replaced in place rather than refetched, which this page can
   * do because it holds exactly one.
   */
  const onToggleHide = async (id, on) => {
    try {
      await setPostHidden({ id, on })
      setPost((current) =>
        current && current.id === id
          ? {
              ...current,
              hiddenAt: on ? new Date().toISOString() : null,
              /*
               * `account` rather than the lowercased `mine`, which is declared
               * further down this component past an early return. Reading it
               * from here would work - this closure only runs after a click -
               * and is the exact shape that once threw "cannot access before
               * initialization" in RoomPanel.jsx, past lint, the suite and the
               * build. Lowercased here instead.
               */
              hiddenBy: on ? account?.toLowerCase() || null : null,
            }
          : current,
      )
    } catch {
      // Left as it was. The panel at /moderation reports failures properly,
      // and that is where somebody doing this deliberately is working.
    }
  }

  const [post, setPost] = useState(null)
  const [status, setStatus] = useState('loading')

  /* One post, so the list this hook is given is one long - but it is the same
     hook the feed uses, so a reaction behaves identically here. */
  const reactions = usePostReactions(post ? [post] : [])
  const bookmarks = useBookmarks()

  /*
   * Removing the post removes the page's subject, so it is emptied rather
   * than taken out of a list. The reader stays where they are and is told,
   * which beats a blank panel or a bounce back to the feed.
   */
  const { actionError, reported, noteAlreadyReported, onRemove, onReport, onBlock } =
    usePostActions({ onRemoved: () => setStatus('gone') })

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setPost(null)

    fetchPost(id)
      .then((found) => {
        if (!alive) return
        setPost(found)
        setStatus(found ? 'ready' : 'missing')
      })
      .catch(() => {
        if (alive) setStatus('failed')
      })

    return () => {
      alive = false
    }
  }, [id])

  if (status === 'loading') {
    return (
      <p className="chat-notice">
        <Loader2 size={15} className="chat-spin" />
        <span>Loading</span>
      </p>
    )
  }

  /*
   * Gone and never-there, answered the same way.
   *
   * Telling a stranger which of the two it is would say that something was
   * deleted, and who deleted a post is not a fact this page owes anybody.
   */
  if (status === 'missing' || status === 'gone') {
    return (
      <div className="xp-empty">
        <MessageSquareOff size={18} />
        <p>That post is not here.</p>
        <p className="xp-empty-hint">
          It may have been removed, or the link may be wrong. Everything else is still on the feed.
        </p>
      </div>
    )
  }

  if (status === 'failed' || !post) {
    return (
      <p className="chat-notice">
        <AlertTriangle size={15} />
        <span>That post could not be loaded.</span>
      </p>
    )
  }

  const mine = account ? account.toLowerCase() : null

  return (
    <div className="xp-panel">
      {(actionError || reactions.error || bookmarks.error) && (
        <p className="chat-notice" role="alert">
          <AlertTriangle size={15} />
          <span>{actionError || reactions.error || bookmarks.error}</span>
        </p>
      )}

      <div className="feed-item">
        <PostCard
          post={post}
          isOwn={Boolean(mine) && post.address === mine}
          isModerator={isModerator}
          onOpenProfile={onOpenProfile}
          onRemove={onRemove}
          onReport={reported.has(post.id) ? noteAlreadyReported : onReport}
          onBlock={onBlock}
          /*
           * No reply toggle. The conversation is already below, and a control
           * that opens what is open is a control that does nothing.
           */
          onToggleReplies={undefined}
          reactions={reactions.reactionsFor(post.id)}
          canReact={reactions.canReact}
          onToggleReaction={reactions.toggle}
          saved={bookmarks.isSaved(post.id)}
          onToggleSave={bookmarks.toggle || undefined}
          onOpenPost={onOpenPost}
          /* Edited in place: this page holds the one post, so it replaces it
             rather than merging into a list. */
          onEdited={setPost}
          onMute={mutes.toggle ? (address) => mutes.toggle(address, true) : undefined}
          onToggleHide={isModerator ? onToggleHide : undefined}
        />

        <PostThread
          post={post}
          isModerator={isModerator}
          onOpenProfile={onOpenProfile}
          onOpenPost={onOpenPost}
          onMute={mutes.toggle ? (address) => mutes.toggle(address, true) : undefined}
          /* No `onToggleHide`, for the same reason as in the feed: this page's
             handler replaces the one post it holds, and a reply is not that
             post. The thread owns its own. */
        />
      </div>
    </div>
  )
}
