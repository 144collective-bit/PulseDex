import { useState, useEffect, lazy, Suspense } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import { DEFAULT_PAIR_ADDRESS } from './config/pulsechain'
import { getPulsePair, getTopPulsePairs } from './services/dexscreener'
import { TrendingUp, Zap, Layers, Flame } from 'lucide-react'

import HomeView from './components/HomeView'
import { useTokenRoute } from './hooks/useTokenRoute'
import { usePlsPrice } from './hooks/usePumpTires'
import Navbar from './components/Navbar'
import MobileBottomNav from './components/MobileBottomNav'
import TickerMarquee from './components/TickerMarquee'
import SidebarPairs from './components/SidebarPairs'
import PairHeader from './components/PairHeader'
import TokenDetails from './components/TokenDetails'
import { SiweAuthProvider, useSiweAuth } from './context/SiweAuthContext'

/*
 * Tabs are fetched when they are first opened, not before.
 *
 * Only one of these is ever on screen, and the shell already mounts them that
 * way - but importing them statically still put every one into the first
 * download. Someone arriving to look at a price was paying for the dashboard,
 * the charting library, the grid engine and the trenches board before anything
 * appeared.
 *
 * Home is deliberately not in this list. It is the landing page, so deferring
 * it would only add a round trip to the one view everybody sees.
 */
const Dashboard = lazy(() => import('./dashboard/components/Dashboard'))
const TokenPage = lazy(() => import('./components/TokenPage'))
const TrenchesView = lazy(() => import('./components/TrenchesView'))
const DexTerminal = lazy(() => import('./components/DexTerminal'))
const DexComingSoon = lazy(() => import('./components/DexComingSoon'))
const MarketOverview = lazy(() => import('./components/MarketOverview'))
const PortfolioSection = lazy(() => import('./components/PortfolioSection'))
const ProfileView = lazy(() => import('./components/ProfileView'))

/*
 * The screener's two heavy panels, split from the tab around them.
 *
 * The chart carries lightweight-charts and the drawing tools; the tape carries
 * the swap reconstruction. Neither is needed to render the pair header and the
 * sidebar, which is what the screener shows first.
 */
const TradingChart = lazy(() => import('./components/TradingChart'))
const TradeHistory = lazy(() => import('./components/TradeHistory'))

// Modals: opened by a deliberate action, so never part of a first load.
const WalletConnectModal = lazy(() => import('./components/WalletConnectModal'))
const UserProfileModal = lazy(() => import('./components/UserProfileModal'))
import { UserProfileProvider, useUserProfile } from './context/UserProfileContext'
import { FEATURES } from './config/features'

import './App.css'
import { readScoped, subscribeScoped, writeScoped } from './utils/profileStorage'

/**
 * Query defaults, set once.
 *
 * This was a bare `new QueryClient()`, which meant every hook in the app
 * improvised its own policy and the ones that forgot inherited React Query's
 * defaults - three retries with backoff on every failure, including the ones
 * that will never succeed. Against public APIs that rate-limit bursts, retrying
 * a 429 three times is how a brief limit becomes a sustained one.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * Retry once, and not at all for answers that are final.
       *
       * A 404 and a 400 are the server's settled opinion; asking again wastes a
       * request and delays the error the reader needs to see. A timeout or a
       * 5xx is worth one more try, because those genuinely do pass.
       */
      retry: (failureCount, error) => {
        const status = error?.status
        if (status >= 400 && status < 500 && status !== 429) return false
        return failureCount < 1
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),

      // Data that is one poll old is still worth showing while the next one is
      // in flight. Hooks that need fresher than this say so themselves.
      staleTime: 15_000,
      gcTime: 5 * 60_000,

      /*
       * No refetch on focus. Every tab switch and every return to the window
       * would otherwise refire every visible query at once - a burst that these
       * APIs answer with a rate limit, on the one interaction where the user is
       * most likely to be looking at the result.
       */
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,

      /*
       * `placeholderData` is deliberately not set here.
       *
       * Keeping the previous response on screen is right for a poll of the same
       * thing and wrong for a change of subject: as a global default it would
       * show one token's price under the next token's name for as long as the
       * new request took. The hooks that poll one subject opt into it
       * individually, where the previous value really is an older answer to the
       * same question.
       */
    },
    mutations: { retry: false },
  },
})

