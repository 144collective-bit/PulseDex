import { useCallback, useEffect, useRef, useState } from 'react'
import { searchProfiles, fetchActiveProfiles } from '../services/discover'
import { readMentionQuery, applyMention, keepPicked } from '../utils/mentionDraft'

/** How many names to offer. A list longer than this is a list nobody reads to
 *  the end of, and the query is meant to be narrowed rather than scrolled. */
const MAX_OPTIONS = 6

/** Long enough not to fire per keystroke, short enough that the list feels
 *  attached to the typing. */
const DEBOUNCE_MS = 180

/**
 * Picking somebody to mention while writing a post.
 *
 * This is the only way to mention an account whose handle has a space in it.
 * `post_mentions` was built that way on purpose - "@Pulse Trader" cannot be
 * parsed out of text, so those accounts have always been mentionable in
 * principle and unreachable in practice. The endpoint has taken picked
 * addresses since the table existed; nothing was sending any.
 *
 * Only in the post composer, and that is a decision rather than an oversight.
 * A chat message records no mentions and notifies nobody - see
 * api/_routes/chat/messages.js, which calls none of the notify helpers - so
 * offering the same list there would invite somebody to name a person who
 * would never be told. Better no affordance than one that quietly does
 * nothing.
 *
 * @param {{ value: string, onChange: (text: string) => void,
 *   inputRef: { current: HTMLTextAreaElement | null } }} params
 */
export function useMentionPicker({ value, onChange, inputRef }) {
  const [query, setQuery] = useState(null)
  const [options, setOptions] = useState([])
  const [active, setActive] = useState(0)

  /*
   * Who has been picked, with the handle as it was picked.
   *
   * The handle matters as much as the address: `keepPicked` checks the draft
   * still names them, so somebody who picks a name and then deletes it does
   * not silently notify that person about a post that no longer mentions
   * them.
   */
  const [picked, setPicked] = useState([])

  /* Where the caret was when the query was read, so a pick edits the draft at
     the place the reader is looking rather than at its end. */
  const caret = useRef(0)

  /* Set while a pick is being applied. The change it causes would otherwise
     be read as new typing and reopen the list on the name just inserted. */
  const justPicked = useRef(false)

  /*
   * The `@` somebody pressed Escape on.
   *
   * Without this, Escape closes the list and the very next keyup reopens it:
   * the draft still holds the same half-typed name, so re-reading it finds
   * the same query and the list comes back before the key is released. A
   * dismissal that undoes itself within the same keystroke is not a
   * dismissal.
   *
   * Cleared when the caret moves to a different `@`, or away from one
   * entirely - so dismissing this mention says nothing about the next.
   */
  const dismissed = useRef(null)

  const close = useCallback(() => {
    setQuery(null)
    setOptions([])
    setActive(0)
  }, [])

  /** Re-read the draft at the caret. Called on every change and on selection
   *  moves, because moving the cursor into a half-typed name should offer it. */
  const refresh = useCallback(() => {
    if (justPicked.current) {
      justPicked.current = false
      return close()
    }

    const el = inputRef.current
    if (!el) return close()

    caret.current = el.selectionStart ?? el.value.length
    const found = readMentionQuery(el.value, caret.current)

    if (!found) {
      dismissed.current = null
      return close()
    }

    // Still the one that was dismissed. Leave it shut.
    if (dismissed.current === found.at) return close()

    dismissed.current = null
    setQuery(found.query)
  }, [close, inputRef])

  /* The names to offer. An empty query shows who has been posting rather than
     nothing: the picker opens on "@" and a list that starts empty reads as a
     picker that does not work. */
  useEffect(() => {
    if (query === null) return undefined

    let alive = true
    const timer = setTimeout(() => {
      const wanted = query.trim() ? searchProfiles(query, MAX_OPTIONS * 2) : fetchActiveProfiles({ limit: MAX_OPTIONS * 2 })

      Promise.resolve(wanted)
        .then((people) => {
          if (!alive) return
          // Only accounts with a handle: there is nothing to type for the
          // rest, and picking one would insert "@null".
          setOptions((people || []).filter((p) => p.handle).slice(0, MAX_OPTIONS))
          setActive(0)
        })
        // A failed lookup closes the list rather than showing an error inside
        // a composer. Nobody is blocked - the post still sends.
        .catch(() => alive && setOptions([]))
    }, DEBOUNCE_MS)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  const pick = useCallback(
    (profile) => {
      const el = inputRef.current
      if (!profile?.handle || !el) return

      const next = applyMention(el.value, caret.current, profile.handle)

      justPicked.current = true
      onChange(next.text)
      setPicked((current) => [...current, { handle: profile.handle, address: profile.address }])
      close()

      /*
       * After React has written the new value. Setting the selection before
       * that puts the caret in the old text, and the browser then moves it to
       * the end when the value changes underneath it.
       */
      requestAnimationFrame(() => {
        const input = inputRef.current
        if (!input) return
        input.focus()
        input.setSelectionRange(next.caret, next.caret)
      })
    },
    [close, inputRef, onChange],
  )

  /**
   * Keys the list owns while it is open.
   *
   * Returns true when it handled the event, so the composer knows not to also
   * send the post - Enter with a list open means "pick this one", and a
   * composer that posted as well would publish a half-typed name.
   */
  const onKeyDown = useCallback(
    (event) => {
      if (query === null || options.length === 0) return false

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((i) => (i + 1) % options.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => (i - 1 + options.length) % options.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pick(options[active])
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        // Remembered, so the keyup a moment later does not reopen it.
        const el = inputRef.current
        const found = el ? readMentionQuery(el.value, el.selectionStart ?? el.value.length) : null
        dismissed.current = found ? found.at : null
        close()
        return true
      }

      return false
    },
    [active, close, inputRef, options, pick, query],
  )

  /** The addresses to send with the post: picked, and still named in it. */
  const mentions = keepPicked(value, picked).map((m) => m.address)

  /** After a post is published, so the next one starts with nobody picked. */
  const reset = useCallback(() => {
    setPicked([])
    dismissed.current = null
    close()
  }, [close])

  return {
    open: query !== null && options.length > 0,
    options,
    active,
    setActive,
    refresh,
    onKeyDown,
    pick,
    mentions,
    reset,
  }
}
