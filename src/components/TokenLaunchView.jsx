import { Sparkles, AlertCircle, TrendingUp, Flame, Route, Gauge } from 'lucide-react'

const BUILDING_BLOCKS = [
  {
    icon: TrendingUp,
    title: 'Screener',
    desc: 'Real-time PulseChain pair discovery, ranking and analytics.',
  },
  {
    icon: Flame,
    title: 'Trenches',
    desc: 'Fresh liquidity and fair-launch tracking as it happens.',
  },
  {
    icon: Route,
    title: 'DEX Aggregator',
    desc: 'Routing across PulseX, 9mm, 9inch and more in one swap.',
  },
  {
    icon: Gauge,
    title: 'Portfolio Tracker',
    desc: 'Live holdings, valuations and PnL for any PulseChain wallet.',
  },
]

export default function TokenLaunchView() {
  return (
    <div className="token-launch-view">
      {/* ── Header ── */}
      <section className="token-launch-head">
        <div className="token-launch-grid-texture" aria-hidden="true" />

        <div className="token-launch-head-inner">
          <div className="token-launch-eyebrow font-mono">
            <span className="token-launch-dot" aria-hidden="true" />
            <span>Platform Token</span>
            <span className="token-launch-eyebrow-sep">//</span>
            <span>Pre-Launch</span>
          </div>

          <h1 className="token-launch-title font-mono">
            <span className="token-launch-title-accent">$DEX</span>
          </h1>

          <p className="token-launch-lede">
            The native token for the PulseDex platform. It hasn't launched yet — we're building
            the product first and will bring $DEX to market when it's ready, not on a countdown.
          </p>

          <dl className="token-launch-meta font-mono">
            <div className="token-launch-meta-item">
              <dt>Status</dt>
              <dd>Not Launched</dd>
            </div>
            <div className="token-launch-meta-item">
              <dt>Network</dt>
              <dd>PulseChain · 369</dd>
            </div>
            <div className="token-launch-meta-item">
              <dt>Contract</dt>
              <dd>Not Deployed</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Scam warning ── */}
      <section className="token-launch-warning">
        <AlertCircle size={16} className="token-launch-warning-icon" />
        <div>
          <h2 className="token-launch-warning-title font-mono">No token exists yet</h2>
          <p className="token-launch-warning-body">
            $DEX has not been deployed, listed or sold anywhere. Any contract, presale, or link
            claiming to be $DEX is a scam. The only official announcement will appear right here,
            on this page, the moment that changes.
          </p>
        </div>
      </section>

      {/* ── What's being built first ── */}
      <section className="token-launch-panel">
        <header className="token-launch-panel-head">
          <Sparkles size={13} className="text-pulse-cyan" />
          <h2 className="token-launch-panel-title font-mono">What We're Building First</h2>
        </header>

        <div className="token-launch-blocks">
          {BUILDING_BLOCKS.map(({ icon: Icon, title, desc }) => (
            <article key={title} className="token-launch-block">
              <span className="token-launch-block-badge">
                <Icon size={14} />
              </span>
              <h3 className="token-launch-block-title font-mono">{title}</h3>
              <p className="token-launch-block-desc">{desc}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