/**
 * What a tab shows while its code is on the way.
 *
 * Reserves height rather than rendering nothing: an empty main element
 * collapses the page, the footer jumps up, and the whole layout snaps back a
 * moment later. On a fast connection this is never seen at all.
 */
function PanelLoading({ label }) {
  return (
    <div className="panel-loading glass-panel" role="status" aria-live="polite">
      <span className="tab-loading-dot" />
      <span className="panel-loading-label font-mono">{label}</span>
    </div>
  )
}

function TabLoading() {
  return (
    <div className="tab-loading" role="status" aria-live="polite">
      <span className="tab-loading-dot" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

function MainApp() {
  // Storage below is scoped to the signed-in account.
  const { account } = useSiweAuth()
  // Read here so the profile modal can be mounted only while it is open, which
  // is what keeps its code out of the first download.
  const { isProfileModalOpen } = useUserProfile()
  const [activeTab, setActiveTab] = useState('home')

  // /token/<address> renders the full token page over the tab shell.
  const { tokenAddress, openToken, closeToken } = useTokenRoute()

  // Curve prices are PLS-denominated, so the token page needs the live rate.
  const { data: plsPrice } = usePlsPrice()

  /*
   * Changing tab has to leave the token route as well as set the tab. The token
   * page gates the whole content area, so without this the nav rendered as
   * normal but did nothing at all once a token was open - the tab state changed
   * underneath while the token page stayed mounted on top.
   */
  const selectTab = (tab) => {
    closeToken()
    setActiveTab(tab)
  }
  const [currentPair, setCurrentPair] = useState(null)
  const [topPairs, setTopPairs] = useState([])
  const [isLoadingTopPairs, setIsLoadingTopPairs] = useState(true)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [mobileScreenerTab, setMobileScreenerTab] = useState('pairs') // 'pairs' | 'chart' | 'trades' | 'details'
  const [showWalletModal, setShowWalletModal] = useState(false)

  /**
   * Watchlist: lowercase pair addresses, scoped to the signed-in account.
   *
   * A watch list says what someone is following, which is not something to
   * leave visible to the next person who signs in on a shared browser.
   */
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = readScoped('watchlist', account, null)
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })

  // Load default pair and top pairs on mount
  useEffect(() => {
    async function initData() {
      setIsLoadingTopPairs(true)
      try {
        const [defaultPairData, pairsList] = await Promise.all([
          getPulsePair(DEFAULT_PAIR_ADDRESS),
          getTopPulsePairs(),
        ])

        if (defaultPairData) {
          setCurrentPair(defaultPairData)
        } else if (pairsList.length > 0) {
          setCurrentPair(pairsList[0])
        }

        setTopPairs(pairsList)
      } catch (err) {
        console.error('Error initializing market data:', err)
      } finally {
        setIsLoadingTopPairs(false)
      }
    }

    initData()
    const interval = setInterval(async () => {
      const pairs = await getTopPulsePairs()
      if (pairs.length > 0) setTopPairs(pairs)
    }, 20000)

    return () => clearInterval(interval)
  }, [])

  /*
   * Track this account's watchlist, and follow it when anything else changes it.
   *
   * The address change is the obvious case. The subscription is the important
   * one: the dashboard's watchlist module writes the same record, and holding a
   * stale copy here meant the next star toggled on the screener wrote that
   * stale list back and dropped whatever the dashboard had added.
   */
  useEffect(() => {
    const load = () => {
      const saved = readScoped('watchlist', account, null)
      setWatchlist(Array.isArray(saved) ? saved : [])
    }
    load()
    return subscribeScoped('watchlist', load)
  }, [account])

  const handleToggleWatchlist = (pairAddress) => {
    if (!pairAddress) return
    const addr = pairAddress.toLowerCase()
    setWatchlist((prev) => {
      const exists = prev.includes(addr)
      const updated = exists ? prev.filter((a) => a !== addr) : [...prev, addr]
      writeScoped('watchlist', account, updated)
      return updated
    })
  }

  // Select a pair from Search, Markets, or Watchlist
  const handleSelectPair = async (pair) => {
    if (!pair) return
    if (pair.baseToken && pair.quoteToken && pair.pairAddress) {
      setCurrentPair(pair)
    } else if (typeof pair === 'string') {
      const fetched = await getPulsePair(pair)
      if (fetched) setCurrentPair(fetched)
    }
    setActiveTab('screener')
    setMobileScreenerTab('chart')
  }

  const isCurrentPairStarred = currentPair
    ? watchlist.includes(currentPair.pairAddress?.toLowerCase())
    : false

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={selectTab}
        onSelectPair={handleSelectPair}
        watchlistCount={watchlist.length}
        onOpenWalletModal={() => setShowWalletModal(true)}
      />

      {/* Top Ticker Marquee */}
      <TickerMarquee
        pairs={topPairs}
        onSelectPair={handleSelectPair}
      />

      {/* Main Views */}
      <main className="app-main-content">
        <Suspense fallback={<TabLoading />}>
        {/* A direct /token/<address> link takes over the content area; the tab
            shell stays mounted underneath so Back returns to it instantly. */}
        {tokenAddress ? (
          <TokenPage
            address={tokenAddress}
            plsPrice={plsPrice}
            onBack={closeToken}
          />
        ) : (
        <>
        {activeTab === 'screener' && (
          <div className="screener-view-wrapper">
            {/* Mobile Screener Segment Control (Full-Width Responsive Menu) */}
            <div className="mobile-screener-switcher font-mono">
              <button
                className={`mobile-switcher-btn ${mobileScreenerTab === 'pairs' ? 'active' : ''}`}
                onClick={() => setMobileScreenerTab('pairs')}
              >
                <Flame size={13} />
                <span>Pairs</span>
              </button>
              <button
                className={`mobile-switcher-btn ${mobileScreenerTab === 'chart' ? 'active' : ''}`}
                onClick={() => setMobileScreenerTab('chart')}
              >
                <TrendingUp size={13} />
                <span>Chart</span>
              </button>
              <button
                className={`mobile-switcher-btn ${mobileScreenerTab === 'trades' ? 'active' : ''}`}
                onClick={() => setMobileScreenerTab('trades')}
              >
                <Zap size={13} />
                <span>Swaps</span>
              </button>
              <button
                className={`mobile-switcher-btn ${mobileScreenerTab === 'details' ? 'active' : ''}`}
                onClick={() => setMobileScreenerTab('details')}
              >
                <Layers size={13} />
                <span>Token Info</span>
              </button>
            </div>

            <div className={`screener-pro-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} mobile-tab-${mobileScreenerTab}`}>
              {/* Left Pairs Sidebar */}
              <div className={`screener-sidebar-wrapper ${mobileScreenerTab === 'pairs' ? 'mobile-show' : 'mobile-hide'}`}>
                <SidebarPairs
                  pairs={topPairs}
                  currentPair={currentPair}
                  onSelectPair={handleSelectPair}
                  watchlist={watchlist}
                  onToggleWatchlist={handleToggleWatchlist}
                  isCollapsed={isSidebarCollapsed}
                  onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                />
              </div>

              {/* Middle Main Column: Pair Header + Chart + Trade Feed */}
              <div className={`screener-main-col ${mobileScreenerTab === 'chart' || mobileScreenerTab === 'trades' ? 'mobile-show' : 'mobile-hide'}`}>
                <PairHeader
                  pair={currentPair}
                  isStarred={isCurrentPairStarred}
                  onToggleStar={() =>
                    currentPair && handleToggleWatchlist(currentPair.pairAddress)
                  }
                />
                {/*
                  A boundary each, rather than sharing the tab's.
                  Under one boundary the whole screener - header, sidebar,
                  token details - would wait behind the charting library, and
                  the reader would watch a spinner instead of the parts that
                  were ready to paint.
                */}
                <div className={mobileScreenerTab === 'chart' ? 'mobile-show' : 'mobile-hide-on-mobile'}>
                  <Suspense fallback={<PanelLoading label="Loading chart" />}>
                    <TradingChart
                      pair={currentPair}
                      pairAddress={currentPair?.pairAddress || DEFAULT_PAIR_ADDRESS}
                    />
                  </Suspense>
                </div>
                <div className={mobileScreenerTab === 'trades' ? 'mobile-show' : 'mobile-hide-on-mobile'}>
                  <Suspense fallback={<PanelLoading label="Loading trades" />}>
                    <TradeHistory pair={currentPair} />
                  </Suspense>
                </div>
              </div>

              {/* Right Side Column: Token Details */}
              <div className={`screener-side-col ${mobileScreenerTab === 'details' ? 'mobile-show' : 'mobile-hide'}`}>
                <TokenDetails
                  pair={currentPair}
                  allPairs={topPairs}
                  onSelectPair={handleSelectPair}
                  isStarred={isCurrentPairStarred}
                  onToggleStar={() =>
                    currentPair && handleToggleWatchlist(currentPair.pairAddress)
                  }
                  watchlistCount={watchlist.length}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'home' && (
          <HomeView onSelectPairForChart={handleSelectPair} />
        )}

        {/* The dashboard owns its own state and data. It is mounted only while
            its tab is active so a canvas of modules is not polling in the
            background behind every other page. */}
        {activeTab === 'dashboard' && <Dashboard />}

        {activeTab === 'trenches' && (
          <TrenchesView onSelectPairForChart={handleSelectPair} onOpenTokenPage={openToken} />
        )}

        {activeTab === 'dex' &&
          (FEATURES.dexLive ? (
            <DexTerminal
              pairs={topPairs}
              isLoadingPairs={isLoadingTopPairs}
              onSelectPair={handleSelectPair}
            />
          ) : (
            <DexComingSoon />
          ))}

        {FEATURES.markets && activeTab === 'markets' && (
          <MarketOverview
            pairs={topPairs}
            isLoading={isLoadingTopPairs}
            onSelectPair={handleSelectPair}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {/* Watchlist now lives inside the portfolio section rather than in
            its own nav slot - both are ways of tracking assets you care about. */}
        {(activeTab === 'portfolio' || activeTab === 'watchlist') && (
          <PortfolioSection
            watchlist={watchlist}
            pairs={topPairs}
            onSelectPair={handleSelectPair}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {FEATURES.profile && activeTab === 'profile' && <ProfileView />}

        </>
        )}
        </Suspense>
      </main>

      {/* Mobile Native Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={selectTab}
        watchlistCount={watchlist.length}
      />

      {/*
        Both modals are mounted only while open, which is what makes splitting
        them worth anything: rendered unconditionally they would each return
        null on the first paint and still have fetched their own code to do it.
        No fallback - a modal that has not appeared yet should show nothing,
        not a spinner over the page.
      */}
      {showWalletModal && (
        <Suspense fallback={null}>
          <WalletConnectModal isOpen onClose={() => setShowWalletModal(false)} />
        </Suspense>
      )}

      {/* Global User Profile & Settings Modal */}
      {FEATURES.profile && isProfileModalOpen && (
        <Suspense fallback={null}>
          <UserProfileModal />
        </Suspense>
      )}

      {/* Global Auth Sign Up / Sign In Modal */}
    </div>
  )
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweAuthProvider>
          <UserProfileProvider>
            <MainApp />
          </UserProfileProvider>
        </SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

