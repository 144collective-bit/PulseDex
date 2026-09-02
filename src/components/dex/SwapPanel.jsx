import { useEffect, useState } from 'react'
import {
  ArrowDown,
  Settings2,
  ChevronDown,
  Info,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import TokenLogo from '../TokenLogo'
import TokenSelectModal from './TokenSelectModal'
import { formatUnits } from 'viem'
import { useSwapQuote } from '../../hooks/useSwapQuote'
import { useTokenUsdPrice } from '../../hooks/useTokenUsdPrice'
import { useResolvedToken } from '../../hooks/useResolvedToken'
import { useSwapExecution } from '../../hooks/useSwapExecution'
import { SWAP_PHASE } from '../../services/swapFlow'
import { EXPLORER_NAME } from '../../utils/explorer'
import { minimumReceived } from '../../services/dex'
import {
  CURATED_TOKENS,
  DEFAULT_FROM,
  DEFAULT_TO,
  WPLS,
  NATIVE_PLS,
  NATIVE_PLS_PLACEHOLDER,
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
 * Treats the WPLS address as native PLS - the screener talks in pairs, which
 * are always wrapped, while a trader thinks in PLS. An address that isn't
 * curated resolves to null and is read from the chain instead of quietly
 * becoming some other token.
 */
function resolveToken(addr, fallbackAddr) {
  if (!addr) return findToken(fallbackAddr)
  const lower = String(addr).toLowerCase()
  if (lower === WPLS.toLowerCase() || lower === NATIVE_PLS_PLACEHOLDER) {
    return findToken(NATIVE_PLS)
  }
  return CURATED_TOKENS.find((t) => t.address.toLowerCase() === lower) || null
}

/** Trim a figure to something readable without losing small balances. */
function fmtAmount(value) {
  if (!value) return ''
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (value >= 1) return value.toFixed(4)
  return value.toPrecision(6)
}

/** Dollar value of an amount, or null when either half is unknown. */
function usdValue(amount, price) {
  const qty = Number(amount)
  if (!price || !isFinite(qty) || qty <= 0) return null
  const value = qty * price
  if (value < 0.01) return '< $0.01'
  return `≈ $${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
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
  // State holds only what has been explicitly chosen - the host's address if it
  // was curated, or the user's own pick. An uncurated address leaves the slot
  // null and is filled in from the chain below.
  const [fromPick, setFromPick] = useState(() => resolveToken(initialFrom, DEFAULT_FROM))
  const [toPick, setToPick] = useState(() => resolveToken(initialTo, DEFAULT_TO))

  const { token: resolvedFrom, isLoading: loadingFrom } = useResolvedToken(
    fromPick ? null : initialFrom
  )
  const { token: resolvedTo, isLoading: loadingTo } = useResolvedToken(
    toPick ? null : initialTo
  )

  // Derived rather than synced into state, so there is no render where the
  // panel holds a token the props have already moved past.
  const fromToken = fromPick || resolvedFrom
  const toToken = toPick || resolvedTo

  const resolving = loadingFrom || loadingTo
  const unresolved = !fromToken || !toToken
  const [amount, setAmount] = useState('')
  const [picking, setPicking] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE)

  const { data: fromPrice } = useTokenUsdPrice(fromToken)
  const { data: toPrice } = useTokenUsdPrice(toToken)

  /*
   * Quotes stop refreshing while a transaction is outstanding.
   *
   * Routed through state rather than read straight from the execution hook,
   * because that hook needs the quote and the quote needs to know the phase -
   * a cycle within one render. Crossing a render breaks it, and the frame of
   * lag costs nothing: the call that gets signed is built from a snapshot
   * taken when the button is pressed, not from whatever is on screen.
   */
  const [txLock, setTxLock] = useState(false)

  const { data: quote, isFetching, isError } = useSwapQuote({
    from: fromToken,
    to: toToken,
    amount,
    enabled: !txLock,
  })

  const exec = useSwapExecution({
    from: fromToken,
    to: toToken,
    amount,
    quote,
    slippagePct: slippage,
    deadlineMinutes: deadline,
    isQuoteFetching: isFetching,
    isQuoteError: isError,
  })

  useEffect(() => {
    setTxLock(exec.isInFlight)
  }, [exec.isInFlight])

  const flip = () => {
    setFromPick(toToken)
    setToPick(fromToken)
    setAmount('')
    onPairChange?.(toToken, fromToken)
  }

  const pick = (token) => {
    if (picking === 'from') {
      setFromPick(token)
      onPairChange?.(token, toToken)
    } else {
      setToPick(token)
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
  const payUsd = usdValue(amount, fromPrice)
  const receiveUsd = usdValue(quote?.amountOut, toPrice)

  // Either side can be null while an uncurated address is read from the chain,
  // or permanently if that read fails. Showing a placeholder beats rendering a
  // quote for a token the user did not choose.
  if (unresolved) {
    return (
      <section className={`swap-panel ${compact ? 'is-compact' : ''}`}>
        <header className="swap-head">
          <span className="swap-head-title">Swap</span>
        </header>
        <p className="swap-resolving">
          {resolving ? 'Reading token details…' : 'This token could not be read from the chain.'}
        </p>
      </section>
    )
  }

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
          {exec.maxSpendableRaw > 0n && !exec.inputsLocked && (
            <button
              type="button"
              className="swap-max"
              onClick={() => setAmount(formatUnits(exec.maxSpendableRaw, fromToken.decimals))}
              /* Not the whole balance for native PLS: the fee comes out of the
                 same pot, so filling in all of it produces a transaction with
                 nothing left to pay for itself. */
              title={
                fromToken.isNative
                  ? 'Your balance, less enough PLS to cover the fee'
                  : 'Your full balance'
              }
            >
              Max
            </button>
          )}
        </div>
        <div className="swap-field-row">
          <input
            type="text"
            inputMode="decimal"
            readOnly={exec.inputsLocked}
            className="swap-amount"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
            }}
          />
          <button
            type="button"
            className="swap-token-btn"
            disabled={exec.inputsLocked}
            onClick={() => setPicking('from')}
          >
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
        {payUsd && <span className="swap-usd">{payUsd}</span>}
      </div>

      <button
        type="button"
        className="swap-flip"
        disabled={exec.inputsLocked}
        onClick={flip}
        aria-label="Swap direction"
      >
        <ArrowDown size={15} />
      </button>

      <div className="swap-field">
        <div className="swap-field-top">
          <span className="swap-field-label">You receive</span>
          {isFetching && <Loader2 size={12} className="dex-spin" />}
        </div>
        <div className="swap-field-row">
          {/* Keyed on the figure so a refreshed quote remounts the node and
              replays the flash - a price that moved underneath you should be
              visible without having to watch for it. */}
          <span
            key={quote?.amountOut ?? 'empty'}
            className={`swap-amount is-output ${quote ? '' : 'is-empty'}`}
          >
            {quote ? fmtAmount(quote.amountOut) : '0.0'}
          </span>
          <button
            type="button"
            className="swap-token-btn"
            disabled={exec.inputsLocked}
            onClick={() => setPicking('to')}
          >
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
        {receiveUsd && <span className="swap-usd">{receiveUsd}</span>}
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

      {exec.block === 'wrongChain' && (
        <div className="swap-warning">
          <AlertTriangle size={14} />
          <span>Your wallet is on another network. Switch to PulseChain to trade.</span>
        </div>
      )}

      <button
        type="button"
        className={`swap-action ${exec.action.busy ? 'is-busy' : ''} ${
          exec.action.tone === 'warn' ? 'is-secondary' : ''
        }`}
        disabled={exec.action.disabled}
        onClick={exec.action.onClick}
      >
        {exec.action.busy && <Loader2 size={15} className="dex-spin" />}
        <span>{exec.action.label}</span>
      </button>

      {(exec.approveHash || exec.swapHash) && (
        <div className="swap-tx">
          {/* A sent transaction outlives the panel, so it can be read back
              beside a pair it has nothing to do with - naming it is what stops
              the rows describing the wrong trade. */}
          {exec.pendingPair && (
            <div className="swap-tx-for">
              {exec.pendingPair.amount} {exec.pendingPair.from} → {exec.pendingPair.to}
            </div>
          )}
          {exec.approveHash && (
            <div className="swap-tx-row">
              <span>Approval</span>
              <span className="swap-tx-state">
                {exec.phase === SWAP_PHASE.approveConfirming ? 'Confirming…' : 'Confirmed'}
              </span>
              <a
                className="swap-tx-link"
                href={exec.explorer.approve}
                target="_blank"
                rel="noopener noreferrer"
              >
                {EXPLORER_NAME}
                <ExternalLink size={11} />
              </a>
            </div>
          )}
          {exec.swapHash && (
            <div className="swap-tx-row">
              <span>Swap</span>
              <span className="swap-tx-state">
                {exec.phase === SWAP_PHASE.swapConfirming ? 'Confirming…' : 'Settled'}
              </span>
              <a
                className="swap-tx-link"
                href={exec.explorer.swap}
                target="_blank"
                rel="noopener noreferrer"
              >
                {EXPLORER_NAME}
                <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>
      )}

      {exec.routeMoved && (
        <div className="swap-warning is-info">
          <AlertTriangle size={14} />
          <span>
            The best route moved to a different PulseX pool. Approvals are per pool, so check the
            button below before pressing again.
          </span>
        </div>
      )}

      {exec.tokenFee && (
        <div className="swap-warning">
          <AlertTriangle size={14} />
          <span>
            {exec.tokenFee.symbol} charges a {exec.tokenFee.feePct.toFixed(2)}% fee on transfer, so
            that much of this trade will not reach you. Your slippage limit still applies to the
            rest. Press again to trade anyway.
          </span>
        </div>
      )}

      {exec.priceMoved && (
        <div className="swap-warning">
          <AlertTriangle size={14} />
          <span>
            The price moved while you were deciding — {toToken.symbol} out is now{' '}
            {fmtAmount(exec.priceMoved.amountOut)}, {exec.priceMoved.drift.toFixed(2)}% below what
            you were quoted. Press again to trade at the new price.
          </span>
        </div>
      )}

      {exec.errorMessage && (
        <div className="swap-warning is-danger">
          <AlertTriangle size={14} />
          <span>{exec.errorMessage}</span>
        </div>
      )}

      {exec.phase === SWAP_PHASE.success && (
        <div className="swap-warning is-success">
          <CheckCircle2 size={14} />
          {/* No amount is quoted here on purpose: the fee-on-transfer router
              methods return nothing, so a receipt proves the trade cleared its
              floor, not what actually arrived. */}
          <span>Swap confirmed. Check your wallet balance.</span>
        </div>
      )}

      <p className="swap-disclaimer">
        Quotes are live from the PulseX router.{' '}
        {exec.block === 'disabled'
          ? 'Trading is not enabled yet — this panel cannot sign or send a transaction.'
          : 'Trades are signed in your own wallet and settle on PulseChain.'}
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
