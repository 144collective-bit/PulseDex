import { BadgeCheck } from 'lucide-react'

/**
 * The dev badge.
 *
 * This component is a scam vector and is written as one. Get the wording
 * wrong and this site's credibility is lending itself to whoever claimed a
 * token last - which, sooner or later, will be somebody about to rug it.
 *
 * So it says exactly what was proved and not one word more. What was proved
 * is that this account signed from the wallet that sent the token's creation
 * transaction. That is all. It is not "verified", it is not "official", it is
 * not "the team", and it is not a safety signal. The deploying wallet is
 * sometimes a factory, sometimes a burner, sometimes a contractor paid in
 * stablecoins who has never spoken to the people running the project.
 *
 * Three rules this file exists to hold:
 *
 *   - The label never stands alone. "DEV" on its own reads as a status, so
 *     the title spells out the claim in a sentence, and the badge is never
 *     rendered without it.
 *   - It never carries the word "verified" or "official". Both are read as
 *     endorsements by everybody who is not reading carefully, which is
 *     everybody.
 *   - It is visually quieter than the brand's own accents. A badge that
 *     glows is a badge that recommends.
 *
 * If a future change makes this louder or shorter, it is making a claim the
 * data does not support.
 */

/** Said in full wherever there is room, and in the tooltip where there is
 *  not. The one sentence this badge is allowed to mean. */
export const DEV_CLAIM_SENTENCE =
  'Controls the wallet that sent this token’s creation transaction. Not a safety check, and not an endorsement.'

export default function DevBadge({ size = 'inline' }) {
  return (
    <span
      className={`dev-badge ${size === 'full' ? 'is-full' : ''}`}
      title={DEV_CLAIM_SENTENCE}
    >
      <BadgeCheck size={11} aria-hidden="true" />
      {/*
        "Deployer", not "dev". A dev is a person and a role; a deployer is
        whoever sent one transaction, which is the only thing established
        here. The extra two letters are the difference between describing an
        address and describing a person.
      */}
      <span className="dev-badge-label">Deployer</span>

      {/*
        Spelled out where the layout allows it, because a tooltip is not read
        on a phone and is not read by anybody in a hurry - which is the
        person this wording is for.
      */}
      {size === 'full' && <span className="dev-badge-note">{DEV_CLAIM_SENTENCE}</span>}

      {/* For a screen reader the tooltip does not exist, so the sentence is
          always present and always the full one. */}
      <span className="sr-only">{DEV_CLAIM_SENTENCE}</span>
    </span>
  )
}
