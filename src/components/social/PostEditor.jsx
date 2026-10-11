import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { editPost } from '../../services/posts'
import { editWindowLabel } from '../../utils/postEdit'
import { postLength, MAX_POST_LENGTH } from '../../utils/post'

/**
 * Changing a post in place.
 *
 * In place rather than in a dialog, because an edit is a correction to
 * something already on the screen and a modal takes away the thing being
 * corrected. The post's own card stays where it is and the text becomes a box.
 *
 * The countdown is drawn, and that is deliberate rather than decorative. A
 * five-minute window that silently stops working mid-sentence is a feature
 * that feels broken; one that says "2m" while you type is a limit somebody can
 * see. It stops at the window and the control disappears - the endpoint checks
 * again anyway, and losing that race shows the endpoint's sentence rather than
 * a guess.
 *
 * Only the body. Not the image, not the quote: those are what the post *is*,
 * and an edit that could swap the picture would let the words stay and the
 * evidence change. api/_routes/posts.js enforces that; this just never offers
 * it.
 */
export default function PostEditor({ post, onSaved, onCancel }) {
  const [draft, setDraft] = useState(post.body || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  /*
   * The countdown, ticking.
   *
   * Once a second, and only while this editor is open - a timer per post in a
   * feed of fifty would be fifty intervals for a control nobody has pressed.
   * `editWindowLabel` returns minutes until the last minute and then seconds,
   * so this re-renders a string that mostly does not change.
   */
  const [left, setLeft] = useState(() => editWindowLabel(post))
  useEffect(() => {
    const tick = setInterval(() => setLeft(editWindowLabel(post)), 1000)
    return () => clearInterval(tick)
  }, [post])

  const length = postLength(draft)
  const overLimit = length > MAX_POST_LENGTH
  const unchanged = draft.trim() === (post.body || '').trim()
  const canSave = length > 0 && !overLimit && !unchanged && !saving

  async function save(event) {
    event.preventDefault()
    if (!canSave) return

    setSaving(true)
    setError(null)

    try {
      const updated = await editPost(post.id, draft)
      /*
       * The row the endpoint returned, not the draft. It carries `edited_at`,
       * which is what draws the "edited" marker - and showing the draft
       * instead would leave the post looking unedited until something
       * refetched it, which is precisely the state this feature must not have.
       */
      onSaved(updated)
    } catch (err) {
      // The endpoint's own sentence where it sent one: it knows things this
      // does not, like that somebody replied while the box was open.
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="post-editor" onSubmit={save}>
      <textarea
        className="feed-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={MAX_POST_LENGTH * 2}
        aria-label="Edit your post"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />

      <div className="post-editor-foot">
        {error ? (
          <span className="chat-error" role="alert">
            {error}
          </span>
        ) : (
          <span className="chat-hint font-mono">
            {/* Said plainly, because it is the deal: the edit is allowed and
                it is permanent that it happened. */}
            {left ? `${left} left · will be marked as edited` : 'The window has closed'}
          </span>
        )}

        {length >= MAX_POST_LENGTH - 300 && (
          <span className={`chat-count font-mono ${overLimit ? 'over' : ''}`}>
            {length} / {MAX_POST_LENGTH}
          </span>
        )}

        <button type="button" className="chat-older" onClick={onCancel} disabled={saving}>
          <X size={13} />
          Cancel
        </button>

        <button type="submit" className="chat-send" disabled={!canSave}>
          {saving ? <Loader2 size={13} className="chat-spin" /> : <Check size={13} />}
          {saving ? 'Saving' : 'Save'}
        </button>
      </div>
    </form>
  )
}
