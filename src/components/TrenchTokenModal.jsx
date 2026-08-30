import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
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
} from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'
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
export default function TrenchTokenModal({ token, plsPrice, onClose }) {
  const [candleInterval, setCandleInterval] = useState(300)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('trades')

  const chartRef = useRef(null)
  const containerRef = useRef(null)

  const address = token?.address
  const { data: candles, isLoading: candlesLoading } = useTokenCandles(address, candleInterval)
  const { data: txnData } = useTokenTransactions(address, 60)
  const { data: detail } = useTokenDetail(address)

  const trades = txnData?.transactions || []
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
        textColor: '#7c8798',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.035)' },
        horzLines: { color: 'rgba(255,255,255,0.035)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.07)',
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.07)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      localization: { priceFormatter: formatPlsAxis },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e08a',
      downColor: '#f6465d',
      borderUpColor: '#00e08a',
      borderDownColor: '#f6465d',
      wickUpColor: '#00e08a',
      wickDownColor: '#f6465d',
      priceFormat: { type: 'custom', formatter: formatPlsAxis, minMove: 0.0000000001 },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    })

    chartRef.current = { chart, candleSeries, volumeSeries }

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

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

    refs.volumeSeries.setData(
      candles.map((c) => ({
        time: c.time,
        value: c.buyVolume + c.sellVolume,
        color: c.close >= c.open ? 'rgba(0,224,138,0.3)' : 'rgba(246,70,93,0.3)',
      }))
    )

    refs.chart.timeScale().fitContent()
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

  return (
    <div className="trench-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="trench-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
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

          <button
            type="button"
            className="tm-close"
            onClick={onClose}
            aria-label="Close detail"
          >
            <X size={15} />
          </button>
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

          <div className="tm-chart" ref={containerRef} />

          {candlesLoading && !candles?.length && (
            <div className="tm-chart-state font-mono">Loading candles…</div>
          )}
          {!candlesLoading && candles?.length === 0 && (
            <div className="tm-chart-state font-mono">No trades on this interval yet</div>
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
                  className={`tm-trade font-mono ${t.type === 'buy' ? 'is-buy' : 'is-sell'}`}
                >
                  <span className="tm-trade-side">{t.type.toUpperCase()}</span>
                  <span className="tcl-right tm-trade-usd">{formatUsd(t.usdValue)}</span>
                  <span className="tcl-right tm-dim">{formatCompactCount(t.tokenAmount)}</span>
                  <span className="tcl-right tm-dim">{formatCompactCount(t.plsAmount)}</span>
                  <span className="tm-dim truncate">
                    {t.username || formatAddress(t.userAddress)}
                  </span>
                  <span className="tcl-right tm-dim">{formatTimeAgo(t.timestamp)}</span>
                </div>
              ))}

            {tab === 'trades' && !trades.length && (
              <div className="trench-panel-state font-mono">
                <span>No trades yet</span>
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
    </div>
  )
}
