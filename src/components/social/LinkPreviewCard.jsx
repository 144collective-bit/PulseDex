import { ExternalLink } from 'lucide-react'

/**
 * What a linked page says about itself.
 *
 * Text only, and that absence is the whole design. An og:image is the obvious
 * thing to put on a card like this and it is the one thing that would undo the
 * reason the preview is fetched on the server at all: rendering it means the
 * reader's browser requests it from the linked site, which hands that site the
 * IP address, user agent and referrer of everybody who scrolled past the post.
 * On a site where a post might link to a token's page, that is a list of this
 * app's readers handed to whoever wrote the link.
 *
 * So the card carries a title, a line of description and the site's name, all
 * fetched once by our server and served to every reader out of our own
 * database. There is no column for an image to live in - see
 * 0020_posts_worth_making.sql - which is deliberate so that adding one is a
 * migration somebody has to write and think about rather than a prop.
 *
 * The hostname is shown rather than the full URL, as every preview card does,
 * and that is a safety decision as much as a tidiness one: a long URL
 * truncated in the middle can be made to read as pointing somewhere it does
 * not. The hostname is the part that decides where a press goes.
 */
export default function LinkPreviewCard({ preview }) {
  if (!preview?.ok || !preview.title) return null

  let host = preview.siteName
  try {
    host = host || new URL(preview.url).hostname
  } catch {
    // A URL this cannot parse never got a preview - checkPreviewTarget
    // produced it - so this is belt and braces rather than a real branch.
  }

  return (
    <a
      className="post-link-preview"
      href={preview.url}
      target="_blank"
      /*
       * `noopener noreferrer` so the opened page gets neither a handle on this
       * window nor the page they came from, and `nofollow ugc` because this is
       * a link a stranger put in a post - the same attributes profile links
       * carry, for the same reasons.
       */
      rel="noopener noreferrer nofollow ugc"
      /* So a press on the card does not also open whatever contains it - a
         quoted post, or a feed row that navigates. */
      onClick={(e) => e.stopPropagation()}
    >
      <span className="post-link-host font-mono">
        <ExternalLink size={11} />
        {host}
      </span>

      {/* Both rendered as text by React. readPreviewMeta decodes HTML
          entities, so a title containing angle brackets arrives here as angle
          brackets - and is drawn as them, never as markup. */}
      <span className="post-link-title">{preview.title}</span>

      {preview.description && (
        <span className="post-link-description">{preview.description}</span>
      )}

      {/*
        Said on the card, once. A preview is this site repeating a claim a
        stranger's page made about itself, and on a site about which tokens to
        buy that is exactly the kind of thing worth not appearing to endorse.
      */}
      <span className="post-link-note font-mono">What this page says about itself</span>
    </a>
  )
}
