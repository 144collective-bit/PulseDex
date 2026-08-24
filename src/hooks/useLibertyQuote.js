import { useState, useEffect, useRef, useCallback } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { fetchLibertyQuote } from '../services/libertySwapApi'
import { validateVolumeLimit, isRouterWhitelisted } from '../config/libertySwap'

/**
 * Custom React Hook for debounced Liberty Swap Quote fetching & fee analysis
 */
export function useLibertyQuote({
  srcChainId,
  dstChainId,
  srcToken,
  dstToken,
  amount,
  recipientAddress,
}) {
  const [quote, setQuote] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [isSecurityVerified, setIsSecurityVerified] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const abortControllerRef = useRef(null)
  const debounceTimerRef = useRef(null)

  const fetchQuote = useCallback(async () => {
    // Reset errors and abort previous requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (!amount || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))) {
      setQuote(null)
      setIsLoading(false)
      setValidationError(null)
      setApiError(null)
      setIsSecurityVerified(false)
      return
    }

    if (!srcToken || !dstToken || !srcChainId || !dstChainId) {
      setQuote(null)
      setIsLoading(false)
      return
    }

    // 1. Same chain check
    if (srcChainId === dstChainId && srcToken.symbol === dstToken.symbol) {
      setValidationError('Source and destination token cannot be identical on the same chain')
      setQuote(null)
      setIsLoading(false)
      return
    }

    // 2. Volume limits validation check (Client-side pre-flight)
    const limitError = validateVolumeLimit(srcToken.symbol, amount)
    if (limitError) {
      setValidationError(limitError)
      setQuote(null)
      setIsLoading(false)
      setApiError(null)
      return
    }

    setValidationError(null)
    setApiError(null)
    setIsLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // Calculate amount in lowest units / wei
      const decimals = srcToken.decimals || 18
      let amountWei
      try {
        amountWei = parseUnits(amount.toString(), decimals).toString()
      } catch {
        amountWei = '0'
      }

      const result = await fetchLibertyQuote({
        srcToken: srcToken.symbol,
        dstToken: dstToken.symbol,
        amount: amountWei,
        srcChain: srcChainId,
        dstChain: dstChainId,
        recipient: recipientAddress,
        recipientType: 0,
        signal: controller.signal,
      })

      // Security check: router whitelist verification
      const whitelisted = isRouterWhitelisted(result.to)
      setIsSecurityVerified(whitelisted)

      // Calculate human-readable destination amount if not provided
      let formattedDest = result.destAmountFormatted
      if (!formattedDest && result.destAmount) {
        try {
          const dstDecimals = dstToken.decimals || 18
          formattedDest = formatUnits(BigInt(result.destAmount), dstDecimals)
        } catch {
          formattedDest = result.destAmount
        }
      }

      setQuote({
        ...result,
        destAmountFormatted: formattedDest,
      })
      setLastUpdated(Date.now())
      setApiError(null)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.warn('Liberty Swap quote error:', err)
      setApiError(err.message || 'Unable to fetch route from Liberty Swap')
      setQuote(null)
      setIsSecurityVerified(false)
    } finally {
      setIsLoading(false)
    }
  }, [srcChainId, dstChainId, srcToken, dstToken, amount, recipientAddress])

  // Debounced quote fetching with 400ms delay
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // If no amount, clear state immediately
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null)
      setIsLoading(false)
      setValidationError(null)
      setApiError(null)
      return
    }

    // Pre-validate limits before debounce delay for instant UX feedback
    if (srcToken) {
      const limitError = validateVolumeLimit(srcToken.symbol, amount)
      if (limitError) {
        setValidationError(limitError)
        setQuote(null)
        setIsLoading(false)
        return
      } else {
        setValidationError(null)
      }
    }

    setIsLoading(true)
    debounceTimerRef.current = setTimeout(() => {
      fetchQuote()
    }, 400)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchQuote, amount, srcToken])

  return {
    quote,
    isLoading,
    validationError,
    apiError,
    isSecurityVerified,
    lastUpdated,
    refreshQuote: fetchQuote,
  }
}
