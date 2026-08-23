import { useState, useEffect } from 'react'
import {
  Flame,
  Search,
  Plus,
  Trash2,
  Compass,
  ArrowUpRight,
} from 'lucide-react'

// Default Curated Ecosystem Links with Verified Logos
const DEFAULT_ECOSYSTEM_APPS = [
  {
    id: 'plsx-fun',
    name: 'plsx.fun (Trenches)',
    url: 'https://plsx.fun/trenches',
    category: 'launchpads',
    badge: 'Trending Launchpad',
    badgeColor: 'amber',
    logo: '/apps/plsx-fun.png',
    icon: '🔥',
    desc: 'PulseChain fair-launch bonding curve terminal. Trade early meme tokens before they hit PulseX.',
    tags: ['Bonding Curve', 'Fair Launch', 'Meme Coins'],
    featured: true,
  },
  {
    id: 'pump-tires',
    name: 'pump.tires',
    url: 'https://pump.tires',
    category: 'launchpads',
    badge: 'Meme Terminal',
    badgeColor: 'cyan',
    logo: '/apps/pump-tires.png',
    icon: '🛞',
    desc: 'High-octane fair-launch bonding curve launchpad and meme trading arena for PulseChain degens.',
    tags: ['Fair Launch', 'Fast Trading', 'Sniper'],
    featured: true,
  },
  {
    id: 'pulsex',
    name: 'PulseX AMM (V1 & V2)',
    url: 'https://app.pulsex.com',
    category: 'dex',
    badge: 'Official DEX',
    badgeColor: 'green',
    logo: '/apps/pulsex.png',
    icon: '⚡',
    desc: "PulseChain's flagship decentralized exchange. Deepest on-chain liquidity, AMM swap & yield farms.",
    tags: ['DEX', 'Liquidity Pools', 'Yield Farms'],
    featured: true,
  },
  {
    id: 'libertyswap',
    name: 'LibertySwap',
    url: 'https://libertyswap.finance',
    category: 'dex',
    badge: 'DEX & Pools',
    badgeColor: 'cyan',
    logo: '/apps/libertyswap.png',
    icon: '🗽',
    desc: 'PulseChain decentralized exchange, high-yield liquidity pools, and low-slippage token swaps.',
    tags: ['DEX', 'Swaps', 'Yield Pools'],
    featured: true,
  },
  {
    id: 'zkxwallet',
    name: 'ZKX Wallet',
    url: 'https://zkxwallet.com',
    category: 'security',
    badge: 'Web3 Wallet',
    badgeColor: 'purple',
    logo: '/apps/zkxwallet.png',
    icon: '👛',
    desc: 'Next-generation Web3 account-abstraction wallet with native PulseChain support and advanced self-custody.',
    tags: ['Wallet', 'DeFi', 'Security'],
    featured: true,
  },
  {
    id: 'provex',
    name: 'Provex (PRVX)',
    url: 'https://provex.com',
    category: 'dex',
    badge: 'Ecosystem Hub',
    badgeColor: 'amber',
    logo: '/apps/provex.png',
    icon: '💎',
    desc: 'Provex decentralized protocol utilities, ecosystem hub, and community terminal on PulseChain.',
    tags: ['PRVX', 'Trading', 'Ecosystem'],
    featured: true,
  },
  {
    id: 'pulsescan',
    name: 'PulseScan Explorer',
    url: 'https://scan.pulsechain.com',
    category: 'security',
    badge: 'Explorer',
    badgeColor: 'cyan',
    logo: '/apps/pulsescan.png',
    icon: '🔍',
    desc: 'Official block explorer for PulseChain. Inspect PRC-20 contracts, wallet balances, whale transactions.',
    tags: ['Explorer', 'Contracts', 'Holders'],
    featured: false,
  },
  {
    id: 'pulse-bridge',
    name: 'PulseChain Bridge',
    url: 'https://bridge.pulsechain.com',
    category: 'bridges',
    badge: 'Official Bridge',
    badgeColor: 'purple',
    logo: '/apps/pulse-bridge.png',
    icon: '🌉',
    desc: 'Cross-chain trustless bridge between Ethereum Mainnet and PulseChain for ETH, ERC-20s, and DAI.',
    tags: ['Bridge', 'Ethereum', 'Cross-Chain'],
    featured: false,
  },
  {
    id: 'gopulse',
    name: 'GoPulse Portfolio',
    url: 'https://gopulse.com',
    category: 'analytics',
    badge: 'Analytics',
    badgeColor: 'green',
    logo: '/apps/gopulse.png',
    icon: '📊',
    desc: 'Real-time ecosystem metrics, PLS supply stats, validator counts, and portfolio tracking.',
    tags: ['Analytics', 'Staking', 'Validators'],
    featured: false,
  },
  {
    id: 'piteas',
    name: 'Piteas DEX Aggregator',
    url: 'https://piteas.io',
    category: 'dex',
    badge: 'Aggregator',
    badgeColor: 'amber',
    logo: '/apps/piteas.png',
    icon: '🧭',
    desc: 'Smart DEX order routing across PulseX V1, PulseX V2, 9mm, and Phux for optimal execution and low slippage.',
    tags: ['Aggregator', 'Best Rates', 'Multi-Routing'],
    featured: false,
  },
  {
    id: 'nine-mm',
    name: '9mm DEX',
    url: 'https://9mm.pro',
    category: 'dex',
    badge: 'DEX',
    badgeColor: 'cyan',
    logo: '/apps/nine-mm.png',
    icon: '🎯',
    desc: 'High-speed decentralized exchange and liquidity incentive protocol on PulseChain.',
    tags: ['AMM', 'Incentives', 'Trading'],
    featured: false,
  },
  {
    id: 'revoke-cash',
    name: 'Revoke.cash Approvals',
    url: 'https://revoke.cash',
    category: 'security',
    badge: 'Wallet Security',
    badgeColor: 'purple',
    logo: '/apps/revoke-cash.png',
    icon: '🛡️',
    desc: 'Check and revoke unlimited token allowances to protect your wallet against compromised smart contracts.',
    tags: ['Security', 'Revoke', 'Allowances'],
    featured: false,
  },
  {
    id: 'coast-usd',
    name: 'Coast (0xCoast)',
    url: 'https://0xcoast.com',
    category: 'bridges',
    badge: 'Fiat On-Ramp',
    badgeColor: 'green',
    logo: '/apps/coast-usd.png',
    icon: '🏖️',
    desc: 'Direct USD fiat-to-crypto on-ramp and off-ramp for PulseChain CST and PLS.',
    tags: ['Fiat On-Ramp', 'USD', 'Banking'],
    featured: false,
  },
  {
    id: 'phux',
    name: 'Phux Protocol',
    url: 'https://phux.io',
    category: 'dex',
    badge: 'Stable AMM',
    badgeColor: 'amber',
    logo: '/apps/phux.png',
    icon: '🌊',
    desc: 'Balancer-style multi-token pools and capital-efficient stablecoin swap AMM on PulseChain.',
    tags: ['Stable Swap', 'Liquidity Pools'],
    featured: false,
  },
]

