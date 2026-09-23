import { useEffect, useRef, useState } from 'react'
import { Link2, Check } from 'lucide-react'
import { shareLink, copyText } from '../../utils/shareLink'

/**
 * Hand somebody the link to what they are looking at.
 *
 * The control that makes the last three batches of URL work worth anything.
 * A room, a message and a post can all be pointed at now, and until this
 * existed only somebody who thought to read the address bar could take one -
 * which on a phone, where most of this is read, means almost nobody.
 *
 * Copy rather than the native share sheet. `navigator.share` looks better on
 * a phone and is absent on most desktops, needs a user gesture it sometimes
 * rejects anyway, and gives no answer when somebody dismisses it - so the
 * control would silently do nothing on the machines where it is hardest to
 * fall back. One behaviour everywhere beats a better one that is sometimes
 * missing.
 *
 * Says "Copied" for a moment afterwards. Without it, pressing this does
 * nothing observable, and a control with no feedback gets pressed again.
 *
 * @param {{ where: object, label?: string, className?: string }} props
 *   `where` is the same shape src/utils/socialPath.js takes.
 */
export default function ShareButton({ where, label = 'Copy link', className = 'chat-tool' }) {
  const [state, setState] = useState('idle')
  const timer = useRef(null)

  // The timeout outlives the component when somebody copies and immediately
  // navigates away, which is a state update on something unmounted.
  useEffect(() => () => clearTimeout(timer.current), [])

  const link = shareLink(where)
  // No origin to build on. Nothing to copy, so nothing to press.
  if (!link) return null

  const onCopy = async () => {
    const ok = await copyText(link)
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1800)
  }

  /*
   * The failure is said out loud rather than swallowed. Both copy paths can
   * be refused, and somebody who thinks they have a link and has not is worse
   * off than somebody told to copy it by hand.
   */
  const title =
    state === 'copied' ? 'Copied' : state === 'failed' ? `Copy it by hand: ${link}` : label

  return (
    <button
      type="button"
      className={`${className} share-button ${state === 'copied' ? 'is-copied' : ''}`}
      onClick={onCopy}
      aria-label={label}
      title={title}
    >
      {state === 'copied' ? <Check size={12} /> : <Link2 size={12} />}
      {/*
        Announced rather than only drawn. The icon swap is invisible to a
        screen reader, and this is the only confirmation there is.
      */}
      <span className="sr-only" role="status">
        {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Could not copy' : ''}
      </span>
    </button>
  )
}
