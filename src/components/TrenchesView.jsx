import { useState, useEffect } from 'react'
import {
  Flame,
  Search,
  Plus,
  Trash2,
  Compass,
  ArrowUpRight,
  ExternalLink,
  Zap,
  Shield,
  Droplets,
  Layers,
  Sparkles,
  Bookmark,
  Activity,
  Globe,
} from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'
import { safeExternalUrl } from '../utils/formatters'

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
    desc: 'PulseChain fair-launch bonding curve terminal. Trade early meme tokens before they migrate to PulseX.',
    tags: ['Bonding Curve', 'Fair Launch', 'Meme Coins'],
    featured: true,
  },
  {
    id: 'pump-tires',
    name: 'pump.tires',
    url: 'https://pump.tires',
    category: 'launchpads',
    badge: 'Meme Arena',
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
    desc: "PulseChain's flagship decentralized exchange. Deepest on-chain liquidity, AMM swaps, and yield farms.",
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
    badge: 'Block Explorer',
    badgeColor: 'cyan',
    logo: '/apps/pulsescan.png',
    icon: '🔍',
    desc: 'Official block explorer for PulseChain. Inspect PRC-20 contracts, wallet balances, and whale transactions.',
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
  const { triggerSound } = useUserProfile()
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [customLinks, setCustomLinks] = useState([])

  // Custom App Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [newAppUrl, setNewAppUrl] = useState('')
  const [newAppCategory, setNewAppCategory] = useState('launchpads')
  const [newAppDesc, setNewAppDesc] = useState('')
  const [addAppError, setAddAppError] = useState('')

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
    setAddAppError('')
    if (!newAppName.trim() || !newAppUrl.trim()) return

    const rawUrl = newAppUrl.trim()
    const hasScheme = /^https?:\/\//i.test(rawUrl)
    const formattedUrl = safeExternalUrl(hasScheme ? rawUrl : `https://${rawUrl}`)
    if (!formattedUrl) {
      setAddAppError('Enter a valid web address, for example pulsex.com')
      return
    }

    const newItem = {
      id: `custom-${Date.now()}`,
      name: newAppName.trim(),
      url: formattedUrl,
      category: newAppCategory,
      badge: 'Custom Bookmark',
      badgeColor: 'cyan',
      icon: '🔗',
      desc: newAppDesc.trim() || 'User bookmarked portal for quick trading access.',
      tags: ['Custom', 'Bookmark'],
      isCustom: true,
      featured: false,
    }

    const updated = [newItem, ...customLinks]
    saveCustomLinks(updated)
    setNewAppName('')
    setNewAppUrl('')
    setNewAppDesc('')
    setShowAddModal(false)
    triggerSound('click')
  }

  const handleRemoveCustomApp = (id, e) => {
    e.stopPropagation()
    const updated = customLinks.filter((item) => item.id !== id)
    saveCustomLinks(updated)
    triggerSound('click')
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
      {/* ⚔️ HERO BANNER WITH PLSX.FUN SHOWCASE */}
      <section className="trenches-hero glass-panel">
        <div className="trenches-hero-grid-layout">
          {/* Left Column: Title, Subtitle & Quick Stats */}
          <div className="trenches-hero-content">
            <div className="trenches-badge">
              <Flame size={14} className="text-pulse-amber animate-pulse" />
              <span>PULSECHAIN DEGEN TERMINAL</span>
              <span className="trenches-live-tag">LIVE</span>
            </div>

            <h1 className="trenches-title">
              THE <span className="text-gradient-amber">TRENCHES</span>
            </h1>

            <p className="trenches-subtitle">
              Instant gateway to PulseChain bonding-curve launchpads, early meme arenas, and verified DeFi terminals.
            </p>

            {/* Quick Ecosystem Metrics Strip */}
            <div className="trenches-stats-strip">
              <a
                href="https://plsx.fun/trenches"
                target="_blank"
                rel="noopener noreferrer"
                className="t-stat-pill hover:border-pulse-amber/50 transition-all"
              >
                <span className="t-stat-label">PRIMARY LAUNCHPAD</span>
                <div className="t-stat-val text-pulse-amber flex items-center gap-1.5">
                  <img src="/apps/plsx-fun.png" alt="plsx.fun" className="t-stat-mini-logo" />
                  <span className="font-bold font-mono">plsx.fun</span>
                  <ArrowUpRight size={12} />
                </div>
              </a>

              <a
                href="https://pump.tires"
                target="_blank"
                rel="noopener noreferrer"
                className="t-stat-pill hover:border-pulse-cyan/50 transition-all"
              >
                <span className="t-stat-label">MEME ARENA</span>
                <div className="t-stat-val text-pulse-cyan flex items-center gap-1.5">
                  <img src="/apps/pump-tires.png" alt="pump.tires" className="t-stat-mini-logo" />
                  <span className="font-bold font-mono">pump.tires</span>
                  <ArrowUpRight size={12} />
                </div>
              </a>

              <a
                href="https://app.pulsex.com"
                target="_blank"
                rel="noopener noreferrer"
                className="t-stat-pill hover:border-pulse-green/50 transition-all"
              >
                <span className="t-stat-label">FLAGSHIP AMM</span>
                <div className="t-stat-val text-pulse-green flex items-center gap-1.5">
                  <img src="/apps/pulsex.png" alt="PulseX" className="t-stat-mini-logo" />
                  <span className="font-bold font-mono">PulseX v2</span>
                  <ArrowUpRight size={12} />
                </div>
              </a>

              <div className="t-stat-pill">
                <span className="t-stat-label">NETWORK GAS</span>
                <div className="t-stat-val text-pulse-yellow font-bold font-mono">
                  ~150 Gwei (&lt;$0.0001)
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Large plsx.fun Featured Showcase Card */}
          <div className="trenches-hero-feature-showcase">
            <div className="trenches-featured-hero-card glass-panel glow-amber">
              <div className="featured-hero-top">
                <div className="featured-hero-logo-wrap">
                  <img src="/apps/plsx-fun.png" alt="plsx.fun Logo" className="featured-hero-logo" />
                  <div className="featured-hero-pulse-glow"></div>
                </div>
                <div className="featured-hero-badge-col">
                  <span className="badge badge-amber font-mono text-[10.5px] font-bold">
                    🔥 MAIN TRENCHES FEATURE
                  </span>
                  <h2 className="featured-hero-brand-name font-mono font-bold text-white text-xl flex items-center gap-1.5 mt-0.5">
                    <span>plsx.fun</span>
                    <span className="text-pulse-amber text-xs font-normal">/trenches</span>
                  </h2>
                </div>
              </div>

              <p className="featured-hero-desc text-xs text-slate-300">
                PulseChain's premier fair-launch bonding curve launchpad. Deploy or snipe new tokens with 100% fair launch and automated liquidity migration straight into PulseX.
              </p>

              <div className="featured-hero-perks font-mono text-[11px]">
                <div className="perk-chip">
                  <Sparkles size={12} className="text-pulse-amber" />
                  <span>Fair Launch</span>
                </div>
                <div className="perk-chip">
                  <Shield size={12} className="text-pulse-green" />
                  <span>Anti-Rug Curve</span>
                </div>
                <div className="perk-chip">
                  <Zap size={12} className="text-pulse-cyan" />
                  <span>Auto PulseX Migration</span>
                </div>
              </div>

              <a
                href="https://plsx.fun/trenches"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-launch-hero-feature btn-primary w-full justify-center py-2.5 text-xs font-bold font-mono flex items-center gap-2"
              >
                <span>Enter plsx.fun Trenches</span>
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 🌐 ECOSYSTEM & LAUNCHPAD DIRECTORY */}
      <section className="trenches-directory-section">
        <div className="directory-header glass-panel">
          <div className="directory-title-block">
            <div className="flex items-center gap-2">
              <Compass size={18} className="text-pulse-cyan" />
              <h2 className="directory-heading font-bold text-white text-sm tracking-tight">TERMINAL APPS & GATEWAYS</h2>
            </div>
            <p className="directory-sub text-xs text-muted mt-0.5">Curated directory of launchpads, meme arenas, and DEX tools on PulseChain.</p>
          </div>

          <div className="directory-actions">
            {/* Search filter */}
            <div className="dir-search-wrap">
              <Search size={13} className="search-icon text-muted" />
              <input
                type="text"
                placeholder="Search portals or launchpads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dir-search-input font-mono"
              />
              {searchQuery && (
                <button className="market-clear-search" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>

            {/* Add Custom Tool button */}
            <button
              className="btn-add-custom-tool btn-primary btn-sm font-semibold flex items-center gap-1.5"
              onClick={() => {
                setShowAddModal(true)
                triggerSound('click')
              }}
            >
              <Plus size={14} />
              <span>Add Custom Link</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="directory-categories-bar font-mono">
          <button
            className={`cat-tab ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('all')
              triggerSound('click')
            }}
          >
            All Portals ({allApps.length})
          </button>
          <button
            className={`cat-tab ${activeCategory === 'featured' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('featured')
              triggerSound('click')
            }}
          >
            🔥 Featured
          </button>
          <button
            className={`cat-tab ${activeCategory === 'launchpads' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('launchpads')
              triggerSound('click')
            }}
          >
            🚀 Meme & Launchpads
          </button>
          <button
            className={`cat-tab ${activeCategory === 'dex' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('dex')
              triggerSound('click')
            }}
          >
            ⚡ DEXs & Swaps
          </button>
          <button
            className={`cat-tab ${activeCategory === 'security' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('security')
              triggerSound('click')
            }}
          >
            🛡️ Security & Wallets
          </button>
          <button
            className={`cat-tab ${activeCategory === 'bridges' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('bridges')
              triggerSound('click')
            }}
          >
            🌉 Bridges & On-Ramps
          </button>
          <button
            className={`cat-tab ${activeCategory === 'analytics' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('analytics')
              triggerSound('click')
            }}
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
                  <span className={`badge badge-${app.badgeColor || 'cyan'} font-mono text-[10.5px]`}>
                    {app.badge}
                  </span>
                  {app.isCustom && (
                    <button
                      className="btn-del-custom text-pulse-red hover:opacity-80 p-1"
                      onClick={(e) => handleRemoveCustomApp(app.id, e)}
                      title="Remove Bookmark"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="trench-card-title-row">
                <h3 className="trench-app-name font-bold text-white text-sm">{app.name}</h3>
                <span className="trench-app-url font-mono text-[11px] text-muted">{new URL(app.url).hostname}</span>
              </div>

              <p className="trench-app-desc text-xs text-slate-300">{app.desc}</p>

              <div className="trench-tags-row font-mono">
                {app.tags?.map((t) => (
                  <span key={t} className="trench-tag text-[10.5px]">
                    #{t}
                  </span>
                ))}
              </div>

              <div className="trench-card-footer">
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-launch-app btn-primary w-full justify-center py-2.5 text-xs font-bold"
                >
                  <span>Launch Terminal</span>
                  <ArrowUpRight size={14} />
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
            <div className="modal-header pb-3 border-b border-subtle flex items-center justify-between">
              <h3 className="font-bold text-white text-base">Add Custom PulseChain Bookmark</h3>
              <button className="wallet-modal-close-btn" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomApp} className="modal-form font-mono my-4 flex flex-col gap-3">
              <div className="form-group flex flex-col gap-1">
                <label className="text-xs text-muted font-sans font-medium">Portal / Tool Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Sniper Bot / Telegram Hub"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="modal-input text-xs"
                  required
                />
              </div>

              <div className="form-group flex flex-col gap-1">
                <label className="text-xs text-muted font-sans font-medium">Website / dApp URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newAppUrl}
                  onChange={(e) => setNewAppUrl(e.target.value)}
                  className="modal-input text-xs"
                  required
                />
                {addAppError && (
                  <span className="text-[10.5px] text-pulse-red font-mono">{addAppError}</span>
                )}
              </div>

              <div className="form-group flex flex-col gap-1">
                <label className="text-xs text-muted font-sans font-medium">Category</label>
                <select
                  value={newAppCategory}
                  onChange={(e) => setNewAppCategory(e.target.value)}
                  className="modal-select text-xs"
                >
                  <option value="launchpads">Meme & Launchpads</option>
                  <option value="dex">DEXs & Trading</option>
                  <option value="security">Security & Auditing</option>
                  <option value="bridges">Bridges & On-Ramps</option>
                  <option value="analytics">Analytics</option>
                  <option value="tools">General Tools</option>
                </select>
              </div>

              <div className="form-group flex flex-col gap-1">
                <label className="text-xs text-muted font-sans font-medium">Short Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fast sniper bot for meme launches"
                  value={newAppDesc}
                  onChange={(e) => setNewAppDesc(e.target.value)}
                  className="modal-input text-xs"
                />
              </div>

              <div className="modal-actions flex items-center justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-sm font-bold">
                  Save Portal Bookmark
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
