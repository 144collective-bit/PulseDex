import { useCallback, useState } from 'react'
import { deletePost, reportPost } from '../services/posts'
import { blockAddress } from '../services/profile'
import { formatAddress } from '../utils/formatters'

/**
 * Removing, reporting and blocking, for anything that draws a post.
 *
 * Pulled out of FeedPanel when a post got a page of its own. Two surfaces now
 * show the same post with the same three controls on it, and moderation is
 * the last thing in this app that should exist twice: the copy that is not
 * being looked at is the one that stops confirming before it deletes, or
 * stops remembering that something was already reported.
 *
 * Every one of these asks first, and every one reports its own failure rather
 * than throwing - a moderation control that fails silently teaches people it
 * worked.
 *
 * @param {{ onRemoved?: (id: number) => void }} params `onRemoved` takes the
 *   post off the screen; the caller owns the list, so it owns that.
 */
export function usePostActions({ onRemoved } = {}) {
  const [actionError, setActionError] = useState(null)

  /* Which posts this screen has already reported. Per screen rather than
     stored: the endpoint refuses a duplicate anyway, and this exists so the
     reader gets an answer rather than a silent no-op. */
  const [reported, setReported] = useState(() => new Set())

  const onRemove = useCallback(
    async (id) => {
      /*
       * Confirmed, unlike removing a chat message. A message can be reposted
       * in seconds; a post is the thing somebody wrote at length and meant to
       * keep, and the removal is soft in the database but final from here -
       * there is no undo control in this interface.
       */
      if (!window.confirm('Delete this post? This cannot be undone from here.')) return

      setActionError(null)
      /*
       * Taken off the screen before the request answers. If the request
       * fails, the post comes back on the next load, which is the right way
       * round - seeing a removal you have to redo beats believing something
       * is gone when it is still on everybody else's screen.
       */
      onRemoved?.(id)
      try {
        await deletePost(id)
      } catch (err) {
        setActionError(err.message)
      }
    },
    [onRemoved],
  )

  const onReport = useCallback(async (post) => {
    const reason = window.prompt(
      'What is wrong with this post? A moderator will read it. (Optional)',
    )
    // Cancel is null; an empty string is somebody pressing OK without typing,
    // which is a report with no reason rather than no report.
    if (reason === null) return

    setActionError(null)
    try {
      await reportPost({ id: post.id, reason })
      setReported((prev) => new Set(prev).add(post.id))
    } catch (err) {
      setActionError(err.message)
    }
  }, [])

  const onBlock = useCallback(async (address) => {
    const ok = window.confirm(
      `Block ${formatAddress(address)} from posting? Their existing posts stay.`,
    )
    if (!ok) return

    setActionError(null)
    try {
      await blockAddress({ address })
    } catch (err) {
      setActionError(err.message)
    }
  }, [])

  /* What to hand a post already reported from this screen, so pressing the
     control again says so rather than filing a second report the endpoint
     would refuse. An alert rather than the error line, because it is an
     answer to something just pressed and not a state of the page. */
  const noteAlreadyReported = useCallback(() => {
    window.alert('You have already reported this post. A moderator will look at it.')
  }, [])

  return { actionError, setActionError, reported, noteAlreadyReported, onRemove, onReport, onBlock }
}
