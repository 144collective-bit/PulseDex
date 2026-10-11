import { postSegments, linkLabel } from '../../utils/postText'

/**
 * A post's text, with the people it names and the pages it links made into
 * links.
 *
 * Kept apart from PostCard because the same text appears in a reply, in a
 * thread and on a profile, and because the one thing it must never do is get
 * more clever. Everything here was typed by a stranger and is shown at full
 * width to anybody who loads the site.
 *
 * Nothing is parsed out of the body to find a mention. `post.mentions` is a
 * list of rows the database holds, so the handles searched for are the ones
 * that were actually meant - which is how a mention of an account whose name
 * contains a space gets drawn at all, and how it keeps working after that
 * account renames. Links are found by pattern, because there is no table of
 * them - but only https ones, and the pattern's output is matched back against
 * the body as a fixed string rather than re-run.
 *
 * Still text, never markup. `postSegments` returns pieces of the original
 * string and this maps them to elements, so a handle or a URL containing angle
 * brackets is drawn as angle brackets. There is no point in this path where a
 * string becomes HTML.
 */
export default function PostBody({ post, onOpenProfile }) {
  const body = post?.body || ''
  const mentions = Array.isArray(post?.mentions) ? post.mentions : []

  const segments = postSegments(body, mentions)

  // The common case, and worth not doing any work for: most posts name nobody
  // and link nothing, and `white-space: pre-wrap` in the stylesheet keeps the
  // paragraphs the author wrote.
  if (segments.length === 1 && segments[0].type === 'text') {
    return <p className="feed-post-text">{body}</p>
  }

  return (
    <p className="feed-post-text">
      {segments.map((segment, i) => {
        if (segment.type === 'mention') {
          return (
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
          )
        }

        if (segment.type === 'link') {
          return (
            <a
              key={i}
              className="feed-post-link"
              href={segment.value}
              target="_blank"
              /*
               * `noopener noreferrer` so the opened page gets neither a handle
               * on this window nor the page it came from, and `nofollow ugc`
               * because this is a link a stranger put in a post - the same
               * attributes a profile link carries, for the same reasons.
               */
              rel="noopener noreferrer nofollow ugc"
              onClick={(e) => e.stopPropagation()}
              /* The full URL on hover, since the label is shortened. Somebody
                 deciding whether to follow a link should be able to see where
                 it actually goes without pressing it. */
              title={segment.value}
            >
              {/*
                The host first and the path truncated. A full URL in running
                text is unreadable and, worse, is a way to make a link look
                like it points somewhere it does not - a long path can be made
                to read as a hostname. The host is the part that decides where
                a press goes, so it leads.
              */}
              {linkLabel(segment.value)}
            </a>
          )
        }

        // Keyed by index, which is safe here: the segments are a pure function
        // of one string and are rebuilt whole whenever it changes.
        return <span key={i}>{segment.value}</span>
      })}
    </p>
  )
}
