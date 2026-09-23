import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { loadWithRetry } from './utils/lazyRetry'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import { DEFAULT_PAIR_ADDRESS } from './config/pulsechain'
import { getPulsePair, getTopPulsePairs } from './services/dexscreener'
import { TrendingUp, Zap, Layers, Flame } from 'lucide-react'

import HomeView from './components/HomeView'
import { useRoute } from './hooks/useRoute'
import { routeTab } from './utils/route'
import { tokenRoom } from './config/rooms'
import { usePlsPrice } from './hooks/usePumpTires'
import Navbar from './components/Navbar'
import MobileBottomNav from './components/MobileBottomNav'
import TickerMarquee from './components/TickerMarquee'
import SidebarPairs from './components/SidebarPairs'
import PairHeader from './components/PairHeader'
import TokenDetails from './components/TokenDetails'
import { SiweAuthProvider, useSiweAuth } from './context/SiweAuthContext'
import { NotificationsProvider } from './context/NotificationsContext'

/*
 * Tabs are fetched when they are first opened, not before.
 *
 * Only one of these is ever on screen, and the shell already mounts them that
 * way - but importing them statically still put every one into the first
 * download. Someone arriving to look at a price was paying for the charting
 * library and the trenches board before anything appeared.
 *
 * Home is deliberately not in this list. It is the landing page, so deferring
 * it would only add a round trip to the one view everybody sees.
 */
/*
 * Routes are loaded on demand, and a load can fail.
 *
 * `lazyRoute` is `lazy` with the one behaviour a hashed-chunk build needs: a
 * retry, then a reload, rather than an unhandled rejection that unmounts the
 * app. See src/utils/lazyRetry.js - the failure it exists for is a tab left
 * open across a deployment, which is every reader of a site that ships often.
 */
const lazyRoute = (importer) => lazy(() => loadWithRetry(importer))

const TokenPage = lazyRoute(() => import('./components/TokenPage'))
const TrenchesView = lazyRoute(() => import('./components/TrenchesView'))
const SocialView = lazyRoute(() => import('./components/SocialView'))
const ProfilePage = lazyRoute(() => import('./components/social/ProfilePage'))
const MarketOverview = lazyRoute(() => import('./components/MarketOverview'))
const PortfolioSection = lazyRoute(() => import('./components/PortfolioSection'))
const ProfileView = lazyRoute(() => import('./components/ProfileView'))

/*
 * The screener's two heavy panels, split from the tab around them.
 *
 * The chart carries lightweight-charts and the drawing tools; the tape carries
 * the swap reconstruction. Neither is needed to render the pair header and the
 * sidebar, which is what the screener shows first.
 */
const TradingChart = lazyRoute(() => import('./components/TradingChart'))
const TradeHistory = lazyRoute(() => import('./components/TradeHistory'))

