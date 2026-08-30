import { useState } from 'react'
import { ArrowDown, Settings2, ChevronDown, Info, AlertTriangle, Loader2 } from 'lucide-react'
import TokenLogo from '../TokenLogo'
import TokenSelectModal from './TokenSelectModal'
import { useSwapQuote } from '../../hooks/useSwapQuote'
import { minimumReceived } from '../../services/dex'
import {
  CURATED_TOKENS,
  DEFAULT_FROM,
  DEFAULT_TO,
  WPLS,
  NATIVE_PLS,
  SLIPPAGE_PRESETS,
  DEFAULT_SLIPPAGE,
  DEFAULT_DEADLINE,
  IMPACT_WARN,
  IMPACT_DANGER,
} from '../../config/dex'

const findToken = (addr) => CURATED_TOKENS.find((t) => t.address === addr)

/**
 * Resolve a token from an address the host passed in.
 *
 * Falls back to the curated default rather than rendering an empty panel, and
 * treats the WPLS address as native PLS - the screener talks in pairs, which
 * are always wrapped, while a trader thinks in PLS.
 */
function resolveToken(addr, fallbackAddr) {
  if (!addr) return findToken(fallbackAddr)
  const lower = String(addr).toLowerCase()
  if (lower === WPLS.toLowerCase()) return findToken(NATIVE_PLS)
  const match = CURATED_TOKENS.find((t) => t.address.toLowerCase() === lower)
  return match || findToken(fallbackAddr)
}

/** Trim a figure to something readable without losing small balances. */
function fmtAmount(value) {
  if (!value) return ''
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (value >= 1) return value.toFixed(4)
  return value.toPrecision(6)
}

/**
 * Swap panel.
 *
 * Quotes are live from PulseX's router; the swap itself is deliberately not
 * wired. Everything a trade depends on - route, price impact, minimum received
 * - is real, so the panel can be judged on the numbers it will actually show.
 */
