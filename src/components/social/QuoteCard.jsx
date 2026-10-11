import { AlertTriangle, Image as ImageIcon } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'

/**
 * The post a post is quoting, drawn inside it.
 *
 * A card rather than a blockquote of text, because the thing that matters
 * about a quote is *who* said it - on a site about which tokens to buy, a
 * quoted claim with no author attached is just an assertion in somebody else's
 * post. So the face and the name are the top line, as they are on a post.
 *
 * Deliberately not interactive except for the whole card, and deliberately
 * shallow. Three things it does not do:
 *
 * - No reactions, no reply, no share. The controls belong to the post that
 *   contains this one; two sets of them on one card is two sets of ambiguity
 *   about which post a press applies to. Opening the quoted post is one press
 *   and gets its own controls.
 * - No nested quote. A quote of a quote shows the inner post's words and not
 *   its own quote - POST_QUOTE is not recursive, so there is nothing here to
 *   draw. Nesting cards inside cards is unreadable at two levels and a denial
 *   of service at twenty.
 * - No image, only a note that there is one. A post's image is up to 1280
 *   pixels and would dominate the post quoting it; the note is what tells a
 *   reader there is something to go and see.
 *
 * A removed post is said rather than hidden. The two read completely
 * differently: a card saying so tells somebody the quote existed and is gone,
 * while no card at all makes the quoting post look like it was always only
 * those words - which would make a removal into a quiet rewrite of whoever
 * quoted it.
 */
export default function QuoteCard({ quote, onOpenPost, onOpenProfile }) {
  if (!quote) return null

  if (quote.removed) {
    return (
      <p className="post-quote is-gone">
        <AlertTriangle size={13} />
        <span>That post is not here.</span>
      </p>
    )
  }

  const written = Date.parse(quote.createdAt)
  const name = quote.handle || formatAddress(quote.address)

  return (
    /*
     * A div with a click rather than a <button>, because this card contains a
     * button - the author's name - and a button inside a button is invalid
     * markup that browsers resolve by dropping one of them. The role and the
     * key handler are what put the keyboard behaviour back.
     */
    <div
      className="post-quote"
      role="link"
      tabIndex={0}
      onClick={() => onOpenPost?.(quote.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenPost?.(quote.id)
        }
      }}
      aria-label={`Quoted post by ${name}`}
    >
      <div className="post-quote-head font-mono">
        <ChatAvatar address={quote.address} size={18} />

        <button
          type="button"
          className="chat-author"
          title={quote.address}
          onClick={(e) => {
            // Without this the press also opens the quoted post, so pressing
            // the name would land somewhere other than the name said.
            e.stopPropagation()
            onOpenProfile?.({ address: quote.address })
          }}
        >
          {name}
        </button>

        {/* The address beside the handle, always, for the reason every other
            surface here shows it: a display name is chosen, and on this site
            being mistaken for somebody trusted is worth money. */}
        {quote.handle && (
          <span className="chat-address" title={quote.address}>
            {formatAddress(quote.address)}
          </span>
        )}

        {Number.isFinite(written) && (
          <time className="chat-time" dateTime={quote.createdAt}>
            {formatTimeAgo(Math.floor(written / 1000))}
          </time>
        )}
      </div>

      {/*
        Text, never markup, and without the mention links the containing post
        draws. A mention inside a quote would be a third thing to press on a
        card whose whole job is to be pressed once - and splitMentions needs
        the mention rows, which POST_QUOTE deliberately does not fetch.
      */}
      <p className="post-quote-text">{quote.body}</p>

      {quote.image && (
        <p className="post-quote-image font-mono">
          <ImageIcon size={11} />
          <span>Has an image</span>
        </p>
      )}
    </div>
  )
}