// Modals: opened by a deliberate action, so never part of a first load.
const WalletConnectModal = lazyRoute(() => import('./components/WalletConnectModal'))
const UserProfileModal = lazyRoute(() => import('./components/UserProfileModal'))
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

  /*
   * The address bar, as one piece of state.
   *
   * This was three hooks - one per surface - each reading and pushing
   * `window.location` on its own. Each was right and the set was not: none
   * could assume the URL was where it last left it, and the shell had to
   * remember which surfaces to shut every time it opened another. See
   * src/utils/route.js.
   */
  const { route, go, home } = useRoute()

  const tokenAddress = route?.kind === 'token' ? route.address : null
  const profileRoute = route?.kind === 'profile' ? route : null
  const socialRoute = route?.kind === 'social' ? route : null

  /* The four ways the rest of the app asks to go somewhere. Thin, because
     the routing decision is `go` and these only say where. */
  const openToken = useCallback((address) => {
    if (!address) return
    go({ kind: 'token', address })
    window.scrollTo({ top: 0 })
  }, [go])

  const openProfile = useCallback(({ address, handle } = {}) => {
    if (!address && !handle) return
    go({ kind: 'profile', address: address || null, handle: handle || null })
    window.scrollTo({ top: 0 })
  }, [go])

  const openSocial = useCallback((where) => go({ kind: 'social', ...where }), [go])

  /** The room about a token, from the screener. */
  const openTokenRoom = useCallback(
    (address) => {
      const slug = tokenRoom(address)
      if (!slug) return
      go({ kind: 'social', tab: 'rooms', room: slug })
      setActiveTab('social')
      window.scrollTo({ top: 0 })
    },
    [go],
  )

  // Curve prices are PLS-denominated, so the token page needs the live rate.
  const { data: plsPrice } = usePlsPrice()

  /*
   * Changing tab has to leave the token route as well as set the tab. The token
   * page gates the whole content area, so without this the nav rendered as
   * normal but did nothing at all once a token was open - the tab state changed
   * underneath while the token page stayed mounted on top.
   */
  /*
   * Your own public page.
   *
   * Opened by address rather than by handle, deliberately: this is the one
   * link that has to work before somebody has chosen a name, which is exactly
   * the state a new account is in when it goes looking for its own profile.
   * The page itself resolves the handle and shows it.
   */
  const openMyProfile = useCallback(() => {
    if (account) openProfile({ address: account })
  }, [account, openProfile])

  /*
   * Which tab is showing.
   *
   * The URL wins where it says anything. A path like /r/lounge is a request
   * for the social section, and deriving the tab from it rather than keeping
   * a second copy in state is what stops the two disagreeing - which is how
   * a cold load lands on Home with the address bar insisting it is in a room.
   */
  const shownTab = routeTab(route, activeTab)

  /*
   * Changing tab is one navigation now.
   *
   * It used to be three calls - close the token, close the profile, then
   * either open or close the social route - and every new surface added a
   * fourth line somebody had to remember. There is one route, so going to
   * the social tab leaves a token page by arriving, and going anywhere else
   * goes home.
   */
  const selectTab = (tab) => {
    if (tab === 'social') openSocial({ tab: 'feed' })
    else home()

    setActiveTab(tab)
  }

  /**
   * Open one surface of the social section from the chrome.
   *
   * The bell in the navbar is on every tab, so pressing it from the screener
   * has to do everything `selectTab` does - close a token, close a profile -
   * and then land on a specific surface rather than on the feed.
   */
  const openSocialAt = useCallback(
    (where) => {
      openSocial(where)
      setActiveTab('social')
    },
    [openSocial],
  )
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
   * one: more than one surface writes this same record, and holding a stale
   * copy here meant the next star toggled on the screener wrote that stale list
   * back and dropped whatever another had added.
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
        activeTab={shownTab}
        setActiveTab={selectTab}
        onOpenNotifications={() => openSocialAt({ tab: 'notifications' })}
        onOpenPublicProfile={openMyProfile}
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
        {/* Above Suspense, so a chunk that never arrives is caught here
            rather than unmounting the app and leaving a white screen. Keyed on
            the current view, so moving to another tab clears a failure instead
            of leaving the message in place for every tab. */}
        <RouteErrorBoundary resetKey={`${shownTab}|${tokenAddress || ''}|${profileRoute?.address || profileRoute?.handle || ''}`}>
        <Suspense fallback={<TabLoading />}>
        {/* A direct /token/<address> link takes over the content area; the tab
            shell stays mounted underneath so Back returns to it instantly. */}
        {profileRoute ? (
          <ProfilePage
            route={profileRoute}
            onOpenProfile={openProfile}
            onOpenToken={openToken}
            onClose={home}
          />
        ) : tokenAddress ? (
          <TokenPage
            address={tokenAddress}
            plsPrice={plsPrice}
            onBack={home}
            /* So the chat tab on a token page can open somebody's profile.
               The board's modal gets no such route and does not offer it. */
            onOpenProfile={openProfile}
          />
        ) : (
        <>
        {shownTab === 'screener' && (
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
                  /*
                   * The other direction of the loop. The token page has had a
                   * Chat tab since token rooms existed; this is the screener
                   * saying which of a hundred rows anybody is discussing, and
                   * offering to open it. Absent when the social section is
                   * off, in which case no badge is drawn either.
                   */
                  onOpenRoom={FEATURES.social ? openTokenRoom : undefined}
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

        {shownTab === 'home' && (
          <HomeView onSelectPairForChart={handleSelectPair} />
        )}

        {shownTab === 'trenches' && (
          <TrenchesView onSelectPairForChart={handleSelectPair} onOpenTokenPage={openToken} />
        )}

        {FEATURES.social && shownTab === 'social' && (
          <SocialView
            /* Which surface, and which room, come from the URL. The section
               holds no tab state of its own any more - see useRoute. */
            route={socialRoute}
            onNavigate={openSocial}
            onOpenProfile={openProfile}
            onOpenToken={openToken}
          />
        )}

        {FEATURES.markets && shownTab === 'markets' && (
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
        {(shownTab === 'portfolio' || shownTab === 'watchlist') && (
          <PortfolioSection
            watchlist={watchlist}
            pairs={topPairs}
            onSelectPair={handleSelectPair}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {FEATURES.profile && shownTab === 'profile' && (
          <ProfileView onOpenPublicProfile={openMyProfile} />
        )}

        </>
        )}
        </Suspense>
        </RouteErrorBoundary>
      </main>

      {/* Mobile Native Bottom Navigation */}
      <MobileBottomNav
        activeTab={shownTab}
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
        <RouteErrorBoundary resetKey="wallet-modal">
          <Suspense fallback={null}>
            <WalletConnectModal isOpen onClose={() => setShowWalletModal(false)} />
          </Suspense>
        </RouteErrorBoundary>
      )}

      {/* Global User Profile & Settings Modal */}
      {FEATURES.profile && isProfileModalOpen && (
        <RouteErrorBoundary resetKey="profile-modal">
          <Suspense fallback={null}>
            <UserProfileModal />
          </Suspense>
        </RouteErrorBoundary>
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
          {/* Inside the auth provider, which it reads to know whether there
              is anybody to have notifications, and outside everything that
              draws the unread count. */}
          <NotificationsProvider>
          <UserProfileProvider>
            <MainApp />
          </UserProfileProvider>
          </NotificationsProvider>
        </SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

