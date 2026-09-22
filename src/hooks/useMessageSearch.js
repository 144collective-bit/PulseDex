import { useEffect, useRef, useState } from 'react'
import { searchMessages } from '../services/chat'
import { searchTerm } from '../utils/chatSearch'

/** Long enough that typing a word is one query rather than four, short enough
 *  that the results feel like they are following along. */
const SETTLE_MS = 300

export const SEARCH_STATUS = {
  idle: 'idle',
  searching: 'searching',
  done: 'done',
  failed: 'failed',
}

/**
 * Finding something that was said in this room.
 *
 * Debounced, and stale answers are discarded rather than rendered. Both
 * matter for the same reason: a search box issues a query per keystroke
 * unless told otherwise, and those queries come back in whatever order the
 * network feels like - so without the sequence check, typing "hex" can end
 * with the results for "he" on screen under the word "hex".
 *
 * @param {string} room slug from src/config/rooms.js
 * @param {string} term whatever is in the box
 */
export function useMessageSearch(room, term) {
  /*
   * The results, and the term they are the results for.
   *
   * Kept together in one piece of state rather than as two, because they are
   * one fact and updating them separately is how the list ends up highlighted
   * by a term it was not searched with: while a refinement is in flight the
   * old results stay on screen, and marking them with what is currently in
   * the box would mark nothing at all.
   */
  const [found, setFound] = useState({ results: [], matched: '' })
  const [status, setStatus] = useState(SEARCH_STATUS.idle)
  const [error, setError] = useState(null)

  /*
   * Which request is the current one. A counter rather than a flag, because
   * the question is not "was this cancelled" but "is this still the newest" -
   * and with the cleanup below racing three in-flight fetches, only the newest
   * has an answer worth showing.
   */
  const issued = useRef(0)

  const wanted = searchTerm(term)

  useEffect(() => {
    if (!wanted) {
      // Cleared rather than left standing. Emptying the box is a way of
      // saying "never mind", and stale results under an empty field read as
      // a list that failed to update.
      setFound({ results: [], matched: '' })
      setStatus(SEARCH_STATUS.idle)
      setError(null)
      return undefined
    }

    setStatus(SEARCH_STATUS.searching)
    const mine = ++issued.current

    const timer = setTimeout(() => {
      searchMessages({ room, term: wanted })
        .then((results) => {
          if (issued.current !== mine) return
          setFound({ results, matched: wanted })
          setError(null)
          setStatus(SEARCH_STATUS.done)
        })
        .catch((err) => {
          if (issued.current !== mine) return
          setError(err.message)
          setStatus(SEARCH_STATUS.failed)
        })
    }, SETTLE_MS)

    return () => clearTimeout(timer)
  }, [room, wanted])

  return {
    results: found.results,
    /** The term these results were found with, which during a refinement is
     *  not what is in the box yet. Highlight with this one. */
    matched: found.matched,
    status,
    error,
    /** What is in the box, shaped the way the query would shape it. For
     *  saying "nothing matches X" - which is about what was asked, not about
     *  what was last answered. */
    term: wanted,
  }
}
