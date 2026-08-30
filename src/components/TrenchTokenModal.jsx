import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  AreaSeries,
} from 'lightweight-charts'
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Rocket,
  Lock,
  Flame,
  Globe,
  Send,
  Filter,
  Maximize2,
} from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'
import TokenInsights from './TokenInsights'
import {
  useTokenCandles,
  useTokenTransactions,
  useTokenDetail,
} from '../hooks/usePumpTires'
import { plsToUsd, ipfsImageUrl } from '../services/pumptires'
import { CANDLE_INTERVALS, TOKENS_FOR_SALE } from '../config/pumptires'
import {
  formatUsd,
  formatCryptoPrice,
  formatCompactCount,
  formatTimeAgo,
  formatAddress,
  formatPercent,
  safeExternalUrl,
} from '../utils/formatters'

/**
 * Render a PLS-denominated curve price without collapsing micro values to zero.
 * The chart library's default formatter rounds these to 0.00.
 */
function formatPlsAxis(value) {
  const num = Number(value)
  if (!isFinite(num) || num === 0) return '0'
  if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (num >= 1) return num.toFixed(3)
  if (num >= 0.001) return num.toFixed(5)
  if (num >= 0.000001) return num.toFixed(8)
  return num.toExponential(2)
}

/** USD floor for the whale filter and the top size band. */
const WHALE_FLOOR = 250

/** Size band for a trade, used for colour weight and the row wash. */
function sizeBand(usd) {
  if (usd >= 250) return 'whale'
  if (usd >= 50) return 'lg'
  if (usd >= 10) return 'md'
  return 'sm'
}

/**
 * How far the row wash extends. Capped so a single outlier doesn't flood every
 * row; $500 is treated as full width.
 */
function washWidth(usd) {
  const pct = (Math.max(0, usd) / 500) * 100
  return Math.max(6, Math.min(100, pct))
}

/** One labelled figure in the stat grid. */
function Stat({ label, value, tone = '' }) {
  return (
    <div className="tm-stat">
      <span className="tm-stat-label font-mono">{label}</span>
      <span className={`tm-stat-val font-mono ${tone}`}>{value}</span>
    </div>
  )
}

/** A signed percentage chip, or a muted dash when the window has no data. */
function ChangeChip({ label, value }) {
  const text = formatPercent(value)
  const tone = text === null ? 'is-flat' : value >= 0 ? 'is-up' : 'is-down'
  return (
    <div className={`tm-chip ${tone}`}>
      <span className="tm-chip-label font-mono">{label}</span>
      <span className="tm-chip-val font-mono">{text || '—'}</span>
    </div>
  )
}

/**
 * Token detail terminal: curve chart, order-flow pressure, live trades and
 * holder distribution.
 *
 * Candles are quoted in PLS, which is the unit the curve actually prices in.
 * They are deliberately not converted to USD - that would mean applying today's
 * PLS rate to historical bars and misstating past prices.
 */
