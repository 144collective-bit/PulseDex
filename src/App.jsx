import { useState, useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import { DEFAULT_PAIR_ADDRESS } from './config/pulsechain'
import { getPulsePair, getTopPulsePairs } from './services/dexscreener'

import Navbar from './components/Navbar'
import TickerMarquee from './components/TickerMarquee'
import SidebarPairs from './components/SidebarPairs'
import PairHeader from './components/PairHeader'
import TradingChart from './components/TradingChart'
import TradeHistory from './components/TradeHistory'
import TokenDetails from './components/TokenDetails'
import MarketOverview from './components/MarketOverview'
import PortfolioView from './components/PortfolioView'
import WatchlistView from './components/WatchlistView'
import TrenchesView from './components/TrenchesView'

import './App.css'

const queryClient = new QueryClient()

function MainApp() {
  const [activeTab, setActiveTab] = useState('screener')
  const [currentPair, setCurrentPair] = useState(null)
  const [topPairs, setTopPairs] = useState([])
  const [isLoadingTopPairs, setIsLoadingTopPairs] = useState(true)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Watchlist stored in localStorage (array of lowercase pair addresses)
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('pulse_watchlist')
      return saved ? JSON.parse(saved) : [DEFAULT_PAIR_ADDRESS.toLowerCase()]
    } catch {
      return [DEFAULT_PAIR_ADDRESS.toLowerCase()]
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

  // Toggle pair in watchlist
  const handleToggleWatchlist = (pairAddress) => {
    if (!pairAddress) return
    const addr = pairAddress.toLowerCase()
    setWatchlist((prev) => {
      const exists = prev.includes(addr)
      const updated = exists ? prev.filter((a) => a !== addr) : [...prev, addr]
      localStorage.setItem('pulse_watchlist', JSON.stringify(updated))
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
  }

  const isCurrentPairStarred = currentPair
    ? watchlist.includes(currentPair.pairAddress?.toLowerCase())
    : false

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSelectPair={handleSelectPair}
        watchlistCount={watchlist.length}
      />

      {/* Top Ticker Marquee */}
      <TickerMarquee
        pairs={topPairs}
        onSelectPair={handleSelectPair}
      />

      {/* Main Views */}
      <main className="app-main-content">
        {activeTab === 'screener' && (
          <div className={`screener-pro-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            {/* Left Pairs Sidebar */}
            <SidebarPairs
              pairs={topPairs}
              currentPair={currentPair}
              onSelectPair={handleSelectPair}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />

            {/* Middle Main Column: Pair Header + Chart + Trade Feed */}
            <div className="screener-main-col">
              <PairHeader
                pair={currentPair}
                isStarred={isCurrentPairStarred}
                onToggleStar={() =>
                  currentPair && handleToggleWatchlist(currentPair.pairAddress)
                }
              />
              <TradingChart
                pair={currentPair}
                pairAddress={currentPair?.pairAddress || DEFAULT_PAIR_ADDRESS}
              />
              <TradeHistory pair={currentPair} />
            </div>

            {/* Right Side Column: Token Details */}
            <div className="screener-side-col">
              <TokenDetails
                pair={currentPair}
                isStarred={isCurrentPairStarred}
                onToggleStar={() =>
                  currentPair && handleToggleWatchlist(currentPair.pairAddress)
                }
                watchlistCount={watchlist.length}
              />
            </div>
          </div>
        )}

        {activeTab === 'trenches' && (
          <TrenchesView onSelectPairForChart={handleSelectPair} />
        )}

        {activeTab === 'markets' && (
          <MarketOverview
            pairs={topPairs}
            isLoading={isLoadingTopPairs}
            onSelectPair={handleSelectPair}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {activeTab === 'portfolio' && (
          <PortfolioView onSelectTokenForChart={handleSelectPair} />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistView
            watchlist={watchlist}
            pairs={topPairs}
            onSelectPair={handleSelectPair}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MainApp />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