export default function TrenchesView() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [customLinks, setCustomLinks] = useState([])

  // Custom App Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [newAppUrl, setNewAppUrl] = useState('')
  const [newAppCategory, setNewAppCategory] = useState('tools')
  const [newAppDesc, setNewAppDesc] = useState('')

  // Load custom links from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pulse_trenches_custom_links')
      if (saved) setCustomLinks(JSON.parse(saved))
    } catch (e) {
      console.error('Error loading custom links:', e)
    }
  }, [])

  // Save custom links
  const saveCustomLinks = (items) => {
    setCustomLinks(items)
    localStorage.setItem('pulse_trenches_custom_links', JSON.stringify(items))
  }

  const handleAddCustomApp = (e) => {
    e.preventDefault()
    if (!newAppName.trim() || !newAppUrl.trim()) return

    let formattedUrl = newAppUrl.trim()
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`
    }

    const newItem = {
      id: `custom-${Date.now()}`,
      name: newAppName.trim(),
      url: formattedUrl,
      category: newAppCategory,
      badge: 'Custom',
      badgeColor: 'cyan',
      icon: '🔗',
      desc: newAppDesc.trim() || 'User bookmark tool for trading.',
      tags: ['Custom', 'Bookmark'],
      isCustom: true,
    }

    const updated = [newItem, ...customLinks]
    saveCustomLinks(updated)
    setNewAppName('')
    setNewAppUrl('')
    setNewAppDesc('')
    setShowAddModal(false)
  }

  const handleRemoveCustomApp = (id, e) => {
    e.stopPropagation()
    const updated = customLinks.filter((item) => item.id !== id)
    saveCustomLinks(updated)
  }

  // Combine default apps with custom user links
  const allApps = [...customLinks, ...DEFAULT_ECOSYSTEM_APPS]

  // Filter apps
  const filteredApps = allApps.filter((app) => {
    const matchesCategory =
      activeCategory === 'all'
        ? true
        : activeCategory === 'featured'
        ? app.featured
        : app.category === activeCategory

    const matchesSearch =
      !searchQuery ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesSearch
  })

  return (
    <div className="trenches-page-container">
      {/* ⚔️ HERO BANNER */}
      <section className="trenches-hero glass-panel">
        <div className="trenches-hero-content">
          <div className="trenches-badge font-mono">
            <Flame size={14} className="text-pulse-amber animate-pulse" />
            <span>PULSECHAIN DEGEN TERMINAL</span>
            <span className="trenches-live-tag">LIVE</span>
          </div>

          <h1 className="trenches-title">
            THE <span className="text-gradient-amber">TRENCHES</span>
          </h1>

          <p className="trenches-subtitle">
            Direct gateway to PulseChain bonding-curve launchpads, meme arenas, and essential DeFi portals.
          </p>

          {/* Quick Ecosystem Metrics Strip */}
          <div className="trenches-stats-strip font-mono">
            <div className="t-stat">
              <span className="t-stat-label">PRIMARY LAUNCHPAD</span>
              <div className="t-stat-val-with-logo text-pulse-amber">
                <img src="/apps/plsx-fun.png" alt="plsx.fun" className="t-stat-mini-logo" />
                <span>plsx.fun</span>
              </div>
            </div>
            <div className="t-stat-divider"></div>
            <div className="t-stat">
              <span className="t-stat-label">MEME ARENA</span>
              <div className="t-stat-val-with-logo text-pulse-cyan">
                <img src="/apps/pump-tires.png" alt="pump.tires" className="t-stat-mini-logo" />
                <span>pump.tires</span>
              </div>
            </div>
            <div className="t-stat-divider"></div>
            <div className="t-stat">
              <span className="t-stat-label">FLAGSHIP AMM</span>
              <div className="t-stat-val-with-logo text-pulse-green">
                <img src="/apps/pulsex.png" alt="PulseX" className="t-stat-mini-logo" />
                <span>PulseX V2</span>
              </div>
            </div>
            <div className="t-stat-divider"></div>
            <div className="t-stat">
              <span className="t-stat-label">NETWORK GAS</span>
              <span className="t-stat-val text-white">~150 Gwei</span>
            </div>
          </div>
        </div>
      </section>

      {/* 🌐 ECOSYSTEM & LAUNCHPAD DIRECTORY */}
      <section className="trenches-directory-section">
        <div className="directory-header">
          <div className="directory-title-block">
            <h2 className="directory-heading font-mono">
              <Compass size={20} className="text-pulse-cyan" />
              <span>TERMINAL APPS & GATEWAYS</span>
            </h2>
            <p className="directory-sub">Curated directory of launchpads, meme arenas, and DEX tools.</p>
          </div>

          <div className="directory-actions">
            {/* Search filter */}
            <div className="dir-search-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search tools or launchpads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dir-search-input font-mono"
              />
            </div>

            {/* Add Custom Tool button */}
            <button className="btn-add-custom-tool" onClick={() => setShowAddModal(true)}>
              <Plus size={15} />
              <span>Add Custom Link</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="directory-categories-bar font-mono">
          <button
            className={`cat-tab ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All Portals ({allApps.length})
          </button>
          <button
            className={`cat-tab ${activeCategory === 'featured' ? 'active' : ''}`}
            onClick={() => setActiveCategory('featured')}
          >
            🔥 Featured Launchpads
          </button>
          <button
            className={`cat-tab ${activeCategory === 'launchpads' ? 'active' : ''}`}
            onClick={() => setActiveCategory('launchpads')}
          >
            🚀 Meme & Fair Launch
          </button>
          <button
            className={`cat-tab ${activeCategory === 'dex' ? 'active' : ''}`}
            onClick={() => setActiveCategory('dex')}
          >
            ⚡ DEXs & Swaps
          </button>
          <button
            className={`cat-tab ${activeCategory === 'security' ? 'active' : ''}`}
            onClick={() => setActiveCategory('security')}
          >
            🛡️ Security & Wallets
          </button>
          <button
            className={`cat-tab ${activeCategory === 'bridges' ? 'active' : ''}`}
            onClick={() => setActiveCategory('bridges')}
          >
            🌉 Bridges & On-Ramps
          </button>
          <button
            className={`cat-tab ${activeCategory === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveCategory('analytics')}
          >
            📊 Analytics
          </button>
        </div>

        {/* App Cards Grid */}
        <div className="directory-cards-grid">
          {filteredApps.map((app) => (
            <div key={app.id} className={`trench-card glass-panel ${app.featured ? 'featured-card' : ''}`}>
              <div className="trench-card-top">
                <div className="trench-logo-avatar-frame">
                  {app.logo ? (
                    <img
                      src={app.logo}
                      alt={`${app.name} logo`}
                      className="trench-app-img-logo"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextSibling) {
                          e.currentTarget.nextSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : (
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(app.url).hostname}&sz=128`}
                      alt={`${app.name} logo`}
                      className="trench-app-img-logo"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextSibling) {
                          e.currentTarget.nextSibling.style.display = 'flex'
                        }
                      }}
                    />
                  )}
                  <div className="trench-fallback-icon" style={{ display: 'none' }}>
                    {app.icon || '🔗'}
                  </div>
                </div>

                <div className="trench-badge-wrap">
                  <span className={`badge badge-${app.badgeColor || 'cyan'} font-mono`}>
                    {app.badge}
                  </span>
                  {app.isCustom && (
                    <button
                      className="btn-del-custom"
                      onClick={(e) => handleRemoveCustomApp(app.id, e)}
                      title="Remove Bookmark"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="trench-card-title-row">
                <h3 className="trench-app-name font-mono">{app.name}</h3>
                <span className="trench-app-url font-mono">{new URL(app.url).hostname}</span>
              </div>
              <p className="trench-app-desc">{app.desc}</p>

              <div className="trench-tags-row font-mono">
                {app.tags?.map((t) => (
                  <span key={t} className="trench-tag">
                    #{t}
                  </span>
                ))}
              </div>

              <div className="trench-card-footer">
                <a
                  href={app.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-launch-app font-mono"
                >
                  <span>Launch Application</span>
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MODAL: ADD CUSTOM LINK */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-card glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-mono">Add Custom Portal / Bookmark</h3>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomApp} className="modal-form font-mono">
              <div className="form-group">
                <label>Portal / Tool Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Sniper Bot / Telegram Gateway"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div className="form-group">
                <label>Website / dApp URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newAppUrl}
                  onChange={(e) => setNewAppUrl(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={newAppCategory}
                  onChange={(e) => setNewAppCategory(e.target.value)}
                  className="modal-select"
                >
                  <option value="launchpads">Meme & Launchpads</option>
                  <option value="dex">DEXs & Trading</option>
                  <option value="security">Security & Auditing</option>
                  <option value="bridges">Bridges & On-Ramps</option>
                  <option value="analytics">Analytics</option>
                  <option value="tools">General Tools</option>
                </select>
              </div>

              <div className="form-group">
                <label>Short Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fast sniper bot for meme launches"
                  value={newAppDesc}
                  onChange={(e) => setNewAppDesc(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit">
                  Save Portal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
