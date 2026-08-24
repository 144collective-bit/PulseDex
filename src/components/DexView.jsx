import { useState } from 'react'
import {
  Zap,
  Flame,
  Shield,
  TrendingUp,
  Activity,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react'
import TokenLogo from './TokenLogo'
import SwitchSwapWidget from './SwitchSwapWidget'
import { useUserProfile } from '../context/UserProfileContext'

// Ecosystem Live Price Estimates for Quick Board
const ECOSYSTEM_PRICES = [
  { symbol: 'PLS', name: 'PulseChain Native', price: '$0.00001455', change24h: '+4.2%', address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27' },
  { symbol: 'PLSX', name: 'PulseX AMM', price: '$0.00001880', change24h: '+7.8%', address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab' },
  { symbol: 'HEX', name: 'HEX Protocol', price: '$0.001920', change24h: '+2.1%', address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39' },
  { symbol: 'INC', name: 'Incentive Token', price: '$2.450', change24h: '+12.4%', address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d' },
  { symbol: 'DAI', name: 'DAI Stablecoin', price: '$1.000', change24h: '0.0%', address: '0xefd766ccb38eaf1dfd701853bfce31359239f305' },
  { symbol: 'TEXAN', name: 'Texan Token', price: '$0.000045', change24h: '+18.5%', address: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f' },
]

// Simulated Live Swaps Feed on PulseChain AMMs
const LIVE_DEX_FEED = [
  { id: 'tx-1', fromSym: 'PLS', toSym: 'PLSX', from: '25,000,000 PLS', to: '18,450 PLSX', valUsd: '$364.50', time: '12s ago', txHash: '0x8f4a...21c9' },
  { id: 'tx-2', fromSym: 'DAI', toSym: 'PLS', from: '1,500 DAI', to: '102,800,000 PLS', valUsd: '$1,500.00', time: '34s ago', txHash: '0x3e1b...99a4' },
  { id: 'tx-3', fromSym: 'INC', toSym: 'PLS', from: '45.8 INC', to: '7,800,000 PLS', valUsd: '$112.21', time: '1m ago', txHash: '0x7c92...11d0' },
  { id: 'tx-4', fromSym: 'HEX', toSym: 'PLS', from: '500,000 HEX', to: '65,200,000 PLS', valUsd: '$960.00', time: '2m ago', txHash: '0x44ab...e301' },
]

export default function DexView({ onSelectPairForChart, onOpenWalletModal }) {
  const { triggerSound } = useUserProfile()
  const [copiedAddr, setCopiedAddr] = useState(null)
  const [selectedTargetToken, setSelectedTargetToken] = useState('0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39') // HEX by default

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedAddr(text)
    triggerSound('click')
    setTimeout(() => setCopiedAddr(null), 2000)
  }

  const handleQuickTrade = (address) => {
    if (!address) return
    setSelectedTargetToken(address)
    triggerSound('click')
  }

  return (
    <div className="dex-view-container">
      {/* =========================================================================
          TOP INSTITUTIONAL TELEMETRY & ROUTER BAR
         ========================================================================= */}
      <div className="dex-subnav-bar glass-panel">
        <div className="dex-subnav-left">
          <div className="flex items-center gap-2 font-mono">
            <span className="dex-subtab-btn active">
              <Zap size={15} className="text-pulse-green" />
              <span>PulseChain DEX Aggregator</span>
            </span>
          </div>
        </div>

        {/* Live PulseChain On-Chain Telemetry */}
        <div className="dex-subnav-stats desktop-only">
          <span className="dex-stat-chip">
            <span className="live-dot"></span>
            <span className="dex-stat-label">Router:</span>
            <span className="dex-stat-val text-white font-mono">
              PulseX v2 (Online)
            </span>
          </span>
          <span className="dex-stat-chip">
            <Flame size={12} className="text-pulse-yellow" />
            <span className="dex-stat-label">Gas:</span>
            <span className="dex-stat-val font-mono text-pulse-yellow">150 Gwei</span>
          </span>
          <span className="dex-stat-chip">
            <Activity size={12} className="text-pulse-green" />
            <span className="dex-stat-label">Block:</span>
            <span className="dex-stat-val font-mono text-pulse-green">
              3.0s
            </span>
          </span>
        </div>
      </div>

      {/* =========================================================================
          PULSECHAIN DEX AGGREGATOR MAIN LAYOUT
         ========================================================================= */}
      <div className="dex-main-layout animate-fade-in">
        <div className="dex-swap-pro-grid">
          {/* Left Column: Customized Switch.win Aggregator Widget (At the very top) */}
          <div className="dex-swap-main-column">
            <SwitchSwapWidget initialTo={selectedTargetToken} key={selectedTargetToken} />
          </div>

            {/* Right Column: Companion Live Utility & Intelligence Sidebar */}
            <div className="dex-swap-sidebar-column">
              {/* 1. Core Ecosystem Live Market Board */}
              <div className="dex-utility-card glass-panel">
                <div className="dex-utility-header">
                  <div className="dex-card-title-group">
                    <TrendingUp size={15} className="text-pulse-green" />
                    <span className="dex-card-title">PulseChain Core Assets</span>
                  </div>
                  <span className="badge badge-green text-[10px] font-mono">Live Feeds</span>
                </div>

                <div className="dex-asset-ticker-list">
                  {ECOSYSTEM_PRICES.map((asset) => (
                    <div key={asset.symbol} className="dex-asset-ticker-row">
                      <div className="dex-ticker-left">
                        <TokenLogo symbol={asset.symbol} address={asset.address} size={28} />
                        <div className="dex-ticker-token-info">
                          <div className="dex-ticker-sym-row">
                            <span className="dex-ticker-sym">{asset.symbol}</span>
                            <span className="dex-ticker-name">{asset.name}</span>
                          </div>
                          <div className="dex-ticker-price font-mono">{asset.price}</div>
                        </div>
                      </div>

                      <div className="dex-ticker-right">
                        <span className={`badge ${asset.change24h.startsWith('+') ? 'badge-green' : 'badge-pulse'} dex-change-badge font-mono`}>
                          {asset.change24h}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary btn-xs dex-swap-action-btn"
                          onClick={() => handleQuickTrade(asset.address)}
                          title={`Select ${asset.symbol} in Swap`}
                        >
                          <span>Trade</span>
                          <ArrowRight size={10} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon-subtle dex-copy-btn"
                          onClick={() => handleCopy(asset.address)}
                          title="Copy Contract Address"
                        >
                          {copiedAddr === asset.address ? <Check size={12} className="text-pulse-green" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. DEX Routing & AMM Protocol Health */}
              <div className="dex-utility-card glass-panel">
                <div className="dex-utility-header">
                  <div className="dex-card-title-group">
                    <Shield size={15} className="text-pulse-cyan" />
                    <span className="dex-card-title">Routing & Execution Health</span>
                  </div>
                  <span className="badge badge-pulse text-[10px] font-mono">Zero Fee Surcharge</span>
                </div>

                <div className="dex-health-rows">
                  <div className="dex-health-item">
                    <span className="dex-health-label">PulseX v2 AMM Pool</span>
                    <span className="dex-health-val text-pulse-green">
                      <span className="live-dot"></span>
                      <span>0.29% Liquidity Fee</span>
                    </span>
                  </div>
                  <div className="dex-health-item">
                    <span className="dex-health-label">PulseX v1 Router Contract</span>
                    <span className="dex-health-val font-mono text-white">0x98bf...cc02</span>
                  </div>
                  <div className="dex-health-item">
                    <span className="dex-health-label">Average PulseChain Gas</span>
                    <span className="dex-health-val font-mono text-pulse-yellow font-bold">~150 Gwei (&lt;$0.0001)</span>
                  </div>
                  <div className="dex-health-item no-border">
                    <span className="dex-health-label">Anti-MEV Frontrun Protection</span>
                    <span className="dex-health-val text-pulse-cyan font-semibold">Active via Switch Router</span>
                  </div>
                </div>
              </div>

              {/* 3. Live Large DEX Swaps Ticker */}
              <div className="dex-utility-card glass-panel">
                <div className="dex-utility-header">
                  <div className="dex-card-title-group">
                    <Activity size={15} className="text-pulse-purple" />
                    <span className="dex-card-title">Live Swap Activity</span>
                  </div>
                  <span className="dex-feed-sub-badge font-mono">PulseChain AMMs</span>
                </div>

                <div className="dex-live-feed">
                  {LIVE_DEX_FEED.map((feed) => (
                    <div key={feed.id} className="dex-feed-item">
                      <div className="dex-feed-top-row">
                        <div className="dex-feed-pair">
                          <TokenLogo symbol={feed.fromSym} size={16} />
                          <span className="dex-feed-amount">{feed.from}</span>
                          <span className="dex-feed-arrow">➔</span>
                          <TokenLogo symbol={feed.toSym} size={16} />
                          <span className="dex-feed-amount">{feed.to}</span>
                        </div>
                        <span className="dex-feed-usd font-mono">{feed.valUsd}</span>
                      </div>
                      <div className="dex-feed-bottom-row font-mono">
                        <span className="dex-feed-hash">{feed.txHash}</span>
                        <span className="dex-feed-time">{feed.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}
