import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { isSafeAvatarSrc } from '../../utils/avatarImage'

/**
 * The image attached to a post.
 *
 * Three things it does, and the first is the one worth explaining.
 *
 * It reserves the space before the bytes arrive. The width and height come
 * from the database - 0020 stores them alongside the URL for exactly this -
 * and go into the `aspect-ratio` of the box. Without that, a feed reflows
 * every time an image decodes: you start reading a post and it jumps up the
 * screen, which on a phone on a slow connection happens repeatedly while
 * scrolling. The `width` and `height` attributes are set too, which is what
 * lets a browser do the same reservation before any CSS has applied.
 *
 * It caps how tall an image may be. A 600x4000 screenshot would otherwise be
 * four screens of one post, and scrolling past it would be the only thing a
 * reader could do with the feed.
 *
 * And it says so when the picture does not load. A broken image icon in a
 * feed reads as the site being broken; a line saying the image could not be
 * loaded reads as one post with a problem.
 */
export default function PostImage({ image, alt = '' }) {
  const [failed, setFailed] = useState(false)

  /*
   * Checked before it reaches a `src`, although it came from our own database
   * and the endpoint that wrote it only accepts a URL inside our own bucket.
   * The column is readable with the anon key and the check that wrote it ran
   * in another process on another day; the cost of checking is a regex against
   * the cost of one bad row becoming a URL the browser fetches.
   */
  if (!image?.url || !isSafeAvatarSrc(image.url)) return null

  const width = Number(image.width)
  const height = Number(image.height)
  const known = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0

  if (failed) {
    return (
      <p className="post-image-failed">
        <ImageOff size={13} />
        <span>That image could not be loaded.</span>
      </p>
    )
  }

  return (
    <div
      className="post-image"
      /*
       * `aspect-ratio` rather than a padding hack, and only when the size is
       * known. A row missing either dimension is drawn without a reservation
       * rather than with a guessed one - a box of the wrong shape collapses
       * when the image lands, which is the same reflow this exists to prevent
       * and harder to explain.
       */
      style={known ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <img
        src={image.url}
        /*
         * Empty alt, deliberately, and this is a decision rather than an
         * oversight. There is no description of a post's image anywhere -
         * nothing asks the author for one - so any alt text here would be
         * invented. An empty alt tells a screen reader this is presentational
         * and to move on to the post's words, which is honest; "image" or the
         * filename would be noise read aloud in place of nothing.
         *
         * If a description is ever collected from the author, it goes here.
         */
        alt={alt}
        {...(known ? { width, height } : {})}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
