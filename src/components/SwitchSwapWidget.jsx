import { useState, useEffect } from 'react'
import {
  Zap,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  ArrowDownUp,
} from 'lucide-react'

const PARTNER_ADDRESS = '0x9EbD2d52bE577940F900BA9A6aaD0F700615e2D1'
const NATIVE_PLS_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

// Top ecosystem pairs for quick switching
const QUICK_PAIRS = [
  {
    name: 'PLS ➔ HEX',
    from: NATIVE_PLS_ADDRESS,
    to: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
  },
  {
    name: 'PLS ➔ PLSX',
    from: NATIVE_PLS_ADDRESS,
    to: '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
  },
  {
    name: 'PLS ➔ INC',
    from: NATIVE_PLS_ADDRESS,
    to: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d',
  },
  {
    name: 'PLS ➔ DAI',
    from: NATIVE_PLS_ADDRESS,
    to: '0xefd766ccb38eaf1dfd701853bfce31359239f305',
  },
  {
    name: 'PLS ➔ TEXAN',
    from: NATIVE_PLS_ADDRESS,
    to: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f',
  },
]

export default function SwitchSwapWidget({
  initialFrom = NATIVE_PLS_ADDRESS,
  initialTo = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
  targetToken = null,
  compact = false,
  customHeight = null,
}) {
  const [fromToken, setFromToken] = useState(initialFrom)
  const [toToken, setToToken] = useState(initialTo)
  const [refreshKey, setRefreshKey] = useState(0)
  const [borderColorTheme, setBorderColorTheme] = useState('00e5ff') // 00e5ff (cyan), 00ff9d (green), d946ef (purple)

  // Dynamically update tokens whenever parent passes a new selected token
  useEffect(() => {
    if (initialTo) {
      setToToken(initialTo)
    }
    if (initialFrom) {
      setFromToken(initialFrom)
    }
  }, [initialFrom, initialTo])

  // Custom theme variables harmonized with PulseDex palette
  const bgColor = '080b11' // --bg-main obsidian dark
  const fontColor = 'f8fafc' // --text-primary
  const secFontColor = '94a3b8' // --text-secondary
  const backdropColor = '080b11' // matches exact app background

  const iframeSrc = `https://switch.win/widget?network=pulsechain&background_color=${bgColor}&font_color=${fontColor}&secondary_font_color=${secFontColor}&border_color=${borderColorTheme}&backdrop_color=${backdropColor}&from=${fromToken}&to=${toToken}&partnerAddress=${PARTNER_ADDRESS}`

  const handleSelectQuickPair = (pair) => {
    setFromToken(pair.from)
    setToToken(pair.to)
    setRefreshKey((prev) => prev + 1)
  }

  const handleSwapDirection = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setRefreshKey((prev) => prev + 1)
  }

  const handleRefreshWidget = () => {
    setRefreshKey((prev) => prev + 1)
  }

  const widgetHeight = customHeight || '760px'

  return (
    <div className={`switch-swap-container ${compact ? 'switch-swap-compact' : ''}`}>
      {/* Sleek Top Quick-Action Bar */}
      <div className="switch-top-toolbar glass-panel">
        <div className="switch-toolbar-left">
          <div className="switch-brand-pill">
            <Zap size={13} className="text-pulse-green" />
            <span className="switch-brand-title">
              {targetToken?.symbol ? `Swap ${targetToken.symbol}` : 'DEX Aggregator'}
            </span>
          </div>

          {!compact && (
            <div className="switch-quick-pills">
              {QUICK_PAIRS.map((qp) => {
                const isSelected =
                  toToken.toLowerCase() === qp.to.toLowerCase() &&
                  fromToken.toLowerCase() === qp.from.toLowerCase()
                return (
                  <button
                    key={qp.name}
                    type="button"
                    onClick={() => handleSelectQuickPair(qp)}
                    className={`switch-toolbar-chip ${isSelected ? 'active' : ''}`}
                  >
                    <span>{qp.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {compact && targetToken && (
            <div className="switch-target-badge font-mono">
              <span className="text-muted">Target:</span>
              <span className="text-pulse-cyan font-bold">{targetToken.symbol}</span>
            </div>
          )}
        </div>

        <div className="switch-toolbar-right">
          {/* Swap direction toggle */}
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={handleSwapDirection}
            title="Switch Buy/Sell Direction"
          >
            <ArrowDownUp size={13} />
          </button>

          {/* Accent Color Dots */}
          <div className="switch-accent-dots" title="Swap Terminal Color Accent">
            <button
              type="button"
              onClick={() => setBorderColorTheme('00e5ff')}
              className={`accent-dot bg-[#00e5ff] ${borderColorTheme === '00e5ff' ? 'active' : ''}`}
              title="Pulse Cyan Accent"
            />
            <button
              type="button"
              onClick={() => setBorderColorTheme('00ff9d')}
              className={`accent-dot bg-[#00ff9d] ${borderColorTheme === '00ff9d' ? 'active' : ''}`}
              title="Pulse Green Accent"
            />
            <button
              type="button"
              onClick={() => setBorderColorTheme('d946ef')}
              className={`accent-dot bg-[#d946ef] ${borderColorTheme === 'd946ef' ? 'active' : ''}`}
              title="Pulse Magenta Accent"
            />
          </div>

          <button
            type="button"
            className="btn-icon-subtle"
            onClick={handleRefreshWidget}
            title="Reload Swap Widget"
          >
            <RefreshCw size={13} />
          </button>

          <a
            href="https://switch.win"
            target="_blank"
            rel="noopener noreferrer"
            className="switch-link-btn"
            title="Open Switch.win directly in new tab"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Embedded Switch.win Iframe Widget Frame */}
      <div className="switch-widget-wrapper">
        <iframe
          key={`${refreshKey}-${borderColorTheme}-${fromToken}-${toToken}`}
          src={iframeSrc}
          allow="clipboard-read; clipboard-write"
          width="100%"
          height={widgetHeight}
          className="switch-iframe"
          style={{ backgroundColor: '#080b11', colorScheme: 'dark' }}
          title="Switch.win PulseChain DEX Aggregator Widget"
        />
      </div>

      {/* Bottom Footer Info */}
      <div className="switch-footer-meta glass-panel">
        <div className="switch-footer-left">
          <span className="switch-footer-label">Partner Routing:</span>
          <code className="switch-footer-partner-code font-mono">
            {PARTNER_ADDRESS.slice(0, 6)}...{PARTNER_ADDRESS.slice(-4)}
          </code>
        </div>
        <div className="switch-footer-right">
          <ShieldCheck size={13} className="text-pulse-green" />
          <span className="switch-footer-security-text">Multi-AMM PulseChain Router</span>
        </div>
      </div>
    </div>
  )
}
