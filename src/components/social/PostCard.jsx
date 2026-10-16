import { useState } from 'react'
import {
  Ban,
  Bookmark,
  Eye,
  EyeOff,
  Flag,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Quote,
  Trash2,
  VolumeX,
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
import { hiddenNotice } from '../../utils/autoHide'
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
  /*
   * Muting, which is the reader's own control and not a moderator's.
   *
   * Absent on your own post and when signed out. Passed in rather than taken
   * from a hook here for the reason `saved` is: a hook per card is a request
   * per card, and twenty cards came to sixty requests once already.
   */
  onMute,
  /** Hiding, which is a moderator's. Absent for everybody else. */
  onToggleHide,
  /*
   * Why this post is where it is, when something other than time put it there.
   *
   * Null for most posts, and then nothing is drawn - a label on every row
   * would be noise, and "because it is recent" explains nothing. Built in
   * src/utils/feedRank.js so the sentence and the score cannot drift apart.
   */
  rankReason = null,
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

  /*
   * A post taken out of the feed pending review.
   *
   * Three readers, two renderings. The author and a moderator see the post
   * with a notice above it, because the author has to know it is still there
   * and a moderator has to be able to read the thing they are deciding about.
   * Anybody else sees the notice instead of the post.
   *
   * A stranger gets a notice at all, rather than the card being absent, and
   * that is the choice worth defending: a post that simply vanished from a
   * thread leaves a reply answering nothing, and somebody following a link to
   * it would conclude it had never existed. "Something is being withheld" is
   * more honest than silence, and it is the same reason a removed quote says
   * so instead of disappearing.
   *
   * Reached here at all because row level security cannot do it - see 0021:
   * there is no identity for a policy to compare against, so a policy that
   * hid these rows would hide them from their own author too.
   */
  const hidden = Boolean(post.hiddenAt)
  const maySeeHidden = isOwn || isModerator
  const notice = hidden ? hiddenNotice(post, isOwn) : null

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
        {/*
          Above the author, not below the post. Somebody scanning a ranked feed
          is asking "why am I being shown this" before they read it, and an
          answer underneath has already been overtaken by the question.
        */}
        {rankReason && <p className="feed-post-why">{rankReason}</p>}

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

        {/*
          The notice, above the post rather than below it. Somebody scrolling
          past has to know what they are looking at before they read it, and a
          line underneath would be read as a comment on the post.
        */}
        {notice && (
          <p className={`feed-post-hidden ${maySeeHidden ? '' : 'is-only-notice'}`}>{notice}</p>
        )}

        {hidden && !maySeeHidden ? null : editing ? (
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
           * an answer to "what would this even mean".
           *
           * This used to say that nothing happens automatically, and that a
           * threshold which hid a post would be a brigading tool wearing a
           * safety feature's name. The second half is still true and is the
           * reason the threshold that now exists is not a count of reports:
           * it is distinct reporters whose wallets are over a month old, so
           * the cost of arranging a hide is three aged wallets rather than
           * three clicks. See src/utils/autoHide.js, which argues it in full.
           *
           * Nothing here says how close a post is to that line, deliberately.
           * A control that reported progress toward a hide would be the
           * reconnaissance step of the attack it exists to make expensive.
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

          {/*
            Mute, beside report and before the moderator controls, because it
            belongs to the reader rather than to the site. The distinction is
            the whole feature: a report asks somebody else to act, and this
            acts, for one person, immediately and invisibly.

            The muted account is never told. Nothing in the label hints
            otherwise either - "stop seeing" rather than "silence", because
            nobody is being silenced.
          */}
          {onMute && !isOwn && (
            <button
              type="button"
              className="feed-tool"
              onClick={() => onMute(post.address)}
              aria-label="Mute this author"
              title="Stop seeing posts from this account — they are not told"
            >
              <VolumeX size={12} />
            </button>
          )}

          {/*
            Hide and unhide, one control that says which it will do. The
            reversibility is the point of having it: removal is permanent
            enough that the honest answer to anything borderline was to do
            nothing, and this is the one a moderator can afford to get wrong.
          */}
          {onToggleHide && (
            <button
              type="button"
              className={`feed-tool ${hidden ? 'is-pinned' : ''}`}
              onClick={() => onToggleHide(post.id, !hidden)}
              aria-label={hidden ? 'Put this post back' : 'Hide this post pending review'}
              title={
                hidden
                  ? 'Put this post back in the feed'
                  : 'Take this out of the feed — reversible, and the author is told'
              }
            >
              {hidden ? <Eye size={12} /> : <EyeOff size={12} />}
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
