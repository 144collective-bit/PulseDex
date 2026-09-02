import { useEffect, useMemo } from 'react'
import { AreaSeries } from 'lightweight-charts'
import { usePairMarket, usePoolCandles } from '../../services/marketData'
import { ModuleEmpty } from '../../components/ModuleStates'
import { useChartSurface } from '../../components/useChartSurface'
import { formatCryptoPrice } from '../../../utils/formatters'

/**
 * Several markets at once.
 *
 * A watch wall rather than a chart: the point is peripheral vision across four
 * or six pairs, not detail on any one of them. So each tile is an area line
 * with no axes, no crosshair and no interaction - at this size a full candle
 * chart with two price scales is unreadable, and the furniture would take more
 * room than the data.
 */

const UP = '#00ff9d'
const DOWN = '#f43f5e'

/**
 * One tile.
 *
 * A component per pair rather than a loop, because each needs its own market
 * lookup, its own candles and its own chart instance - and hooks cannot be
 * called in a loop whose length changes when the user adds a pair.
 */
function ChartTile({ pair, interval }) {
  const { data: market, isFetching: loadingMarket } = usePairMarket(pair)
  const poolAddress = market?.pairAddress
  const { data: candles, isFetching, isError } = usePoolCandles(poolAddress, interval)

  /* Green or red for the window on screen, which is what the tile is showing -
     not the venue's 24-hour figure, which would disagree with the line. */
  const rising = useMemo(() => {
    if (!candles?.length) return true
    return candles[candles.length - 1].close >= candles[0].close
  }, [candles])

  const colour = rising ? UP : DOWN

  const { containerRef, chart, series } = useChartSurface({
    seriesType: AreaSeries,
    seriesOptions: {
      lineColor: colour,
      topColor: rising ? 'rgba(0,255,157,0.22)' : 'rgba(244,63,94,0.22)',
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    chartOptions: {
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    },
    // The series colour is fixed at creation, so a pair that flips direction
    // needs the surface rebuilt rather than merely refed.
    rebuildKey: colour,
  })

  useEffect(() => {
    if (!series || !candles?.length) return
    series.setData(candles.map((c) => ({ time: c.time, value: c.close })))
    chart?.timeScale().fitContent()
  }, [series, chart, candles])

  const change = Number(market?.priceChange?.h24 ?? 0)

  return (
    <article className="dash-tile">
      <header className="dash-tile-head">
        <span className="dash-tile-pair">{pair?.label ?? '—'}</span>
        <span className={change >= 0 ? 'is-up' : 'is-down'}>
          {change >= 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      </header>
      <span className="dash-tile-price">
        {market ? formatCryptoPrice(Number(market.priceUsd ?? 0)) : '—'}
      </span>
      {/* An empty chart box and a chart whose data failed look identical, so a
          tile with nothing to draw says which it is. */}
      <div className="dash-tile-surface">
        <div className="dash-tile-chart" ref={containerRef} />
        {!candles?.length ? (
          <span className="dash-tile-empty">
            {isError
              ? 'Rate limited'
              : isFetching || loadingMarket
                ? 'Loading'
                : !poolAddress
                  ? 'No pool'
                  : 'No history'}
          </span>
        ) : null}
      </div>
    </article>
  )
}

export default function MultiChart({ config }) {
  const pairs = useMemo(
    () => (Array.isArray(config.pairs) ? config.pairs.filter(Boolean) : []),
    [config.pairs],
  )

  if (pairs.length === 0) {
    return (
      <ModuleEmpty
        label="No pairs chosen"
        hint="Add the markets you want to watch in this module's settings."
      />
    )
  }

  return (
    <div className="dash-tiles" style={{ '--dash-tile-cols': pairs.length <= 2 ? 1 : 2 }}>
      {pairs.map((pair, index) => (
        <ChartTile
          // Pairs are values rather than entities and two tiles may legitimately
          // show the same market, so position is the only stable identity.
          // eslint-disable-next-line react/no-array-index-key
          key={`${pair?.label ?? 'pair'}-${index}`}
          pair={pair}
          interval={config.timeframe ?? '1h'}
        />
      ))}
    </div>
  )
}
