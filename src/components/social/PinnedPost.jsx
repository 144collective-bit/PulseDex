import { Pin } from 'lucide-react'
import PostCard from './PostCard'
import { useIsModerator } from '../../hooks/useIsModerator'
import { usePostActions } from '../../hooks/usePostActions'

/**
 * The one post an account has put at the top of its page.
 *
 * Above the tabs, outside the feed, and labelled - three decisions that are
 * really one decision. A pinned post drawn inside the list would be the same
 * post twice on the same page, or a post out of date order with no explanation
 * for why it is first; either reads as a bug. So it sits above, under a word
 * that says what it is.
 *
 * It carries the same controls any other post does, through the same hook, so
 * a pinned post can be reported, removed and shared exactly like it can in the
 * feed. Moderation that works everywhere except one surface is moderation with
 * a hole in it, and this would be the surface somebody chose to put something
 * on.
 *
 * The post arrives already checked: fetchPinnedPost refuses one that has been
 * removed, and refuses one whose author is not the profile being looked at -
 * so there is nothing for this component to verify and no state where it draws
 * somebody else's words under this name.
 */
export default function PinnedPost({ post, isOwn, onOpenProfile, onTogglePin, onRemoved }) {
  const isModerator = useIsModerator()
  const { actionError, reported, noteAlreadyReported, onRemove, onReport, onBlock } =
    usePostActions({ onRemoved })

  if (!post) return null

  return (
    <section className="xp-pinned">
      <h2 className="xp-pinned-label font-mono">
        <Pin size={11} />
        Pinned
      </h2>

      {actionError && (
        <p className="chat-error" role="alert">
          {actionError}
        </p>
      )}

      <PostCard
        post={post}
        isOwn={isOwn}
        isModerator={isModerator}
        onOpenProfile={onOpenProfile}
        onRemove={onRemove}
        onReport={reported.has(post.id) ? noteAlreadyReported : onReport}
        onBlock={onBlock}
        /*
         * No reply thread here, deliberately. This is a header, not the feed -
         * opening a conversation inside it would push the tabs and everything
         * below them off the screen, on the one surface whose job is to say
         * who this account is before anything else.
         *
         * The post is reachable at its own URL through the share control,
         * which is where a conversation about it belongs.
         */
        onToggleReplies={undefined}
        pinned
        onTogglePin={onTogglePin}
      />
    </section>
  )
}