export default function TrenchTokenModal({
  token,
  plsPrice,
  onClose,
  onOpenFullPage,
  // 'modal' floats over the board; 'page' is the same body rendered inline at
  // /token/<address>. Only the chrome differs.
  variant = 'modal',
}) {
  const [candleInterval, setCandleInterval] = useState(300)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('trades')
  // Candles read poorly on a curve with few trades - long flat runs broken by
  // one huge bar - so the view can be switched to a filled line instead.
  const [chartMode, setChartMode] = useState('candles')
  // Whale filter: hides everything under a USD floor so the tape shows size.
  const [whaleOnly, setWhaleOnly] = useState(false)

  const chartRef = useRef(null)
  const containerRef = useRef(null)

  const address = token?.address
  const { data: candles, isLoading: candlesLoading } = useTokenCandles(address, candleInterval)
  const { data: txnData } = useTokenTransactions(address, 60)
  const { data: detail } = useTokenDetail(address)

  const allTrades = txnData?.transactions || []
  const trades = whaleOnly
    ? allTrades.filter((t) => (t.usdValue || 0) >= WHALE_FLOOR)
    : allTrades
  const holders = detail?.holders || []

  // Detail figures win once loaded; the board row keeps the panel populated
  // from the instant it opens.
  const live = detail?.address ? { ...token, ...detail } : token

  // Close on Escape, and stop the page behind from scrolling.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // Build the chart once per mount; data updates go through setData below.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
        // Volume lives in its own pane, so the price scale is never asked to
        // reserve room for it - that reservation was pushing the price axis
        // below zero and printing values like -2.00e-1.
        panes: { separatorColor: 'rgba(255,255,255,0.08)', separatorHoverColor: 'rgba(0,229,255,0.2)' },
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        /*
         * Bars are given a real width instead of being fitted to the container.
         * Fitting 200 candles into ~1180px left 5.9px per bar - a hairline once
         * the border and wick are drawn, which is what made the chart look
         * cheap next to the screener's embed. The most recent stretch is shown
         * at a readable width and the rest is reachable by scrolling.
         */
        barSpacing: 11,
        minBarSpacing: 4,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: 3, labelBackgroundColor: '#00e5ff' },
        horzLine: { color: 'rgba(0,229,255,0.4)', width: 1, style: 3, labelBackgroundColor: '#00e5ff' },
      },
      localization: { priceFormatter: formatPlsAxis },
    })

    const priceFormat = {
      type: 'custom',
      formatter: formatPlsAxis,
      minMove: 0.0000000001,
    }

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff9d',
      downColor: '#f43f5e',
      // No border: at these widths a 1px border eats most of the body and the
      // candle reads as an outline rather than a filled bar.
      borderVisible: false,
      wickUpColor: 'rgba(0,255,157,0.8)',
      wickDownColor: 'rgba(244,63,94,0.8)',
      priceFormat,
    })

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#00e5ff',
      lineWidth: 2,
      topColor: 'rgba(0,229,255,0.28)',
      bottomColor: 'rgba(0,229,255,0.01)',
      priceFormat,
      visible: false,
    })

    // Pane 1 keeps volume off the price axis entirely.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceScaleId: '' },
      1
    )

    chart.panes()[1]?.setHeight(70)

    chartRef.current = { chart, candleSeries, areaSeries, volumeSeries }

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // Swap between candles and the filled line without rebuilding the chart.
  useEffect(() => {
    const refs = chartRef.current
    if (!refs) return
    refs.candleSeries.applyOptions({ visible: chartMode === 'candles' })
    refs.areaSeries.applyOptions({ visible: chartMode === 'line' })
  }, [chartMode])

  // Push data whenever candles or the selected interval change.
  useEffect(() => {
    const refs = chartRef.current
    if (!refs || !candles) return

    refs.candleSeries.setData(
      candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    )

    refs.areaSeries.setData(
      candles.map((c) => ({ time: c.time, value: c.close }))
    )

    refs.volumeSeries.setData(
      candles.map((c) => ({
        time: c.time,
        value: c.buyVolume + c.sellVolume,
        color: c.close >= c.open ? 'rgba(0,255,157,0.4)' : 'rgba(244,63,94,0.4)',
      }))
    )

    // Deliberately not fitContent(): that overrides barSpacing and squeezes
    // every candle back to a hairline. Land on the most recent bars instead.
    refs.chart.timeScale().scrollToRealTime()
  }, [candles])

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (insecure context or denied permission) - the address
      // is still readable in the header.
    }
  }

  // Same asset as the mark, reused as the hero backdrop.
  const heroUrl = ipfsImageUrl(live?.imageCid)

  /*
   * A graduated token has a real PulseX pair, so it can use DexScreener's own
   * chart - the same embed the screener tab uses. A token still on the curve
   * has no pair to embed (pair_address is null until it launches), so it keeps
   * the native chart, which is also the only one that can show curve context.
   */
  const embedPair = live?.isLaunched ? live?.pairAddress : null
  const embedUrl = embedPair
    ? `https://dexscreener.com/pulsechain/${embedPair}?embed=1&theme=dark&trades=0&info=0`
    : null

  const marketCapUsd = plsToUsd(live?.marketValuePls, plsPrice)
  const priceUsd = plsToUsd(live?.pricePls, plsPrice)
  const progress = live?.bondingProgress || 0
  const remaining = Math.max(0, TOKENS_FOR_SALE - (live?.tokensSold || 0))

  // Distance from the extremes, which is the context a curve price needs.
  const price = live?.pricePls || 0
  const fromAth = live?.priceAth > 0 ? ((price - live.priceAth) / live.priceAth) * 100 : null
  const fromAtl = live?.priceAtl > 0 ? ((price - live.priceAtl) / live.priceAtl) * 100 : null

  // Order flow across the loaded candle window.
  const flow = (candles || []).reduce(
    (acc, c) => ({ buy: acc.buy + c.buyVolume, sell: acc.sell + c.sellVolume }),
    { buy: 0, sell: 0 }
  )
  const flowTotal = flow.buy + flow.sell
  const buyShare = flowTotal > 0 ? (flow.buy / flowTotal) * 100 : 50

  // Only windows the feed actually reports. Curve tokens carry a 5-minute
  // change; the longer windows arrive with a graduated token's DEX pair.
  const changeWindows = [
    { label: '5M', value: live?.change5m },
    { label: '1H', value: live?.change1h },
    { label: '6H', value: live?.change6h },
    { label: '24H', value: live?.change24h },
  ].filter((w) => w.value !== null && w.value !== undefined)

  // Position of the current price within its lifetime range.
  const span = (live?.priceAth || 0) - (live?.priceAtl || 0)
  const rangePos =
    span > 0
      ? Math.min(100, Math.max(0, ((price - live.priceAtl) / span) * 100))
      : null

  // Concentration is quoted against total supply, not against the balances the
  // API happens to return - dividing by the returned set makes the top holders
  // look like 100% of the token no matter how much supply sits elsewhere.
  const holdersSum = holders.reduce((sum, h) => sum + h.balance, 0)
  const supplyBase = live?.totalSupply > 0 ? live.totalSupply : holdersSum
  const top10Share = supplyBase
    ? (holders.slice(0, 10).reduce((s, h) => s + h.balance, 0) / supplyBase) * 100
    : 0

  if (!token) return null

  const isPage = variant === 'page'

  const body = (
    <div
      className={`trench-modal ${isPage ? 'is-page' : ''}`}
      onClick={(e) => e.stopPropagation()}
      role={isPage ? 'region' : 'dialog'}
      aria-modal={isPage ? undefined : 'true'}
      aria-label={`${live.name} detail`}
    >
        {/*
          Hero. The launchpad publishes no banner artwork - there is no cover,
          header or background field anywhere in its payload - so the backdrop
          is derived from the token's own mark: the same image, blown up,
          blurred and dimmed behind a gradient. It is per-token and real rather
          than a stock texture, and swaps for a true banner the day the API
          carries one.
        */}
        <div className="tm-hero">
          {live.imageCid && (
            <div
              className="tm-hero-art"
              style={{ backgroundImage: `url(${heroUrl})` }}
              aria-hidden="true"
            />
          )}
          <div className="tm-hero-veil" aria-hidden="true" />
        </div>

        {/* ---------------- Header ---------------- */}
        <header className="tm-head">
          <span className="tm-head-logo">
            <TrenchTokenLogo
              cid={live.imageCid}
              address={live.address}
              symbol={live.symbol}
              size={72}
              eager
            />
          </span>

          <div className="tm-ident">
            <div className="tm-ident-top">
              <h2 className="tm-symbol font-mono">{live.symbol}</h2>
              <span className="tm-name truncate">{live.name}</span>
              {live.isLaunched ? (
                <span className="tm-badge is-grad font-mono">
                  <Rocket size={9} /> GRADUATED
                </span>
              ) : (
                <span className="tm-badge is-curve font-mono">
                  <Flame size={9} /> ON CURVE
                </span>
              )}
              {live.lockedLp && (
                <span className="tm-badge is-lock font-mono">
                  <Lock size={9} /> LP LOCKED
                </span>
              )}
            </div>

            <div className="tm-ident-foot">
              <button
                type="button"
                className="tm-address font-mono"
                onClick={copyAddress}
                title="Copy contract address"
              >
                {formatAddress(live.address, 6, 6)}
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>

              {/* Only rendered when the deployer actually supplied a link. */}
              {live.website && (
                <a className="tm-social" href={safeExternalUrl(live.website) || '#'} target="_blank" rel="noopener noreferrer" title="Website">
                  <Globe size={13} />
                </a>
              )}
              {live.twitter && (
                <a className="tm-social" href={safeExternalUrl(live.twitter) || '#'} target="_blank" rel="noopener noreferrer" title="X / Twitter">
                  <ExternalLink size={13} />
                </a>
              )}
              {live.telegram && (
                <a className="tm-social" href={safeExternalUrl(live.telegram) || '#'} target="_blank" rel="noopener noreferrer" title="Telegram">
                  <Send size={13} />
                </a>
              )}
            </div>
          </div>

          <div className="tm-price-block font-mono">
            <span className="tm-price">{formatCryptoPrice(priceUsd)}</span>
            <span className="tm-price-pls">{formatPlsAxis(price)} PLS</span>
          </div>

          {!isPage && (
            <button
              type="button"
              className="tm-close"
              onClick={onClose}
              aria-label="Close detail"
            >
              <X size={15} />
            </button>
          )}
        </header>

        {live.description && (
          <p className="tm-description">{live.description}</p>
        )}

        {/* ---------------- Change windows + lifetime range ---------------- */}
        {changeWindows.length > 0 && (
          <div className="tm-chips">
            {changeWindows.map((w) => (
              <ChangeChip key={w.label} label={w.label} value={w.value} />
            ))}
          </div>
        )}

        {/* Where the current print sits between its all-time low and high. The
            curve only publishes a 5-minute change, so for most tokens this is
            the only momentum context that exists. */}
        {rangePos !== null && (
          <div className="tm-range">
            <span className="tm-range-cap font-mono">ATL</span>
            <span className="tm-range-track">
              <span className="tm-range-fill" style={{ width: `${rangePos}%` }} />
              <span className="tm-range-marker" style={{ left: `${rangePos}%` }} />
            </span>
            <span className="tm-range-cap font-mono">ATH</span>
          </div>
        )}

        {/* ---------------- Stat grid ---------------- */}
        <div className="tm-stats">
          <Stat label="MKT CAP" value={formatUsd(marketCapUsd)} />
          <Stat label="VOLUME" value={formatUsd(live.volumeUsd)} />
          {live.isLaunched && live.liquidityUsd > 0 && (
            <Stat label="LIQUIDITY" value={formatUsd(live.liquidityUsd)} />
          )}
          <Stat
            label="FROM ATH"
            value={formatPercent(fromAth) || '—'}
            tone={fromAth !== null && fromAth < 0 ? 'is-down' : ''}
          />
          <Stat
            label="FROM ATL"
            value={formatPercent(fromAtl) || '—'}
            tone={fromAtl !== null && fromAtl > 0 ? 'is-up' : ''}
          />
          <Stat label="HOLDERS" value={holders.length ? holders.length.toLocaleString() : '—'} />
          <Stat
            label={live.isLaunched ? 'LAUNCHED' : 'CREATED'}
            value={formatTimeAgo(live.isLaunched ? live.launchedAt : live.createdAt)}
          />
        </div>

        {/* ---------------- Bonding progress ---------------- */}
        {!live.isLaunched && (
          <div className="tm-bond">
            <div className="tm-bond-head font-mono">
              <span className="tm-bond-title">BONDING CURVE</span>
              <span className="tm-bond-pct">{progress.toFixed(2)}%</span>
            </div>
            <div className="tm-bond-track">
              <div className="tm-bond-fill" style={{ width: `${Math.max(1, progress)}%` }} />
            </div>
            <div className="tm-bond-foot font-mono">
              <span>{formatCompactCount(live.tokensSold)} sold</span>
              <span>{formatCompactCount(remaining)} left to graduate</span>
            </div>
          </div>
        )}

        {/* ---------------- Chart ---------------- */}
        <div className="tm-chart-block">
          {!embedUrl && (
          <div className="tm-chart-bar font-mono">
            <div
              className="tm-flow"
              title={`Buy ${formatCompactCount(flow.buy)} / Sell ${formatCompactCount(flow.sell)} PLS`}
            >
              <span className="tm-flow-label">FLOW</span>
              <span className="tm-flow-track">
                <span className="tm-flow-buy" style={{ width: `${buyShare}%` }} />
              </span>
              <span className="tm-flow-pct">{buyShare.toFixed(0)}% buy</span>
            </div>

            <div className="tm-chart-controls">
              <div className="tm-mode-toggle">
                <button
                  type="button"
                  className={`tm-mode ${chartMode === 'candles' ? 'active' : ''}`}
                  onClick={() => setChartMode('candles')}
                  title="Candlesticks"
                >
                  Candles
                </button>
                <button
                  type="button"
                  className={`tm-mode ${chartMode === 'line' ? 'active' : ''}`}
                  onClick={() => setChartMode('line')}
                  title="Filled line - reads better on thin trading"
                >
                  Line
                </button>
              </div>

            <div className="tm-intervals">
              {CANDLE_INTERVALS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`tm-interval ${candleInterval === opt.value ? 'active' : ''}`}
                  onClick={() => setCandleInterval(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            </div>
          </div>
          )}

          {embedUrl ? (
            <iframe
              /* Matches the screener's working embed: keyed so a token change
                 remounts it, eager because a lazy iframe below the fold never
                 initialises reliably, and the same allow-list. */
              key={embedPair}
              src={embedUrl}
              title={`${live.symbol} chart on DexScreener`}
              className="tm-chart-embed"
              allow="clipboard-write"
              loading="eager"
            />
          ) : (
            <>
              <div className="tm-chart" ref={containerRef} />

              {candlesLoading && !candles?.length && (
                <div className="tm-chart-state font-mono">Loading candles…</div>
              )}
              {!candlesLoading && candles?.length === 0 && (
                <div className="tm-chart-state font-mono">No trades on this interval yet</div>
              )}
            </>
          )}
        </div>

        {/* ---------------- Trades / holders ---------------- */}
        <div className="tm-lower">
          <div className="tm-tabs font-mono">
            <button
              type="button"
              className={`tm-tab ${tab === 'trades' ? 'active' : ''}`}
              onClick={() => setTab('trades')}
            >
              TRADES{txnData?.total ? ` (${formatCompactCount(txnData.total)})` : ''}
            </button>
            <button
              type="button"
              className={`tm-tab ${tab === 'holders' ? 'active' : ''}`}
              onClick={() => setTab('holders')}
            >
              HOLDERS{holders.length ? ` (${holders.length})` : ''}
            </button>
            {tab === 'trades' && (
              <button
                type="button"
                className={`tm-whale ${whaleOnly ? 'active' : ''}`}
                onClick={() => setWhaleOnly((v) => !v)}
                title={`Show only trades of $${WHALE_FLOOR} or more`}
              >
                <Filter size={12} />
                Whales
              </button>
            )}

            {tab === 'holders' && supplyBase > 0 && (
              <span className="tm-tab-note font-mono">
                top 10 hold {top10Share.toFixed(1)}% of supply
              </span>
            )}
          </div>

          {tab === 'trades' && (
            <div className="tm-table-labels font-mono is-trades" aria-hidden="true">
              <span>SIDE</span>
              <span className="tcl-right">VALUE</span>
              <span className="tcl-right">TOKENS</span>
              <span className="tcl-right">PLS</span>
              <span>MAKER</span>
              <span className="tcl-right">AGE</span>
            </div>
          )}
          {tab === 'holders' && (
            <div className="tm-table-labels font-mono is-holders" aria-hidden="true">
              <span>#</span>
              <span>HOLDER</span>
              <span className="tcl-right">BALANCE</span>
              <span className="tcl-right">SHARE</span>
            </div>
          )}

          <div className="tm-table-scroll">
            {tab === 'trades' &&
              trades.map((t) => (
                <div
                  key={t.id || t.txHash}
                  className={`tm-trade font-mono ${t.type === 'buy' ? 'is-buy' : 'is-sell'} size-${sizeBand(t.usdValue)}`}
                >
                  {/* Translucent wash across the whole row, so side reads before
                      any number does. Width tracks trade size. */}
                  <span
                    className="tm-trade-wash"
                    style={{ width: `${washWidth(t.usdValue)}%` }}
                    aria-hidden="true"
                  />
                  <span className="tm-trade-side">{t.type.toUpperCase()}</span>
                  <span className="tcl-right tm-trade-usd">{formatUsd(t.usdValue)}</span>
                  <span className="tcl-right tm-trade-fig">{formatCompactCount(t.tokenAmount)}</span>
                  <span className="tcl-right tm-trade-fig">{formatCompactCount(t.plsAmount)}</span>
                  <span className="tm-trade-maker truncate">
                    {t.username || formatAddress(t.userAddress)}
                  </span>
                  <span className="tcl-right tm-trade-age">{formatTimeAgo(t.timestamp)}</span>
                </div>
              ))}

            {tab === 'trades' && !trades.length && (
              <div className="trench-panel-state font-mono">
                <span>
                  {whaleOnly
                    ? `No trades of $${WHALE_FLOOR} or more in this window`
                    : 'No trades yet'}
                </span>
              </div>
            )}

            {tab === 'holders' &&
              holders.slice(0, 60).map((h, i) => {
                const share = supplyBase > 0 ? (h.balance / supplyBase) * 100 : 0
                return (
                  <div key={h.address} className="tm-holder font-mono">
                    <span className="tm-holder-rank">{i + 1}</span>
                    <span className="truncate">
                      {h.username || formatAddress(h.address, 6, 4)}
                    </span>
                    <span className="tcl-right tm-dim">{formatCompactCount(h.balance)}</span>
                    <span className="tcl-right tm-holder-share">
                      <span
                        className="tm-holder-bar"
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                      {share.toFixed(2)}%
                    </span>
                  </div>
                )
              })}

            {tab === 'holders' && !holders.length && (
              <div className="trench-panel-state font-mono">
                <span>Holder data unavailable</span>
              </div>
            )}
          </div>
        </div>

        {/* ---------------- Dashboard ---------------- */}
        <TokenInsights token={live} holders={holders} trades={allTrades} />

        {/* ---------------- Footer ---------------- */}
        <footer className="tm-foot font-mono">
          {live.creatorAddress && (
            <span className="tm-creator">
              DEPLOYER{' '}
              <span className="tm-creator-val">
                {live.creatorUsername || formatAddress(live.creatorAddress, 4, 4)}
              </span>
            </span>
          )}
          <div className="tm-links">
            {onOpenFullPage && !isPage && (
              <button
                type="button"
                className="tm-link tm-link-primary"
                onClick={() => onOpenFullPage(live)}
              >
                <Maximize2 size={11} /> Token page
              </button>
            )}
            <a
              href={`https://pump.tires/token/${encodeURIComponent(live.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tm-link"
            >
              pump.tires <ExternalLink size={9} />
            </a>
            <a
              href={`https://otter.pulsechain.com/address/${encodeURIComponent(live.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tm-link"
            >
              Explorer <ExternalLink size={9} />
            </a>
          </div>
        </footer>
    </div>
  )

  if (isPage) return body

  return (
    <div className="trench-modal-backdrop" onClick={onClose} role="presentation">
      {body}
    </div>
  )
}
