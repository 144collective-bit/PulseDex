import { ShieldCheck } from 'lucide-react'
import { accountAgeDays } from '../../utils/xProfile'
import { formatCompactCount } from '../../utils/formatters'

/**
 * The X logo, inline.
 *
 * Drawn here because lucide dropped its brand icons, and because a logo
 * fetched from a third party on a profile page would tell that third party who
 * is reading whose profile.
 */
export function XLogo({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/**
 * A linked X account on somebody's profile.
 *
 * Two things are shown here and they are deliberately not one thing:
 *
 * The handle, with a control mark. This is what the OAuth flow established -
 * whoever holds this PulseDex account logged in at x.com as @handle and
 * authorised the link. It cannot be bought and it cannot be faked without the
 * X password, which is the strongest claim on this page.
 *
 * The X subscription badge, rendered apart from it and labelled. X Premium
 * costs a few dollars a month and anybody may buy one, including an account
 * impersonating a project - which is exactly why they do. Drawn as one mark
 * with the control check, it would lend a scammer the credibility the control
 * check is there to provide honestly. So it sits separately, in a muted
 * colour, and says what it is when you hover it.
 *
 * Account age and follower count sit alongside, because those are the other
 * signals a subscription cannot purchase: an account opened three weeks ago
 * with forty followers is a different proposition from one opened in 2013,
 * whatever badge it is carrying.
 */
export default function XLink({ x }) {
  if (!x) return null

  const age = accountAgeDays(x.accountCreatedAt)
  const young = age !== null && age < 90

  return (
    <div className="x-link">
      <div className="x-link-head">
        {/*
         * A link to the account, so a reader can go and look at it - which is
         * the point of showing a handle at all. rel is the full set: an
         * account somebody else controls is untrusted content, and it does not
         * need to be told which profile sent the reader.
         */}
        <a
          className="x-link-handle font-mono"
          href={`https://x.com/${x.handle}`}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
        >
          <XLogo size={12} />@{x.handle}
        </a>

        <span
          className="x-link-proof"
          title="This PulseDex account signed in to X as this handle. Control is proven."
        >
          <ShieldCheck size={11} />
          Verified control
        </span>
      </div>

      <div className="x-link-signals font-mono">
        {x.verifiedType && (
          /*
           * Muted, and captioned "paid". Not a tick, not brand blue, nothing
           * that reads as identity verification at a glance - it is a
           * subscription, and the tooltip says so in as many words.
           */
          <span
            className="x-link-premium"
            title="X Premium is a paid subscription, not an identity check. Anyone can buy one."
          >
            {SUBSCRIPTION_LABEL[x.verifiedType] || 'X Premium'} · paid
          </span>
        )}

        {age !== null && (
          <span className={`x-link-stat ${young ? 'is-young' : ''}`}>
            {/* Flagged under three months, because a brand-new account wearing
                a project's name is the shape almost every impersonation takes. */}
            {formatAge(age)}
          </span>
        )}

        {x.followers !== null && (
          <span className="x-link-stat">{formatCompactCount(x.followers)} followers</span>
        )}

        {/* The numbers above were read once, when the link was made. Said
            plainly rather than letting them pass as live. */}
        {x.linkedAt && (
          <span className="x-link-asof" title={new Date(x.linkedAt).toLocaleString()}>
            as of linking
          </span>
        )}
      </div>
    </div>
  )
}

const SUBSCRIPTION_LABEL = {
  blue: 'X Premium',
  business: 'X Verified Organisation',
  government: 'X Government',
}

function formatAge(days) {
  if (days < 31) return `${days}d old`
  if (days < 365) return `${Math.floor(days / 30)}mo old`
  const years = Math.floor(days / 365)
  return `${years}y old`
}
