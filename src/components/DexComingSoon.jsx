import { Route, Gauge, ShieldCheck, PenLine, Layers, Activity } from 'lucide-react'

/* Build board — reads like a status feed rather than marketing copy. */
const MODULES = [
  {
    id: '01',
    name: 'Pair & Liquidity Indexer',
    detail: 'Pool discovery, reserve reads, depth snapshots',
    status: 'online',
  },
  {
    id: '02',
    name: 'Multi-AMM Route Solver',
    detail: 'Split-path search across v1 / v2 / 9mm pools',
    status: 'building',
  },
  {
    id: '03',
    name: 'Price Impact Engine',
    detail: 'Slippage and impact quoted against real pool depth',
    status: 'building',
  },
  {
    id: '04',
    name: 'Pre-Trade Safety Checks',
    detail: 'Honeypot, transfer tax and liquidity-lock screening',
    status: 'queued',
  },
  {
    id: '05',
    name: 'Wallet Signing & Broadcast',
    detail: 'Route execution against the connected wallet',
    status: 'queued',
  },
]

const STATUS_LABEL = { online: 'Online', building: 'Building', queued: 'Queued' }

const CAPABILITIES = [
  {
    icon: Route,
    title: 'Split Routing',
    desc: 'One order divided across several pools when a single path cannot fill it cleanly.',
  },
  {
    icon: Gauge,
    title: 'Depth-Aware Quotes',
    desc: 'Impact calculated from live reserves, not a flat percentage guess.',
  },
  {
    icon: ShieldCheck,
    title: 'Contract Screening',
    desc: 'Tax, honeypot and lock status surfaced on the route before you sign.',
  },
  {
    icon: PenLine,
    title: 'Sign In Place',
    desc: 'Execute from the chart you are already reading. No tab switching.',
  },
]

const VENUES = ['PulseX v1', 'PulseX v2', '9mm', 'Piteas', 'PulseX Stable']

export default function DexComingSoon() {
  const online = MODULES.filter((m) => m.status === 'online').length

  return (
    <div className="dex-soon-view">
      {/* ── Header ── */}
      <section className="dex-soon-head">
        <div className="dex-soon-grid-texture" aria-hidden="true" />

        <div className="dex-soon-head-inner">
          <div className="dex-soon-eyebrow font-mono">
            <span className="dex-soon-dot" aria-hidden="true" />
            <span>Module</span>
            <span className="dex-soon-eyebrow-sep">//</span>
            <span>In Development</span>
          </div>

          <h1 className="dex-soon-title font-mono">
            Swap <span className="dex-soon-title-accent">Terminal</span>
          </h1>

          <p className="dex-soon-lede">
            A native aggregator inside the screener. Route, price and execute against PulseChain
            liquidity without leaving the chart you are already watching.
          </p>

          <dl className="dex-soon-meta font-mono">
            <div className="dex-soon-meta-item">
              <dt>Target</dt>
              <dd>PulseChain · 369</dd>
            </div>
            <div className="dex-soon-meta-item">
              <dt>Venues</dt>
              <dd>{VENUES.length} routed</dd>
            </div>
            <div className="dex-soon-meta-item">
              <dt>Modules</dt>
              <dd>
                {online} / {MODULES.length} online
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Build board ── */}
      <section className="dex-soon-panel">
        <header className="dex-soon-panel-head">
          <Activity size={13} className="text-pulse-cyan" />
          <h2 className="dex-soon-panel-title font-mono">Build Status</h2>
          <span className="dex-soon-panel-note font-mono">{MODULES.length} subsystems</span>
        </header>

        <ul className="dex-soon-modules">
          {MODULES.map((m) => (
            <li key={m.id} className={`dex-soon-module status-${m.status}`}>
              <span className="dex-soon-module-id font-mono">{m.id}</span>
              <span className="dex-soon-module-body">
                <span className="dex-soon-module-name">{m.name}</span>
                <span className="dex-soon-module-detail">{m.detail}</span>
              </span>
              <span className="dex-soon-status font-mono">
                <span className="dex-soon-status-led" aria-hidden="true" />
                {STATUS_LABEL[m.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Capabilities ── */}
      <section className="dex-soon-panel">
        <header className="dex-soon-panel-head">
          <Layers size={13} className="text-pulse-cyan" />
          <h2 className="dex-soon-panel-title font-mono">What It Will Do</h2>
        </header>

        <div className="dex-soon-caps">
          {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
            <article key={title} className="dex-soon-cap">
              <span className="dex-soon-cap-badge">
                <Icon size={14} />
              </span>
              <h3 className="dex-soon-cap-title font-mono">{title}</h3>
              <p className="dex-soon-cap-desc">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Routing venues ── */}
      <section className="dex-soon-panel">
        <header className="dex-soon-panel-head">
          <Route size={13} className="text-pulse-cyan" />
          <h2 className="dex-soon-panel-title font-mono">Routing Across</h2>
        </header>
        <div className="dex-soon-venues">
          {VENUES.map((v) => (
            <span key={v} className="dex-soon-venue font-mono">
              {v}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
