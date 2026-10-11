import { useState } from 'react'
import {
  Ban,
  Bookmark,
  Flag,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Quote,
  Trash2,
} from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import LinkPreviewCard from './LinkPreviewCard'
import MessageReactions from './MessageReactions'
import PostBody from './PostBody'
import PostEditor from './PostEditor'
import PostImage from './PostImage'
import QuoteCard from './QuoteCard'
import ShareButton from './ShareButton'
import { tallyReactions } from '../../services/chat'
import { useLinkPreview } from '../../hooks/useLinkPreview'
import { canEditPost, wasEdited } from '../../utils/postEdit'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'
import { useSiweAuth } from '../../context/SiweAuthContext'

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
 *
 * The body is followed by up to three things a post can carry: an image, the
 * post it quotes, and a card for the first link in it. In that order, which is
 * the order of how much of the post they are - the image is the author's own
 * content, the quote is somebody else's, and the preview is a third party's
 * description of itself. Each is absent far more often than present.
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
  /*
   * Pinning, offered only where it means something.
   *
   * Passed in rather than decided here, because "can this be pinned" is not a
   * property of the post - it is your own post, on your own page. The same
   * post in the feed has nothing to pin it to, so the control is absent there
   * and this component does not have to know why.
   */
  pinned = false,
  onTogglePin,
  /* Reactions. The list comes from usePostReactions rather than from the post,
     because a press has to change it and the feed rebuilds its posts. */
  reactions = null,
  canReact = false,
  onToggleReaction,
  /* Saving. Absent when signed out, and the state comes from the surface that
     holds the whole saved list - a hook per card would be a request per card. */
  saved = false,
  onToggleSave,
  /** Opens the composer with this post quoted. Absent where there is no
   *  composer to open, such as inside a thread. */
  onQuote,
  /** Opens one post's page, for a press on a quote card. */
  onOpenPost,
  /** Replaces the post in whatever list holds it, after an edit. */
  onEdited,
}) {
  const { account } = useSiweAuth()
  const [editing, setEditing] = useState(false)

  const written = Date.parse(post.createdAt)

  // Your own post you can always take down; a moderator can take down
  // anybody's. The endpoint decides again, and this only decides what to draw.
  const canRemove = isOwn || isModerator

  /*
   * The same function the endpoint uses, so what is offered and what is
   * allowed cannot disagree about what the rule is. The reply count is already
   * on screen for the reply button, so the rule about an answered post costs
   * nothing to apply here.
   */
  const editable =
    Boolean(onEdited) &&
    canEditPost({ post, account, replyCount: replyCount || 0 }).ok

  const tally = tallyReactions(reactions ?? post.reactions, account)
  const [picking, setPicking] = useState(false)

  /*
   * The preview for the first link in the body.
   *
   * Fetched per card rather than for the page, which is the one place in this
   * component that costs a request - and it is one indexed row for a link
   * anybody has posted before. The hook returns null for a post with no link,
   * which is most of them, and asks for nothing in that case.
   */
  const preview = useLinkPreview(post.body)

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

          {/*
            The marker, beside the original time rather than replacing it.
            Both facts matter: when it was said, and that it was changed after
            it was said. Replacing the timestamp with the edit time would hide
            the first, which is the one a reply is dated against.
          */}
          {wasEdited(post) && (
            <span
              className="feed-post-edited"
              title={`Edited ${new Date(post.editedAt).toLocaleString()}`}
            >
              edited
            </span>
          )}
        </header>

        {editing ? (
          <PostEditor
            post={post}
            onSaved={(updated) => {
              setEditing(false)
              if (updated) onEdited(updated)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {/*
             * Rendered as text, never as markup - see PostBody, which also
             * turns the people a post names and the pages it links into links
             * without ever building HTML from what a stranger typed.
             */}
            <PostBody post={post} onOpenProfile={onOpenProfile} />

            {post.image && <PostImage image={post.image} />}

            {post.quote && (
              <QuoteCard
                quote={post.quote}
                onOpenPost={onOpenPost}
                onOpenProfile={onOpenProfile}
              />
            )}

            {/* Only when there is a card to draw: no link, an unfetchable one,
                or a page with no title all come back null. */}
            <LinkPreviewCard preview={preview} />
          </>
        )}

        {/* The tallies, and the way to add one. Drawn above the tools rather
            than among them: a reaction is a response to the post, and the
            tools are things done to it. */}
        {(tally.length > 0 || canReact) && (
          <MessageReactions
            tally={tally}
            canReact={canReact}
            picking={picking}
            onPick={() => setPicking((open) => !open)}
            onToggle={(emoji, on) => {
              setPicking(false)
              onToggleReaction?.(post.id, emoji, on)
            }}
          />
        )}

        <div className="feed-post-tools">
          {/*
            A link to this post, at `/p/<id>`. First among the controls that
            are not moderation, because it is the only one here that is about
            spreading the post rather than policing it - and on a site nobody
            has heard of, being shareable is the thing that matters most.
          */}
          <ShareButton
            where={{ tab: 'post', post: post.id }}
            label="Copy a link to this post"
            className="feed-tool"
          />

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
            Quoting: a post of your own carrying this one. Beside reply rather
            than among the moderation controls, because it is the other way of
            answering somebody - a reply goes under their post, a quote goes
            on your own page where your own followers see it.
          */}
          {onQuote && (
            <button
              type="button"
              className="feed-tool"
              onClick={() => onQuote(post)}
              aria-label="Quote this post"
              title="Quote this post in a post of your own"
            >
              <Quote size={12} />
            </button>
          )}

          {/*
            Saving, which is private. The icon fills when it is saved and
            there is no count beside it, because nobody else can see this -
            see 0020: a saved list is what somebody is interested in but has
            not said anything about, which on this site is more revealing than
            their posts.
          */}
          {onToggleSave && (
            <button
              type="button"
              className={`feed-tool ${saved ? 'is-saved' : ''}`}
              onClick={() => onToggleSave(post.id, !saved)}
              aria-pressed={saved}
              aria-label={saved ? 'Remove from your saved posts' : 'Save this post'}
              title={saved ? 'Saved — only you can see this' : 'Save for later — only you can see this'}
            >
              <Bookmark size={12} fill={saved ? 'currentColor' : 'none'} />
            </button>
          )}

          {editable && !editing && (
            <button
              type="button"
              className="feed-tool"
              onClick={() => setEditing(true)}
              aria-label="Edit your post"
              title="Edit — the post will be marked as edited"
            >
              <Pencil size={12} />
            </button>
          )}

          {/*
            Pin and unpin are one control, and it says which it will do rather
            than which state it is in - the opposite choice from the Follow
            button on a profile, on purpose. Follow has two states somebody
            wants to read at a glance on a stranger's page; a pin has one state
            per page and it is already obvious from the label above the post,
            so the useful thing for this button to say is what pressing it does.
          */}
          {onTogglePin && (
            <button
              type="button"
              className={`feed-tool ${pinned ? 'is-pinned' : ''}`}
              onClick={() => onTogglePin(pinned ? null : post.id)}
              aria-label={pinned ? 'Unpin this post' : 'Pin this post to your profile'}
              title={pinned ? 'Unpin from your profile' : 'Pin to the top of your profile'}
            >
              {pinned ? <PinOff size={12} /> : <Pin size={12} />}
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
