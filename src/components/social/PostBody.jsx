import { splitMentions } from '../../utils/mentions'

/**
 * A post's text, with the people it names made into links.
 *
 * Kept apart from PostCard because the same text appears in a reply, in a
 * thread and on a profile, and because the one thing it must never do is get
 * more clever. Everything here was typed by a stranger and is shown at full
 * width to anybody who loads the site.
 *
 * Nothing is parsed out of the body. `post.mentions` is a list of rows the
 * database holds, so the handles searched for are the ones that were actually
 * meant - which is how a mention of an account whose name contains a space
 * gets drawn at all, and how it keeps working after that account renames.
 *
 * Still text, never markup. `splitMentions` returns pieces of the original
 * string and this maps them to elements, so a handle containing angle
 * brackets is drawn as angle brackets. There is no point in this path where a
 * string becomes HTML.
 */
export default function PostBody({ post, onOpenProfile }) {
  const body = post?.body || ''
  const mentions = Array.isArray(post?.mentions) ? post.mentions : []

  // The common case, and worth not doing any work for: most posts name
  // nobody, and `white-space: pre-wrap` in the stylesheet keeps the
  // paragraphs the author wrote.
  if (mentions.length === 0) {
    return <p className="feed-post-text">{body}</p>
  }

  const segments = splitMentions(body, mentions)

  return (
    <p className="feed-post-text">
      {segments.map((segment, i) =>
        segment.type === 'mention' ? (
          <button
            key={i}
            type="button"
            className="feed-post-mention"
            /*
             * Opened by address, not by the handle in the text. They agree
             * today and will not forever: the text is what somebody typed,
             * the address is who they meant, and only one of those still
             * points at the right person after a rename.
             */
            onClick={(e) => {
              e.stopPropagation()
              onOpenProfile?.({ address: segment.address })
            }}
          >
            {segment.value}
          </button>
        ) : (
          // Keyed by index, which is safe here: the segments are a pure
          // function of one string and are rebuilt whole whenever it changes.
          <span key={i}>{segment.value}</span>
        )
      )}
    </p>
  )
}
