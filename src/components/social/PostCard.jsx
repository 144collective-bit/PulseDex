import { Trash2, Flag, Ban, MessageCircle } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'

/**
 * One post.
 *
 * Deliberately not a chat bubble. A message is tinted by who said it because a
 * room is a conversation and the question is who is speaking; a feed is a list
 * of things people wrote, and tinting your own would say the wrong thing -
 * that a timeline is about you rather than about what is on it. So every post
 * here is drawn the same way, whoever wrote it.
 *
 * The author is shown as their handle when they have one and as a shortened
 * address when they do not, with the address beside the handle whenever both
 * exist. A handle is chosen, and on a site about which tokens to buy, being
 * mistaken for somebody trusted is worth money - so "who actually wrote this"
 * never depends on trusting a display name.
 */
export default function PostCard({
  post,
  isOwn,
  isModerator,
  onOpenProfile,
  onRemove,
  onReport,
  onBlock,
  onToggleReplies,
  replyCount,
  threadOpen,
}) {
  const written = Date.parse(post.createdAt)

  // Your own post you can always take down; a moderator can take down
  // anybody's. The endpoint decides again, and this only decides what to draw.
  const canRemove = isOwn || isModerator

  return (
    <article className="feed-post">
      <button
        type="button"
        className="chat-avatar-button"
        onClick={() => onOpenProfile(post)}
        aria-label={`Profile for ${post.handle || formatAddress(post.address)}`}
        title="View profile"
      >
        <ChatAvatar
          address={post.address}
          avatarUrl={post.avatarUrl}
          avatarId={post.avatarId}
          size={40}
        />
      </button>

      <div className="feed-post-body">
        <header className="feed-post-meta font-mono">
          <button
            type="button"
            className="chat-author"
            title={post.address}
            onClick={() => onOpenProfile(post)}
          >
            {post.handle || formatAddress(post.address)}
          </button>

          {post.handle && (
            <span className="chat-address" title={post.address}>
              {formatAddress(post.address)}
            </span>
          )}

          <time
            className="chat-time"
            dateTime={post.createdAt}
            title={Number.isFinite(written) ? new Date(written).toLocaleString() : undefined}
          >
            {formatTimeAgo(Math.floor(written / 1000))}
          </time>
        </header>

        {/*
         * Rendered as text, never as markup. Everything here was typed by a
         * stranger and is shown at full width to anybody who loads the site.
         * React escapes it; the `white-space: pre-wrap` in the stylesheet
         * keeps the paragraphs the author wrote without letting them write
         * tags.
         */}
        <p className="feed-post-text">{post.body}</p>

        <div className="feed-post-tools">
          {/*
            First, and the only one of these that is an invitation rather than
            a moderation control. It carries the count, so a post with a
            conversation under it says so without being opened - which is what
            makes a feed worth scanning.
          */}
          {onToggleReplies && (
            <button
              type="button"
              className={`feed-tool is-reply ${threadOpen ? 'is-open' : ''}`}
              onClick={() => onToggleReplies(post)}
              aria-expanded={Boolean(threadOpen)}
              aria-label={threadOpen ? 'Hide replies' : 'Show replies and reply'}
              title={threadOpen ? 'Hide replies' : 'Reply'}
            >
              <MessageCircle size={12} />
              {replyCount > 0 && <span className="feed-tool-count font-mono">{replyCount}</span>}
            </button>
          )}

          {/*
           * Reporting is offered on everyone else's posts and not on your own,
           * which is not a permission check - the endpoint would take it - but
           * an answer to "what would this even mean". Nothing is done with a
           * report automatically: it goes to a queue a person reads. A
           * threshold that hid a post would be a brigading tool wearing a
           * safety feature's name.
           */}
          {!isOwn && (
            <button
              type="button"
              className="feed-tool"
              onClick={() => onReport(post)}
              aria-label="Report this post"
              title="Report this post"
            >
              <Flag size={12} />
            </button>
          )}

          {isModerator && !isOwn && (
            <button
              type="button"
              className="feed-tool danger"
              onClick={() => onBlock(post.address)}
              aria-label="Block this author"
              title="Block this author from posting"
            >
              <Ban size={12} />
            </button>
          )}

          {canRemove && (
            <button
              type="button"
              className="feed-tool danger"
              onClick={() => onRemove(post.id)}
              aria-label={isOwn ? 'Delete your post' : 'Remove this post'}
              title={isOwn ? 'Delete your post' : 'Remove this post'}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
