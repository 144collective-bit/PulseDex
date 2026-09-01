import { useMemo, useState } from 'react'
import {
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  ShieldCheck,
  Droplets,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react'
import { usePoolSwaps } from '../services/poolSwaps'
import { useTokenSafety } from '../services/tokenSafety'
import { formatAddress } from '../utils/formatters'
import '../styles/trades.css'


/**
 * How far the row wash extends, capped so one outlier does not flood the tape.
 * $500 is treated as full width - the same ceiling the token detail panel uses,
 * so the two tapes stay comparable.
 */
function washWidth(usd) {
  if (usd === null || !isFinite(usd)) return 6
  const pct = (Math.max(0, usd) / 500) * 100
  return Math.max(6, Math.min(100, pct))
}

/**
 * What one unit of the quote asset is worth in dollars.
 *
 * DexScreener prices the base asset both ways - in dollars and in the quote -
 * so dividing one by the other gives the quote's own dollar price without a
 * second request. Returns null rather than a guess when either side is missing,
 * because the alternative is a dollar column full of confident nonsense.
 */
function quoteUsdPrice(pair) {
  const usd = Number(pair?.priceUsd)
  const native = Number(pair?.priceNative)
  if (!isFinite(usd) || !isFinite(native) || native <= 0) return null
  return usd / native
}

export default function TradeHistory({ pair }) {
  const [activeTab, setActiveTab] = useState('trades') // 'trades' | 'liquidity' | 'security'
  const [filter, setFilter] = useState('all') // 'all' | 'buys' | 'sells'
  const [minSize, setMinSize] = useState(0)
  const [copiedAddr, setCopiedAddr] = useState('')

  const baseSymbol = pair?.baseToken?.symbol || 'WPLS'
  const quoteSymbol = pair?.quoteToken?.symbol || 'DAI'

  /*
   * Real swaps, reconstructed from the pool's own token transfers.
   *
   * These rows used to be generated: twenty-five invented trades on mount and a
   * new one every few seconds, with random transaction hashes linking to a
   * block explorer that had never heard of them, random maker addresses the
   * reader could copy, and a CSV export that wrote all of it to disk as though
   * it were a record of the market.
   */
  const {
    data: swaps,
    isLoading,
    isError,
    error,
    refetch,
  } = usePoolSwaps(pair?.pairAddress, pair?.baseToken?.address, 60)

  const quoteUsd = quoteUsdPrice(pair)

  const trades = useMemo(
    () =>
      (swaps ?? []).map((s) => ({
        id: `${s.hash}-${s.timestamp}`,
        timestamp: new Date(s.timestamp),
        type: s.side === 'sell' ? 'sell' : 'buy',
        tokenAmount: s.baseAmount,
        quoteAmount: s.counterAmount,
        // The ratio is exact and historical; the dollar figure is that ratio at
        // the quote asset's price now, which is why the column says "≈".
        price: quoteUsd === null ? null : s.price * quoteUsd,
        priceInQuote: s.price,
        usdValue: quoteUsd === null ? null : s.counterAmount * quoteUsd,
        txHash: s.hash,
        maker: s.trader ?? null,
      })),
    [swaps, quoteUsd],
  )

  const filteredTrades = trades.filter((t) => {
    if (filter === 'buys' && t.type !== 'buy') return false
    if (filter === 'sells' && t.type !== 'sell') return false
    // A size filter cannot exclude what it cannot measure, so trades with no
    // dollar figure stay in the tape rather than vanishing from it.
    if (minSize > 0 && t.usdValue !== null && t.usdValue < minSize) return false
    return true
  })

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedAddr(text)
    setTimeout(() => setCopiedAddr(''), 2000)
  }

  const exportCSV = () => {
    const headers = `Timestamp,Type,Approx USD,${baseSymbol} Amount,${quoteSymbol} Amount,Price (${quoteSymbol}),TxHash,Maker\n`
    const rows = filteredTrades
      .map((t) =>
        [
          t.timestamp.toISOString(),
          t.type,
          t.usdValue ?? '',
          t.tokenAmount,
          t.quoteAmount,
          t.priceInQuote,
          t.txHash,
          t.maker ?? '',
        ]
          .map((v) => `"${v}"`)
          .join(',')
      )
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseSymbol}_trades_${Date.now()}.csv`
    a.click()
  }

  // An em dash where there is no figure. "We cannot price this" and "$0.00" are
  // different statements and must not render the same.
  const formatUsd = (num) => {
    if (num === null || !isFinite(num)) return '—'
    if (num >= 1000) return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return `$${num.toFixed(2)}`
  }

  const formatPrice = (val) => {
    if (val === null || !isFinite(val)) return '—'
    if (val < 0.0001) return `$${val.toFixed(8)}`
    if (val < 1) return `$${val.toFixed(5)}`
    return `$${val.toFixed(2)}`
  }

  const formatToken = (num) => {
    if (!isFinite(num)) return '—'
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
    if (num >= 1) return num.toFixed(2)
    // Sub-unit amounts are ordinary for an eight-decimal token; rounding them
    // to "0" would erase most of a HEX tape.
    return num.toPrecision(3)
  }

  return (
    <div className="trades-panel glass-panel">
      {/* Tab Navigation Header */}
      <div className="trades-header-row">
        <div className="trades-tabs font-mono">
          <button
            className={`trade-main-tab ${activeTab === 'trades' ? 'active' : ''}`}
            onClick={() => setActiveTab('trades')}
          >
            ⚡ Live Swaps ({filteredTrades.length})
          </button>
          <button
            className={`trade-main-tab ${activeTab === 'liquidity' ? 'active' : ''}`}
            onClick={() => setActiveTab('liquidity')}
          >
            <Droplets size={13} />
            <span>Liquidity Pools</span>
          </button>
          <button
            className={`trade-main-tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <ShieldCheck size={13} />
            <span>Security & Audit</span>
          </button>
        </div>

        {activeTab === 'trades' && (
          <div className="trade-controls">
            {/* Min Size filter */}
            <div className="min-size-filters font-mono">
              {[
                { label: 'All', val: 0 },
                { label: '>$50', val: 50 },
                { label: '>$200', val: 200 },
                { label: '🐋 >$1K', val: 1000 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  className={`size-filter-btn ${minSize === opt.val ? 'active' : ''}`}
                  onClick={() => setMinSize(opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Buys / Sells type */}
            <div className="trade-filters">
              <button
                className={`trade-filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={`trade-filter-btn filter-buy ${filter === 'buys' ? 'active' : ''}`}
                onClick={() => setFilter('buys')}
              >
                Buys
              </button>
              <button
                className={`trade-filter-btn filter-sell ${filter === 'sells' ? 'active' : ''}`}
                onClick={() => setFilter('sells')}
              >
                Sells
              </button>
            </div>

            {/* CSV export */}
            <button
              className="btn-icon"
              onClick={exportCSV}
              title="Export Trades to CSV"
            >
              <Download size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Tab 1: Live Swaps Table */}
      {activeTab === 'trades' && (
        <div className="trades-table-container">
          {/* States, in the order they can happen. A tape that is loading, one
              that failed and one that is genuinely quiet used to look
              identical: an empty table with a header. */}
          {isLoading && !swaps ? (
            <div className="trades-state font-mono">
              <Loader2 size={15} className="trades-spin" aria-hidden="true" />
              <span>Reading swaps from PulseScan</span>
            </div>
          ) : null}

          {isError ? (
            <div className="trades-state is-error font-mono" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Could not read this pool&rsquo;s swaps</span>
              <p>{error?.message?.slice(0, 120)}</p>
              <button type="button" className="size-filter-btn" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : null}

          {!isLoading && !isError && filteredTrades.length === 0 ? (
            <div className="trades-state font-mono">
              <span>
                {trades.length === 0
                  ? 'No swaps found in this pool&rsquo;s recent transfers'
                  : 'No swaps match these filters'}
              </span>
            </div>
          ) : null}

          <table className="trades-table font-mono">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th title={`Valued at the current ${quoteSymbol} price`}>USD &asymp;</th>
                <th>Amount ({baseSymbol})</th>
                <th>Price</th>
                <th title="The address that paid into the pool. A router address when the swap was routed rather than sent directly.">
                  From
                </th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade) => {
                const isBuy = trade.type === 'buy'
                const isWhale = trade.usdValue !== null && trade.usdValue > 1000
                const isDolphin = trade.usdValue !== null && trade.usdValue > 200 && !isWhale

                return (
                  <tr
                    key={trade.id}
                    className={`trade-row ${isBuy ? 'row-buy' : 'row-sell'} ${isWhale ? 'is-whale' : ''}`}
                    /* Wash width tracks trade size against the same $500 ceiling
                       the token panel uses, so a given trade looks the same on
                       both surfaces. */
                    style={{ '--wash': `${washWidth(trade.usdValue)}%` }}
                  >
                    <td className="trade-time text-muted">
                      {trade.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className={`trade-type-tag ${isBuy ? 'badge-green' : 'badge-red'}`}>
                        {isBuy ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                        {trade.type.toUpperCase()}
                        {isWhale && <span title="Whale Order"> 🐋</span>}
                        {isDolphin && <span title="Dolphin Order"> 🐬</span>}
                      </span>
                    </td>
                    <td className={`trade-usd ${isBuy ? 'text-pulse-green' : 'text-pulse-red'}`}>
                      {formatUsd(trade.usdValue)}
                    </td>
                    <td className="trade-amount text-primary">
                      {formatToken(trade.tokenAmount)}
                    </td>
                    <td className="trade-price text-muted">
                      {formatPrice(trade.price)}
                    </td>
                    <td>
                      {trade.maker ? (
                        <span
                          className="maker-chip"
                          onClick={() => copyToClipboard(trade.maker)}
                          title={`Copy ${trade.maker}`}
                        >
                          {formatAddress(trade.maker)}
                          {copiedAddr === trade.maker ? (
                            <Check size={10} className="text-pulse-green" />
                          ) : (
                            <Copy size={10} />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={`https://scan.pulsechain.com/tx/${trade.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tx-link"
                        title={trade.txHash}
                      >
                        {trade.txHash.slice(0, 8)}&hellip;
                        <ExternalLink size={10} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Liquidity Breakdown */}
      {activeTab === 'liquidity' && (
        <div className="liquidity-tab-content font-mono">
          <div className="liq-cards-grid">
            <div className="liq-stat-card">
              <span className="liq-card-label">Total Pool Liquidity</span>
              <span className="liq-card-val text-pulse-cyan">${parseFloat(pair?.liquidity?.usd || 0).toLocaleString()}</span>
            </div>
            <div className="liq-stat-card">
              <span className="liq-card-label">Pooled {baseSymbol}</span>
              <span className="liq-card-val">{pair?.liquidity?.base ? Number(pair.liquidity.base).toLocaleString() : 'N/A'}</span>
            </div>
            <div className="liq-stat-card">
              <span className="liq-card-label">Pooled {quoteSymbol}</span>
              <span className="liq-card-val">{pair?.liquidity?.quote ? Number(pair.liquidity.quote).toLocaleString() : 'N/A'}</span>
            </div>
            <div className="liq-stat-card">
              <span className="liq-card-label">LP Contract</span>
              <span className="liq-card-val text-pulse-green">{pair?.dexId?.toUpperCase() || 'PULSEX V2'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Contract facts, and an honest account of what is not checked. */}
      {activeTab === 'security' && (
        <ContractPanel pair={pair} baseSymbol={baseSymbol} />
      )}
    </div>
  )
}

/**
 * What the explorer says about the token contract, and what nobody says.
 *
 * This replaced a panel of four hardcoded verdicts. It reported, for every
 * token ever displayed, that the honeypot check had passed and that buy and
 * sell tax were both zero - none of which had been checked at all. Shown
 * against an actual honeypot it would have told the reader it was safe, which
 * is the one thing a screener must never do.
 *
 * The rule now is that every claim on this panel has a source behind it, and
 * everything without one is named as unknown rather than quietly omitted. An
 * absent warning reads as an all-clear, so the gaps are stated as loudly as the
 * findings.
 */
function ContractPanel({ pair, baseSymbol }) {
  const address = pair?.baseToken?.address
  const { data, isLoading, isError, refetch } = useTokenSafety(address)

  const ageDays = pair?.pairCreatedAt
    ? Math.floor((Date.now() - Number(pair.pairCreatedAt)) / 86_400_000)
    : null

  return (
    <div className="security-tab-content font-mono">
      {isLoading ? (
        <div className="trades-state">
          <Loader2 size={15} className="trades-spin" aria-hidden="true" />
          <span>Reading the contract from PulseScan</span>
        </div>
      ) : null}

      {isError ? (
        <div className="trades-state is-error" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>Could not read this contract</span>
          <button type="button" className="size-filter-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="security-checks-grid">
          <div className="sec-check-item">
            <span className="sec-label">Source code</span>
            {data.verified === null ? (
              <span className="badge">Unknown</span>
            ) : data.verified ? (
              <span className="badge badge-green">
                Verified on PulseScan{data.fullyVerified ? '' : ' (partial match)'}
              </span>
            ) : (
              <span className="badge badge-red">Not published</span>
            )}
          </div>

          <div className="sec-check-item">
            <span className="sec-label">Token standard</span>
            <span className="sec-val">{data.standard || <span className="text-muted">&mdash;</span>}</span>
          </div>

          <div className="sec-check-item">
            <span className="sec-label">Holders</span>
            <span className="sec-val">
              {data.holders === null ? (
                <span className="text-muted">&mdash;</span>
              ) : (
                data.holders.toLocaleString()
              )}
            </span>
          </div>

          <div className="sec-check-item">
            <span className="sec-label">Pair age</span>
            <span className="sec-val">
              {ageDays === null ? <span className="text-muted">&mdash;</span> : `${ageDays}d`}
            </span>
          </div>

          {data.selfDestructed ? (
            <div className="sec-check-item">
              <span className="sec-label">Contract</span>
              <span className="badge badge-red">Self-destructed</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        Stated, not omitted. A panel headed "Security" that simply leaves these
        out reads as though they were checked and found clean.
      */}
      <div className="sec-unknown">
        <p className="sec-unknown-head">
          <HelpCircle size={13} aria-hidden="true" />
          <span>Not checked by PulseDEX</span>
        </p>
        <ul>
          <li>
            <strong>Honeypot behaviour.</strong> Establishing whether {baseSymbol} can be sold means
            simulating a buy and a sell against a forked node. PulseDEX does not do this, so it
            cannot tell you either way.
          </li>
          <li>
            <strong>Buy and sell tax.</strong> Transfer fees are set inside the contract and only
            show up when a trade executes. Not measured here.
          </li>
          <li>
            <strong>Liquidity locks and ownership.</strong> Whether the pool is locked, and who can
            still mint or change the contract, is not read.
          </li>
        </ul>
        <p className="sec-unknown-foot">
          Verified source means the published code matches what is deployed. It does not mean the
          code is safe, and it says nothing about the intentions of whoever wrote it. Check a
          dedicated contract scanner before trading anything unfamiliar.
        </p>
      </div>
    </div>
  )
}
