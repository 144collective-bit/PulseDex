import { useRef, useState } from 'react'
import { ImagePlus, Loader2, PenLine, X } from 'lucide-react'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { createPost, uploadPostImage } from '../../services/posts'
import { postLength, MAX_POST_LENGTH } from '../../utils/post'
import { useMentionPicker } from '../../hooks/useMentionPicker'
import ChatAvatar from './ChatAvatar'
import QuoteCard from './QuoteCard'
import { ACCEPT_ATTRIBUTE, fileToPostImage } from '../../utils/avatarImage'
import { formatAddress } from '../../utils/formatters'
import { useRateUsage } from '../../hooks/useRateUsage'
import { resetLabel, usageLabel } from '../../utils/rateUsage'

/** Show the counter once it is worth watching, not from the first letter. */
const COUNTER_APPEARS_AT = MAX_POST_LENGTH - 300

/**
 * The box you write a post in.
 *
 * Close to ChatComposer and deliberately not shared with it. The two differ in
 * the thing a composer is mostly made of - what Enter does. In a chat Enter
 * sends, because a message is a line and the next one is coming; in a post it
 * makes a paragraph, because the whole reason a post may be two thousand
 * characters is that it can have shape. One component taking that as a prop
 * would be a component whose only real content is a conditional.
 */
