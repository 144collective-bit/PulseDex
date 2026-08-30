import { useEffect, useState, useCallback } from 'react'

/**
 * URL state for the token detail page.
 *
 * The app drives its tabs from component state rather than a router, so rather
 * than converting every tab to a route (and risking the whole shell), this
 * syncs one path - /token/<address> - through the History API. That is enough
 * to make a token linkable, refreshable and reachable with the back button,
 * which a modal alone can never be.
 *
 * vercel.json already rewrites every path to index.html, so a cold load of
 * /token/0x... reaches the app rather than 404ing.
 */

const TOKEN_PATH = /^\/token\/(0x[a-fA-F0-9]{40})\/?$/

function readAddress() {
  const match = TOKEN_PATH.exec(window.location.pathname)
  return match ? match[1] : null
}

export function useTokenRoute() {
  const [address, setAddress] = useState(readAddress)

  // Back and forward move between the board and a token.
  useEffect(() => {
    const onPop = () => setAddress(readAddress())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openToken = useCallback((tokenAddress) => {
    if (!tokenAddress) return
    window.history.pushState({}, '', `/token/${tokenAddress}`)
    setAddress(tokenAddress)
    window.scrollTo({ top: 0 })
  }, [])

  const closeToken = useCallback(() => {
    window.history.pushState({}, '', '/')
    setAddress(null)
  }, [])

  return { tokenAddress: address, openToken, closeToken }
}
