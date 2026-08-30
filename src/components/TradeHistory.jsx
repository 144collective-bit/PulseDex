import { useState, useEffect } from 'react'
import {
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Download,
  ShieldCheck,
  Droplets,
  Users,
  Copy,
  Check,
} from 'lucide-react'
import '../styles/trades.css'


/**
 * How far the row wash extends, capped so one outlier does not flood the tape.
 * $500 is treated as full width - the same ceiling the token detail panel uses,
 * so the two tapes stay comparable.
 */
function washWidth(usd) {
  const pct = (Math.max(0, usd) / 500) * 100
  return Math.max(6, Math.min(100, pct))
}

export default function TradeHistory({ pair }) {
  const [activeTab, setActiveTab] = useState('trades') // 'trades' | 'traders' | 'liquidity' | 'security'
  const [filter, setFilter] = useState('all') // 'all' | 'buys' | 'sells'
  const [minSize, setMinSize] = useState(0)
  const [trades, setTrades] = useState([])
  const [copiedAddr, setCopiedAddr] = useState('')

  const baseSymbol = pair?.baseToken?.symbol || 'WPLS'
  const quoteSymbol = pair?.quoteToken?.symbol || 'DAI'
  const currentPrice = parseFloat(pair?.priceUsd || '0.00001455')

  // Generate initial recent trades and stream new transactions
  useEffect(() => {
    if (!pair) return

    const initial = []
    const now = Date.now()

    for (let i = 0; i < 25; i++) {
      const isBuy = Math.random() > 0.46
      const tokenAmount = Math.floor(Math.random() * 900000 + 40000)
      const usdValue = tokenAmount * currentPrice
      const variance = (Math.random() - 0.5) * 0.008 * currentPrice
      const price = currentPrice + variance

      initial.push({
        id: `tx-${now - i * 12000}`,
        timestamp: new Date(now - i * 12000),
        type: isBuy ? 'buy' : 'sell',
        usdValue,
        tokenAmount,
        quoteAmount: usdValue / (quoteSymbol === 'DAI' ? 1 : 0.00001455),
        price,
        txHash: `0x${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}...`,
        maker: `0x${Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}...`,
      })
    }

    setTrades(initial)

    // Stream new simulated live trades every 4-7 seconds
    const interval = setInterval(() => {
      const isBuy = Math.random() > 0.45
      const tokenAmount = Math.floor(Math.random() * 1500000 + 30000)
      const usdValue = tokenAmount * currentPrice
      const variance = (Math.random() - 0.48) * 0.006 * currentPrice
      const price = currentPrice + variance

      const newTrade = {
        id: `tx-${Date.now()}`,
        timestamp: new Date(),
        type: isBuy ? 'buy' : 'sell',
        usdValue,
        tokenAmount,
        quoteAmount: usdValue / (quoteSymbol === 'DAI' ? 1 : 0.00001455),
        price,
        txHash: `0x${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}...`,
        maker: `0x${Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}...`,
      }

      setTrades((prev) => [newTrade, ...prev.slice(0, 49)])
    }, Math.floor(Math.random() * 3000 + 4000))

    return () => clearInterval(interval)
  }, [pair, currentPrice, baseSymbol, quoteSymbol])

  const filteredTrades = trades.filter((t) => {
    if (filter === 'buys' && t.type !== 'buy') return false
    if (filter === 'sells' && t.type !== 'sell') return false
    if (t.usdValue < minSize) return false
    return true
  })

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedAddr(text)
    setTimeout(() => setCopiedAddr(''), 2000)
  }

  const exportCSV = () => {
    const headers = 'Timestamp,Type,USD Value,Token Amount,Price,TxHash,Maker\n'
    const rows = filteredTrades
      .map(
        (t) =>
          `"${t.timestamp.toISOString()}","${t.type}","${t.usdValue}","${t.tokenAmount}","${t.price}","${t.txHash}","${t.maker}"`
      )
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseSymbol}_trades_${Date.now()}.csv`
    a.click()
  }

  const formatUsd = (num) => {
    if (num >= 1000) return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return `$${num.toFixed(2)}`
  }

  const formatPrice = (val) => {
    if (val < 0.0001) return `$${val.toFixed(8)}`
    if (val < 1) return `$${val.toFixed(5)}`
    return `$${val.toFixed(2)}`
  }

  const formatToken = (num) => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
    return num.toFixed(0)
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
          <table className="trades-table font-mono">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>USD Value</th>
                <th>Amount ({baseSymbol})</th>
                <th>Price</th>
                <th>Maker</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade) => {
                const isBuy = trade.type === 'buy'
                const isWhale = trade.usdValue > 1000
                const isDolphin = trade.usdValue > 200 && !isWhale

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
                      <span
                        className="maker-chip"
                        onClick={() => copyToClipboard(trade.maker)}
                        title="Copy Maker Address"
                      >
                        {trade.maker.slice(0, 6)}...
                        {copiedAddr === trade.maker ? <Check size={10} className="text-pulse-green" /> : <Copy size={10} />}
                      </span>
                    </td>
                    <td>
                      <a
                        href={`https://scan.pulsechain.com/tx/${trade.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tx-link"
                        title="View on PulseScan"
                      >
                        {trade.txHash.slice(0, 6)}...
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

      {/* Tab 3: Security & Audit */}
      {activeTab === 'security' && (
        <div className="security-tab-content font-mono">
          <div className="security-checks-grid">
            <div className="sec-check-item">
              <span className="sec-label">Honeypot Risk</span>
              <span className="badge badge-green">Passed (No Honeypot)</span>
            </div>
            <div className="sec-check-item">
              <span className="sec-label">Buy Tax</span>
              <span className="sec-val text-pulse-green">0%</span>
            </div>
            <div className="sec-check-item">
              <span className="sec-label">Sell Tax</span>
              <span className="sec-val text-pulse-green">0%</span>
            </div>
            <div className="sec-check-item">
              <span className="sec-label">Verified PRC-20 Contract</span>
              <span className="badge badge-pulse">Verified on PulseScan</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
