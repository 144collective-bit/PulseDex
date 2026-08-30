import { useState } from 'react'
import { ArrowLeftRight, Droplets, ChevronDown } from 'lucide-react'
import SwapPanel from './dex/SwapPanel'
import PoolsPanel from './dex/PoolsPanel'
import PoolSelect from './dex/PoolSelect'
import TokenAnalytics from './dex/TokenAnalytics'
import RouteBar from './dex/RouteBar'
import TradingChart from './TradingChart'
import TokenLogo from './TokenLogo'
import { useSubjectPair } from '../hooks/useSubjectPair'
import { usePairRoute } from '../hooks/usePairRoute'
import { CURATED_TOKENS, DEFAULT_FROM, DEFAULT_TO, NATIVE_PLS } from '../config/dex'
import '../styles/dex.css'

const findToken = (address) => CURATED_TOKENS.find((t) => t.address === address)
const defaultSubject = () => findToken(DEFAULT_TO) || CURATED_TOKENS[1]
const defaultCounter = () => findToken(DEFAULT_FROM) || CURATED_TOKENS[0]

/**
 * Which of the two sides of a swap the page should be about.
 *
 * Almost every trade here is priced in PLS, so if PLS were allowed to be the
 * subject the chart would sit on PLS/DAI no matter what the user was actually
 * buying. The other side is the interesting one.
 */
function subjectOf(from, to) {
  const isNative = (t) => t?.isNative || t?.address === NATIVE_PLS
  if (isNative(to) && !isNative(from)) return from
  return to
}

/**
 * DEX terminal.
 *
 * Chart on the left, swap docked right, matching the screener's shape so the
 * app reads as one product. Quotes are live against PulseX; signing is not
 * wired, so nothing here can move funds.
 *
 * The chart follows the swap rather than being steered separately: picking a
 * token to buy is already a statement about what you want to look at, so
 * making that a second, manual step would only be a way to get the two out of
 * sync. The selector above the chart drives it from the other direction.
 *
 * On a phone the swap comes first and the chart sits below it - someone opening
 * this on a handset came to trade, not to analyse.
 */
