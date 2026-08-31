import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPoolCandles } from '../services/geckoterminal'
import Sparkline from './Sparkline'

/**
 * Points needed before a line is worth drawing.
 *
 * Not a rounding-up of "more is better": eHEX resolves to a pool holding
 * $995K of parked liquidity and one sell a day, and the API returned four
 * prints for its last 24 hours. Those four ran from 0.00052 to 0.00168, so the
 * card drew a confident 220% rally for a token with $0.18 of volume. A handful
 * of prints is not a trend and should not be drawn as one.
 */
const MIN_POINTS = 8

/**
 * A live price line for one token, fetched from the chart API.
 *
 * The drawing itself is Sparkline's job; what lives here is the fetching and
 * the two guards that decide whether the series deserves to be drawn at all.
 *
 * `tokenAddress` matters more than it looks: the series comes back in the
 * pool's own orientation, and for a token that sits on the quote side that is
 * the wrong one - see the note in getPoolCandles.
 */
export default function TokenSparkline({
  poolAddress,
  tokenAddress,
  interval = '1h',
  variant = 'inline',
  tone = 'accent',
  showDot = true,
  className = '',
  label,
}) {
  /*
   * Refreshed every five minutes, not every one.
   *
   * This is a line across a whole day; the last five minutes of it are a
   * pixel. The reason to be careful is the shared budget: the pair charts read
   * the same unauthenticated API, which throttles by address, and when it
   * throttles it answers by dropping its CORS header rather than returning a
   * status - so one page fetching too eagerly takes the charts down with it,
   * with nothing in the response to say why.
   */
  const { data: candles } = useQuery({
    queryKey: ['sparkline', poolAddress?.toLowerCase(), tokenAddress?.toLowerCase(), interval],
    queryFn: () => getPoolCandles(poolAddress, interval, { tokenAddress }),
    enabled: Boolean(poolAddress),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    // A refetch on every tab return would undo the rate above.
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const values = useMemo(() => {
    const usable = (candles || []).filter((c) => Number.isFinite(c.close) && c.close > 0)
    if (usable.length < MIN_POINTS) return null

    /*
     * A window with no volume in it has no prices, only quotes.
     *
     * The dead pools carry a price the whole time and trade none of it, and a
     * line drawn from that says a market moved when nothing changed hands.
     * Summed across the window, not per candle - a quiet hour inside an active
     * day is ordinary.
     */
    const traded = usable.reduce((sum, c) => sum + (c.volume || 0), 0)
    if (traded <= 0) return null

    return usable.map((c) => c.close)
  }, [candles])

  return (
    <Sparkline
      values={values}
      tone={tone}
      variant={variant}
      showDot={showDot}
      className={className}
      label={label}
      minPoints={MIN_POINTS}
    />
  )
}