export default function SwapPanel({
  onPairChange,
  initialFrom,
  initialTo,
  // Compact drops the heading and tightens spacing for a sidebar slot.
  compact = false,
}) {
  const [fromToken, setFromToken] = useState(() => resolveToken(initialFrom, DEFAULT_FROM))
  const [toToken, setToToken] = useState(() => resolveToken(initialTo, DEFAULT_TO))
  const [amount, setAmount] = useState('')
  const [picking, setPicking] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE)

  const { data: quote, isFetching, isError } = useSwapQuote({
    from: fromToken,
    to: toToken,
    amount,
  })

  const flip = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setAmount('')
    onPairChange?.(toToken, fromToken)
  }

  const pick = (token) => {
    if (picking === 'from') {
      setFromToken(token)
      onPairChange?.(token, toToken)
    } else {
      setToToken(token)
      onPairChange?.(fromToken, token)
    }
  }

  const impact = quote?.impact
  const impactTone =
    impact === null || impact === undefined
      ? ''
      : impact >= IMPACT_DANGER
        ? 'is-danger'
        : impact >= IMPACT_WARN
          ? 'is-warn'
          : 'is-ok'

  const hasAmount = Number(amount) > 0

  return (
    <section className={`swap-panel ${compact ? 'is-compact' : ''}`}>
      <header className="swap-head">
        <span className="swap-head-title">{compact ? `Swap ${toToken.symbol}` : 'Swap'}</span>
        <button
          type="button"
          className={`swap-gear ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Swap settings"
        >
          <Settings2 size={15} />
        </button>
      </header>

      {showSettings && (
        <div className="swap-settings">
          <div className="swap-setting">
            <span className="swap-setting-label">
              Slippage tolerance
              <span
                className="swap-info"
                title="How far the price may move against you before the trade reverts. Thin pools need more; too much invites sandwich attacks."
              >
                <Info size={11} />
              </span>
            </span>
            <div className="swap-slippage">
              {SLIPPAGE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`swap-slip-btn ${slippage === p ? 'active' : ''}`}
                  onClick={() => setSlippage(p)}
                >
                  {p}%
                </button>
              ))}
              <input
                type="number"
                className="swap-slip-input"
                value={slippage}
                min="0.01"
                max="50"
                step="0.1"
                onChange={(e) =>
                  setSlippage(Math.min(50, Math.max(0.01, Number(e.target.value) || 0)))
                }
                aria-label="Custom slippage"
              />
            </div>
          </div>

          <div className="swap-setting">
            <span className="swap-setting-label">Transaction deadline</span>
            <div className="swap-deadline">
              <input
                type="number"
                className="swap-slip-input"
                value={deadline}
                min="1"
                max="120"
                onChange={(e) =>
                  setDeadline(Math.min(120, Math.max(1, Number(e.target.value) || 1)))
                }
                aria-label="Deadline in minutes"
              />
              <span>minutes</span>
            </div>
          </div>
        </div>
      )}

      <div className="swap-field">
        <div className="swap-field-top">
          <span className="swap-field-label">You pay</span>
        </div>
        <div className="swap-field-row">
          <input
            type="text"
            inputMode="decimal"
            className="swap-amount"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
            }}
          />
          <button type="button" className="swap-token-btn" onClick={() => setPicking('from')}>
            <TokenLogo
              symbol={fromToken.symbol}
              address={fromToken.isNative ? undefined : fromToken.address}
              customUrl={fromToken.logo}
              size={26}
            />
            <span>{fromToken.symbol}</span>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <button type="button" className="swap-flip" onClick={flip} aria-label="Swap direction">
        <ArrowDown size={15} />
      </button>

      <div className="swap-field">
        <div className="swap-field-top">
          <span className="swap-field-label">You receive</span>
          {isFetching && <Loader2 size={12} className="dex-spin" />}
        </div>
        <div className="swap-field-row">
          <span className={`swap-amount is-output ${quote ? '' : 'is-empty'}`}>
            {quote ? fmtAmount(quote.amountOut) : '0.0'}
          </span>
          <button type="button" className="swap-token-btn" onClick={() => setPicking('to')}>
            <TokenLogo
              symbol={toToken.symbol}
              address={toToken.isNative ? undefined : toToken.address}
              customUrl={toToken.logo}
              size={26}
            />
            <span>{toToken.symbol}</span>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {hasAmount && quote && (
        <div className="swap-detail">
          <div className="swap-detail-row">
            <span>Rate</span>
            <span className="swap-detail-val">
              1 {fromToken.symbol} = {fmtAmount(quote.rate)} {toToken.symbol}
            </span>
          </div>
          <div className="swap-detail-row">
            <span>Price impact</span>
            <span className={`swap-detail-val ${impactTone}`}>
              {impact === null || impact === undefined ? '—' : `${impact.toFixed(2)}%`}
            </span>
          </div>
          <div className="swap-detail-row">
            <span>Minimum received</span>
            <span className="swap-detail-val">
              {fmtAmount(minimumReceived(quote.amountOut, slippage))} {toToken.symbol}
            </span>
          </div>
          <div className="swap-detail-row">
            <span>Route</span>
            <span className="swap-detail-val">
              {quote.routerLabel} · {quote.hops === 1 ? 'direct' : `${quote.hops} hops`}
            </span>
          </div>
        </div>
      )}

      {hasAmount && impact !== null && impact !== undefined && impact >= IMPACT_WARN && (
        <div className={`swap-warning ${impact >= IMPACT_DANGER ? 'is-danger' : ''}`}>
          <AlertTriangle size={14} />
          <span>
            This trade moves the pool by {impact.toFixed(1)}%. You are getting a
            materially worse rate than spot — consider a smaller size.
          </span>
        </div>
      )}

      {hasAmount && isError && (
        <div className="swap-warning is-danger">
          <AlertTriangle size={14} />
          <span>No route found for this pair. There may be no pool on PulseX.</span>
        </div>
      )}

      {/*
        Deliberately inert. The panel quotes live prices but cannot sign
        anything - enabling the swap means approvals, transaction handling and a
        signing flow, none of which should ship untested behind a mockup.
      */}
      <button type="button" className="swap-action" disabled>
        Swap coming soon
      </button>

      <p className="swap-disclaimer">
        Quotes are live from the PulseX router. Trading is not enabled yet — this
        panel cannot sign or send a transaction.
      </p>

      <TokenSelectModal
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        onSelect={pick}
        excludeAddress={picking === 'from' ? toToken.address : fromToken.address}
      />
    </section>
  )
}