export default function DexTerminal({ pairs = [], isLoadingPairs, onSelectPair }) {
  const [mode, setMode] = useState('swap')
  const [subject, setSubject] = useState(defaultSubject)
  // The other side of the trade. Held so the chart can look for a pool the two
  // selected tokens actually share, rather than only ever charting one of them.
  const [counter, setCounter] = useState(defaultCounter)
  const [picking, setPicking] = useState(false)
  // An explicitly chosen pool. Null means "whatever the route leads with",
  // which is what should happen after the tokens change.
  const [chosenPool, setChosenPool] = useState(null)

  const { route, isLoading: routeLoading } = usePairRoute(counter, subject)
  const { pair: fallbackPair, isLoading: fallbackLoading } = useSubjectPair(subject, pairs)

  // The pair the chart plots. A pool the two tokens share wins; otherwise the
  // selected leg of the route; otherwise the subject's own deepest pool.
  const allPools = [...(route?.direct || []), ...(route?.route || [])]
  const routePair =
    allPools.find(
      (p) => p.pairAddress?.toLowerCase() === chosenPool?.toLowerCase()
    ) ||
    route?.defaultPair ||
    null
  const pair = routePair || fallbackPair
  const isLoading = routeLoading || (!routePair && fallbackLoading)
  const poolCount = allPools.length

  // The bar labels the pool that is actually plotted. Reading the symbol off
  // the subject instead produced "PLSX/PLSX" whenever the subject happened to
  // be the pool's quote side.
  const chartBase = pair?.baseToken || null

  const handlePairChange = (from, to) => {
    const next = subjectOf(from, to)
    setSubject(next)
    setCounter(next === to ? from : to)
    // A pool chosen for the previous pair means nothing for the new one.
    setChosenPool(null)
    setPicking(false)
  }

  const selectPool = (selected) => {
    setChosenPool(selected.pairAddress)
    setPicking(false)
  }

  return (
    <div className="dex-terminal">
      <header className="dex-head">
        <div className="dex-head-analytics">
          {/* Token figures come from the token's own reference pool so they
              stay comparable; pool figures describe whatever is charted. */}
          <TokenAnalytics
            pair={fallbackPair || pair}
            poolPair={pair}
            isLoading={isLoading || isLoadingPairs}
          />
        </div>

        <div className="dex-modes" role="tablist" aria-label="DEX sections">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'swap'}
            className={`dex-mode ${mode === 'swap' ? 'active' : ''}`}
            onClick={() => setMode('swap')}
          >
            <ArrowLeftRight size={14} />
            <span>Swap</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pools'}
            className={`dex-mode ${mode === 'pools' ? 'active' : ''}`}
            onClick={() => setMode('pools')}
          >
            <Droplets size={14} />
            <span>Pools</span>
          </button>
        </div>
      </header>

      {mode === 'swap' ? (
        <div className="dex-grid">
          {/* Swap is first in the DOM so it leads on a phone, and is placed
              right of the chart on desktop by the grid. */}
          <div className="dex-swap-col">
            <SwapPanel
              initialTo={subject.address}
              onPairChange={handlePairChange}
            />
          </div>

          <div className="dex-chart-col">
            {/* Names the pool on the chart, and opens the list of every other
                pool these two tokens can be traded through. Tokens themselves
                are chosen in the swap box, so the two jobs stay separate. */}
            <div className="dex-subject-wrap">
            <button
              type="button"
              className={`dex-subject ${picking ? 'is-open' : ''}`}
              onClick={() => setPicking((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={picking}
              aria-label={`Change pool — currently ${
                pair ? `${pair.baseToken?.symbol}/${pair.quoteToken?.symbol}` : subject.symbol
              }`}
            >
              <TokenLogo
                symbol={chartBase?.symbol || subject.symbol}
                address={chartBase?.address || (subject.isNative ? undefined : subject.address)}
                customUrl={pair?.info?.imageUrl || subject.logo}
                size={36}
              />
              <span className="dex-subject-text">
                <span className="dex-subject-sym">
                  {chartBase?.symbol || subject.symbol}
                  {pair?.quoteToken?.symbol && (
                    <span className="dex-subject-quote">/{pair.quoteToken.symbol}</span>
                  )}
                  {/* The venue is a chip rather than part of the subtitle: run
                      inline it read "PulseX · Pulsex", the token's name beside
                      the venue's, which looked like a duplication bug. */}
                  {pair?.dexId && (
                    <span className="dex-subject-venue">{pair.dexId}</span>
                  )}
                </span>
                <span className="dex-subject-name">
                  {/* Says how many other pools are behind the caret, so the
                      control advertises what it opens. */}
                  {poolCount > 1
                    ? `${poolCount} pools for ${counter.symbol}/${subject.symbol}`
                    : subject.name || subject.symbol}
                </span>
              </span>
              <ChevronDown size={16} className="dex-subject-caret" />
            </button>

            <PoolSelect
              open={picking}
              onClose={() => setPicking(false)}
              pools={route}
              activeAddress={pair?.pairAddress}
              onSelect={selectPool}
              fromSymbol={counter.symbol}
              toSymbol={subject.symbol}
            />
            </div>

            {/* Warns about whatever is actually plotted, since the selected
                pair now leads even when its pool is thin. */}
            <RouteBar
              route={route}
              activePair={pair}
              fromSymbol={counter.symbol}
              toSymbol={subject.symbol}
            />

            {pair ? (
              <TradingChart key={pair.pairAddress} pair={pair} />
            ) : (
              <div className="dex-chart-empty">
                <span>
                  {isLoading || isLoadingPairs
                    ? 'Finding the deepest pool…'
                    : `No pool found for ${subject.symbol}.`}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <PoolsPanel pairs={pairs} isLoading={isLoadingPairs} onSelectPair={onSelectPair} />
      )}

    </div>
  )
}
