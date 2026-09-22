import { useEffect, useState } from 'react'
import DevBadge from './DevBadge'
import { fetchClaimsBy } from '../../services/claims'
import { formatAddress } from '../../utils/formatters'

/**
 * The tokens this account has claimed, on their profile.
 *
 * Listed rather than counted, and that is the whole design of this component.
 * "Deployer of 4 tokens" reads as a credential - four launches nobody has
 * heard of is not one, and a number invites exactly the reading the badge
 * spends so much effort avoiding. Addresses are addresses; a reader can look
 * at them and decide what they mean.
 *
 * Absent entirely when there is nothing, rather than an empty section saying
 * so. Most accounts have never deployed anything, and a profile that says
 * "Claimed tokens: none" on every page is a profile implying that claiming
 * one is a thing people ought to have done.
 */
export default function ClaimedTokens({ address, onOpenToken }) {
  const [claims, setClaims] = useState([])

  useEffect(() => {
    if (!address) return undefined

    let active = true
    fetchClaimsBy(address)
      .then((found) => {
        if (active) setClaims(found)
      })
      .catch(() => {
        // Nothing shown. This is a statement the site makes about somebody,
        // and the safe answer when it cannot be checked is to say nothing.
        if (active) setClaims([])
      })

    return () => {
      active = false
    }
  }, [address])

  if (claims.length === 0) return null

  return (
    <section className="xp-claims">
      <DevBadge size="full" />

      <ul className="xp-claim-list">
        {claims.map((claim) => (
          <li key={claim.token}>
            {/*
              A link only where there is somewhere to go. This header also
              renders inside the social section, which has no route to a
              token page - and a button that does nothing when pressed is
              worse than a label, because a label never promised anything.
            */}
            {onOpenToken ? (
              <button
                type="button"
                className="xp-claim font-mono"
                onClick={() => onOpenToken(claim.token)}
                title={claim.token}
              >
                {formatAddress(claim.token)}
              </button>
            ) : (
              <span className="xp-claim font-mono" title={claim.token}>
                {formatAddress(claim.token)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
