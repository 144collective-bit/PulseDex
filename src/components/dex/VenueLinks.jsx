import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { venueForDexId } from '../../config/venues'
import { formatUsd } from '../../utils/formatters'

/**
 * Turnover for the card's second line.
 *
 * formatUsd carries four decimals below a dollar, which is right for a token
 * price and wrong for a volume figure - a near-dead pool was reading as
 * "$0.0400 24h vol". Under a dollar the exact figure tells you nothing the
 * threshold doesn't.
 */
function volumeLabel(volume) {
  if (!volume) return 'no 24h volume'
  if (volume < 1) return '< $1 24h vol'
  return `${formatUsd(volume, 1)} 24h vol`
}

/**
 * Hand-off cards to the venues that actually hold liquidity for this token.
 *
 * A venue only earns a card if it has a pool for the token on screen, so every
 * card leads somewhere real and the count varies by token - a major asset
 * shows several, an obscure one shows PulseX alone. Each card carries the
 * venue's own mark, because the mark is what tells you where the click goes.
 */
export default function VenueLinks({ pairs = [] }) {
  const venues = useMemo(() => {
    const byVenue = new Map()

    for (const pair of pairs) {
      const venue = venueForDexId(pair?.dexId)
      if (!venue) continue

      const liquidity = parseFloat(pair.liquidity?.usd || 0)
      const held = byVenue.get(venue.id)
      // Deepest pool wins: it is the one worth sending a trade to, and its
      // symbols are the pair the user will actually land on.
      if (held && held.liquidity >= liquidity) continue

      byVenue.set(venue.id, {
        venue,
        pair,
        liquidity,
        volume: parseFloat(pair.volume?.h24 || 0),
      })
    }

    return [...byVenue.values()].sort((a, b) => b.liquidity - a.liquidity)
  }, [pairs])

  if (!venues.length) return null

  return (
    <div className="venue-links">
      {venues.map(({ venue, pair, liquidity, volume }) => {
        const baseSym = pair.baseToken?.symbol || '?'
        const quoteSym = pair.quoteToken?.symbol || '?'

        return (
          <a
            key={venue.id}
            href={venue.url(pair.baseToken?.address, pair.quoteToken?.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="venue-card"
          >
            <span className="venue-mark">
              {venue.logo ? (
                <img src={venue.logo} alt="" loading="lazy" />
              ) : (
                <span className="venue-mark-letter">{venue.name.charAt(0)}</span>
              )}
            </span>

            <span className="venue-body">
              <span className="venue-title">
                Trade {baseSym}/{quoteSym} on {venue.name}
              </span>
              <span className="venue-meta">
                <span className="venue-liq">{formatUsd(liquidity, 1)} liquidity</span>
                <span className="venue-dot" aria-hidden="true">·</span>
                {/* Venues that price per pool have no single rate to quote, so
                    they show turnover instead of a fee that would be wrong on
                    half their pairs. */}
                <span>{venue.feeLabel || volumeLabel(volume)}</span>
              </span>
            </span>

            <ExternalLink size={14} className="venue-ext" />
          </a>
        )
      })}
    </div>
  )
}
