import { useState } from 'react'
import {
  ipfsCandidates,
  getResolvedImage,
  rememberResolvedImage,
  avatarAccent,
} from '../utils/tokenImage'
import { safeExternalUrl } from '../utils/formatters'

/**
 * Token avatar for the trenches board.
 *
 * Deliberately not TokenLogo: that component falls back to a curated logo map
 * keyed by *symbol*, which is unsafe here. Launchpad tokens routinely reuse the
 * ticker of a major asset, so a memecoin called HEX would borrow the real HEX
 * logo and misrepresent itself. Every source below is bound to the token's own
 * CID or contract address, never its symbol.
 *
 * Sources are tried in order and the working one is cached per CID, so a logo
 * that has rendered once stays rendered across polls, remounts and tab changes.
 */
export default function TrenchTokenLogo({
  cid,
  address = '',
  symbol = '?',
  fallbackUrl = null,
  size = 40,
  className = '',
  // Rows that start on screen load immediately; the long tail below the fold
  // stays lazy so an infinitely scrolled column doesn't fetch hundreds of
  // avatars at once. A logo is the row's identity, so a blank circle at the top
  // of a fast-moving board is worse than the handful of extra requests.
  eager = false,
}) {
  // Ordered candidates: a URL already known to work, then each IPFS gateway,
  // then the address-keyed DEX image for tokens that have graduated.
  const candidates = []
  const cached = getResolvedImage(cid)
  if (cached) candidates.push(cached)
  ipfsCandidates(cid).forEach((url) => {
    if (!candidates.includes(url)) candidates.push(url)
  })
  const dexImage = safeExternalUrl(fallbackUrl)
  if (dexImage && !candidates.includes(dexImage)) candidates.push(dexImage)

  // Attempt state is stamped with the address it belongs to. Comparing during
  // render resets the chain when a row is reused for a different token, without
  // an effect that would fire a second render pass.
  const [attempt, setAttempt] = useState({ address, index: 0 })
  const index = attempt.address === address ? attempt.index : 0
  const currentSrc = candidates[index] || null

  const handleError = () => {
    setAttempt({ address, index: index + 1 })
  }

  const handleLoad = () => {
    if (currentSrc) rememberResolvedImage(cid, currentSrc)
  }

  const dimensions = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    borderRadius: '50%',
    flexShrink: 0,
  }

  if (currentSrc) {
    return (
      <img
        src={currentSrc}
        alt={`${symbol} logo`}
        className={`token-logo-img ${className}`}
        style={{
          ...dimensions,
          objectFit: 'cover',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'block',
          background: 'rgba(255, 255, 255, 0.04)',
        }}
        onError={handleError}
        onLoad={handleLoad}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'low'}
        decoding="async"
      />
    )
  }

  // Every source failed (or the token has no art) — fall back to initials on a
  // gradient seeded by the address, so the placeholder is stable per token.
  const initials = (symbol || '?').toUpperCase().trim().slice(0, 3)
  const accent = avatarAccent(address || symbol)

  return (
    <div
      aria-hidden="true"
      className={`token-logo-fallback ${className}`}
      style={{
        ...dimensions,
        // Tinted glass rather than a solid disc, so a token without artwork
        // sits alongside real logos instead of shouting over them.
        background: `radial-gradient(circle at 30% 25%, ${accent}26, ${accent}0d 70%), #0d131e`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: accent,
        fontWeight: 800,
        fontSize: `${Math.max(9, Math.floor(size * 0.34))}px`,
        letterSpacing: '-0.02em',
        border: `1px solid ${accent}47`,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