export default function PostComposer({
  onPosted,
  parentId = null,
  /* The post being quoted, if the composer was opened from one. A whole post
     rather than an id, so the card can be drawn without another query. */
  quoting = null,
  onClearQuote,
}) {
  const { isSignedIn, isBusy, signIn } = useSiweAuth()

  /*
   * How much of the posting allowance is left.
   *
   * The limits have been enforced since the chat shipped and have never been
   * shown, so the first anybody knew about one was being refused mid-sentence
   * by a number they had never seen - which reads as the site being broken
   * rather than as a rule being applied. This is that number, before it bites.
   */
  const usage = useRateUsage({ kind: 'posts' })

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  /*
   * The picked image, cropped and re-encoded, held until Post.
   *
   * Nothing is uploaded on pick: a picture somebody picked and then thought
   * better of should not already be sitting in a public bucket, and the rest
   * of this form works the same way. The upload happens inside `send`, before
   * the post, so a picture that cannot be stored fails before any words are
   * published.
   */
  const [image, setImage] = useState(null)
  const [imageError, setImageError] = useState(null)
  const [preparing, setPreparing] = useState(false)
  const fileInput = useRef(null)

  const input = useRef(null)

  /*
   * Naming somebody, by picking them rather than by typing their name.
   *
   * The only way to mention an account whose handle contains a space - see
   * src/hooks/useMentionPicker.js. Not offered in the chat composer, where a
   * mention notifies nobody.
   */
  const mention = useMentionPicker({ value: draft, onChange: setDraft, inputRef: input })

  const length = postLength(draft)
  const overLimit = length > MAX_POST_LENGTH
  /*
   * Text is required even with an image.
   *
   * `posts.body` is NOT NULL with a minimum length of 1 by 0005, so an
   * image-only post is not something the schema allows - and rather than
   * widen that column, this keeps the requirement, because the body is what
   * makes a post searchable, quotable, and readable to somebody using a
   * screen reader. A picture with no words is a post that says nothing to a
   * third of the people who might read it.
   */
  /*
   * The window closest to refusing, or null before the fetch answers.
   *
   * Declared with `canSend` rather than beside the markup, because both are
   * read during render and the button's disabled state depends on it.
   */
  const tight = usage.usage?.tightest || null

  /*
   * `blocked` disables the button as well as showing the line.
   *
   * Not a permission check - the endpoint counts rows in the database and
   * refuses regardless of what the browser believes. What it saves is the
   * worst version of this interaction: writing two thousand characters,
   * pressing Post, and being told no. The limit is enforced there; this is
   * what makes it legible here.
   */
  const canSend =
    length > 0 && !overLimit && !sending && !preparing && !usage.usage?.blocked

  /**
   * Read a picked file, fit it inside the box, and hold it until Post.
   *
   * Everything about the picture is done here, in the browser: decoded,
   * EXIF orientation applied, scaled to fit 1280 on the longest edge with the
   * aspect ratio kept, and re-encoded as a JPEG. The re-encode is what strips
   * the metadata - a phone photo carries the model, often the time, and
   * sometimes the coordinates it was taken at, none of which anybody means to
   * publish with a chart screenshot.
   *
   * Fitted rather than cropped, unlike an avatar: a post's image is the
   * content, and a centre crop of a chart takes the axis off the bottom.
   */
  async function pickImage(event) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file twice in a row fires `change` again.
    event.target.value = ''
    if (!file) return

    setImageError(null)
    setPreparing(true)

    const result = await fileToPostImage(file)

    setPreparing(false)
    if (result.error) {
      setImageError(result.error)
      return
    }

    setImage(result)
  }

  async function send(event) {
    event.preventDefault()
    if (!canSend) return

    setSending(true)
    setError(null)

    try {
      /*
       * The image first, and awaited, so its failure is its own.
       *
       * A post published with a broken image beside it is worse than a
       * picture that could not be stored and said so - and the endpoint that
       * stores it is separate precisely so the two can fail apart. The cost is
       * an orphan if the post then fails: a few kilobytes nothing points at,
       * which is the cheaper of the two mistakes.
       */
      let stored = null
      if (image) {
        stored = await uploadPostImage(image)
      }

      const post = await createPost(draft, parentId, mention.mentions, {
        quoteId: quoting?.id ?? null,
        image: stored,
      })

      /*
       * Cleared only after the post succeeds. Clearing optimistically reads
       * better right up until the request fails, at which point two thousand
       * characters somebody just wrote are gone and the error is about a post
       * they can no longer see. That is a worse trade here than in the chat,
       * where the lost text is one line.
       */
      setDraft('')
      // Nobody picked, for the next post. Otherwise an address picked here
      // rides along with whatever is written next.
      mention.reset()
      setImage(null)
      setImageError(null)
      // The quote too, for the same reason: the next post is not about this
      // one unless somebody says so again.
      onClearQuote?.()
      /*
       * Counted locally rather than refetched. Somebody writing their third
       * post in a minute needs the line to say so before they write a fourth,
       * and a round trip to find that out is a round trip during which they
       * have already written it.
       */
      usage.record()
      if (post) onPosted(post)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="feed-composer feed-signin">
        <p className="chat-signin-text">
          Sign in with your wallet to {parentId ? 'reply' : 'post'}.
        </p>
        <button type="button" className="chat-send" onClick={signIn} disabled={isBusy}>
          {isBusy ? <Loader2 size={14} className="chat-spin" /> : null}
          {isBusy ? 'Signing in' : 'Sign in'}
        </button>
      </div>
    )
  }

  return (
    <form className="feed-composer" onSubmit={send}>
      <textarea
        ref={input}
        className="feed-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          mention.refresh()
        }}
        /* Moving the caret into a half-typed name should offer it, not only
           typing one. `selectionchange` on the document would be the thorough
           way and fires for every selection on the page. */
        onKeyUp={mention.refresh}
        onClick={mention.refresh}
        onKeyDown={(e) => {
          // The list owns the arrows and Enter while it is open. Without
          // this, Enter would pick a name and add a paragraph.
          mention.onKeyDown(e)
        }}
        /* Closed on the way out, but not before a click on the list has
           landed - `mousedown` on an option runs first and picks. */
        onBlur={() => setTimeout(() => mention.open && mention.reset(), 150)}
        placeholder={parentId ? 'Post your reply' : "What's happening on PulseChain?"}
        rows={parentId ? 2 : 3}
        role="combobox"
        aria-expanded={mention.open}
        aria-autocomplete="list"
        aria-controls="mention-options"
        /*
         * Twice the limit, so paste is not silently truncated at exactly the
         * boundary. What the counter says and what the server enforces is the
         * real limit; this only stops the box holding a novel.
         */
        maxLength={MAX_POST_LENGTH * 2}
        aria-label="Your post"
      />

      {/*
        Who you might mean.

        Under the box rather than floating over the text. A popover following
        the caret is what a desktop editor does and needs measuring the
        textarea's contents to place; this is a composer three lines tall, and
        a list under it is never in the way of what is being written.
      */}
      {mention.open && (
        <ul className="mention-options" id="mention-options" role="listbox">
          {mention.options.map((person, i) => (
            <li key={person.address} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === mention.active}
                className={`mention-option ${i === mention.active ? 'is-active' : ''}`}
                /* mousedown, not click: the textarea blurs first on a click
                   and the list would be gone before the press landed. */
                onMouseDown={(e) => {
                  e.preventDefault()
                  mention.pick(person)
                }}
                onMouseEnter={() => mention.setActive(i)}
              >
                <ChatAvatar
                  address={person.address}
                  avatarId={person.avatarId}
                  avatarUrl={person.avatarUrl}
                  size={20}
                />
                <span className="mention-handle font-mono">{person.handle}</span>
                {/* The address beside the name, always. A handle is chosen,
                    and on a site about what to buy, being mistaken for
                    somebody trusted is worth money. */}
                <span className="mention-address font-mono">{formatAddress(person.address)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        The post being quoted, drawn as it will appear.
        
        Above the foot rather than under the box, so what is being written sits
        next to what it is about - and with the same card the published post
        uses, so there is no gap between what the composer promises and what
        appears.
      */}
      {quoting && (
        <div className="composer-quote">
          <QuoteCard quote={quoting} />
          <button
            type="button"
            className="composer-chip-remove"
            onClick={onClearQuote}
            aria-label="Do not quote this post"
            title="Do not quote this post"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/*
        The picked image, before it is uploaded.
        
        Shown at the shape it will be published at, which is the whole reason
        the dimensions come back from fileToPostImage - a preview that does not
        match the result is a preview that misleads about the one thing it is
        for.
      */}
      {image && (
        <div className="composer-image">
          <img src={image.dataUrl} alt="" width={image.width} height={image.height} />
          <button
            type="button"
            className="composer-chip-remove"
            onClick={() => setImage(null)}
            aria-label="Remove this image"
            title="Remove this image"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="feed-composer-foot">
        {error || imageError ? (
          <span className="chat-error" role="alert">
            {error || imageError}
          </span>
        ) : (
          <span className="chat-hint font-mono">
            {parentId ? 'Replies show on your profile too' : 'Posts stay on your profile'}
          </span>
        )}

        {/*
          Attaching a picture. One per post: the schema holds one URL, and a
          gallery is a different feature with its own layout problems.
        */}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={pickImage}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
        />

        <button
          type="button"
          className="feed-tool"
          onClick={() => fileInput.current?.click()}
          disabled={preparing || sending || Boolean(image)}
          aria-label="Attach an image"
          title={image ? 'One image per post' : 'Attach an image'}
        >
          {preparing ? <Loader2 size={13} className="chat-spin" /> : <ImagePlus size={13} />}
        </button>

        {/*
         * Counted by the same function the server enforces with, so this
         * number and the one that decides cannot disagree.
         */}
        {length >= COUNTER_APPEARS_AT && (
          <span className={`chat-count font-mono ${overLimit ? 'over' : ''}`}>
            {length} / {MAX_POST_LENGTH}
          </span>
        )}

        {/*
          The allowance, shown only once it is worth watching - the same rule
          the character counter follows just above, and for the same reason. "0
          of 3 a minute" on an empty composer is a rule nobody asked about,
          displayed where it reads as a warning.

          The tightest window rather than all of them: which one binds changes
          with how somebody is posting, and `rateUsage` already picks it.
         */}
        {tight && (tight.used > 0 || usage.usage?.blocked) && (
          <span className={`chat-count font-mono ${usage.usage?.blocked ? 'over' : ''}`}>
            {usageLabel(tight)}
            {/* Only when there is no room, because a countdown on a limit
                nobody is near is a timer that invites being watched. */}
            {resetLabel(tight.resetsInMs) ? ` — more in ${resetLabel(tight.resetsInMs)}` : ''}
          </span>
        )}

        <button type="submit" className="chat-send" disabled={!canSend}>
          {sending ? <Loader2 size={14} className="chat-spin" /> : <PenLine size={14} />}
          {sending ? 'Posting' : parentId ? 'Reply' : 'Post'}
        </button>
      </div>
    </form>
  )
}
