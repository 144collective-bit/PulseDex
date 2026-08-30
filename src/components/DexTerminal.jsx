import { useState } from 'react'
import { ArrowLeftRight, Droplets } from 'lucide-react'
import SwapPanel from './dex/SwapPanel'
import PoolsPanel from './dex/PoolsPanel'
import TradingChart from './TradingChart'
import '../styles/dex.css'

/**
 * DEX terminal.
 *
 * Chart on the left, swap docked right, matching the screener's shape so the
 * app reads as one product. Quotes are live against PulseX; signing is not
 * wired, so nothing here can move funds.
 *
 * On a phone the swap comes first and the chart sits below it - someone opening
 * this on a handset came to trade, not to analyse.
 */
export default function DexTerminal({ pairs = [], isLoadingPairs, currentPair, onSelectPair }) {
  const [mode, setMode] = useState('swap')

  return (
    <div className="dex-terminal">
      <header className="dex-head">
        <div className="dex-title-block">
          <div className="dex-eyebrow">
            <span className="dex-dot" aria-hidden="true" />
            <span>PULSECHAIN · DEX</span>
          </div>
          <h1 className="dex-title">Trade</h1>
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
            <SwapPanel />
          </div>

          <div className="dex-chart-col">
            {currentPair ? (
              <TradingChart pair={currentPair} />
            ) : (
              <div className="dex-chart-empty">
                <span>Select a pair to load its chart.</span>
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
