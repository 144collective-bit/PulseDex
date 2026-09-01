import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { fetchWalletPortfolio, isSpamToken } from '../../services/portfolio'

/**
 * Wallet holdings for the dashboard.
 *
 * Reuses the portfolio service the Portfolio page already uses rather than
 * reading balances a second way - two answers to "what does this wallet hold"
 * is one answer too many.
 *
 * Wrapping it in React Query is the change: the page fetches into local state
 * on mount, which means a Portfolio module and a Holdings module on the same
 * dashboard would each run their own multicall. Sharing a query key makes that
 * one call for both.
 */
export function useWalletPortfolio(explicitAddress) {
  const { address: connected } = useAccount()
  const address = explicitAddress ?? connected ?? null

  const query = useQuery({
    queryKey: ['dashboard', 'portfolio', address?.toLowerCase() ?? null],
    queryFn: () => fetchWalletPortfolio(address),
    enabled: Boolean(address),
    // Balances move only when the wallet transacts, and this is a multicall
    // plus a price lookup - far more expensive than a price poll.
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  return { ...query, address, isConnected: Boolean(address) }
}

/**
 * Holdings worth showing, sorted.
 *
 * Spam filtering is not cosmetic here. Airdropped worthless tokens are routine
 * on PulseChain and a portfolio total that counts them is wrong, sometimes by
 * orders of magnitude.
 */
export function selectHoldings(portfolio, { sortBy = 'value', includeSpam = false } = {}) {
  const tokens = portfolio?.tokens ?? []

  const visible = includeSpam ? tokens : tokens.filter((t) => !isSpamToken(t))

  const sorters = {
    value: (a, b) => Number(b.valueUsd ?? 0) - Number(a.valueUsd ?? 0),
    change: (a, b) => Number(b.change24h ?? 0) - Number(a.change24h ?? 0),
    percentage: (a, b) => Number(b.portfolioPct ?? 0) - Number(a.portfolioPct ?? 0),
  }

  return visible.slice().sort(sorters[sortBy] ?? sorters.value)
}
