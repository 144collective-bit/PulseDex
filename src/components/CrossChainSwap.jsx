import { useState, useEffect, useMemo } from 'react'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useBalance,
} from 'wagmi'
import { parseUnits, formatUnits, maxUint256 } from 'viem'
import {
  ArrowDownUp,
  Zap,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Clock,
  Flame,
  Activity,
  Layers,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'

import {
  SUPPORTED_CHAINS,
  CHAIN_TOKENS,
  ERC20_ABI,
} from '../config/libertySwap'
import { useLibertyQuote } from '../hooks/useLibertyQuote'
import ChainSelectorModal from './ChainSelectorModal'
import TokenSelectorModal from './TokenSelectorModal'
import TokenLogo from './TokenLogo'
import { useUserProfile } from '../context/UserProfileContext'

export default function CrossChainSwap({ onOpenWalletModal }) {
  const { triggerSound } = useUserProfile()
  const { address, isConnected } = useAccount()
  const currentWalletChainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  // Selected Chains & Tokens
  // Default: Ethereum (1) USDC -> PulseChain (369) USDC
  const [srcChain, setSrcChain] = useState(() => SUPPORTED_CHAINS.find((c) => c.id === 1) || SUPPORTED_CHAINS[0])
  const [dstChain, setDstChain] = useState(() => SUPPORTED_CHAINS.find((c) => c.id === 369) || SUPPORTED_CHAINS[1])

  const [srcToken, setSrcToken] = useState(() => CHAIN_TOKENS[1]?.[0] || { symbol: 'USDC', decimals: 6 })
  const [dstToken, setDstToken] = useState(() => CHAIN_TOKENS[369]?.[0] || { symbol: 'USDC', decimals: 6 })

  const [amount, setAmount] = useState('100')
  const [showQuoteDetails, setShowQuoteDetails] = useState(true)
  const [isFlipping, setIsFlipping] = useState(false)
  const [copiedAddr, setCopiedAddr] = useState(null)

  // Modals state
  const [chainModalType, setChainModalType] = useState(null) // 'src' | 'dst' | null
  const [tokenModalType, setTokenModalType] = useState(null) // 'src' | 'dst' | null

  // Toast / Transaction state
  const [toastMessage, setToastMessage] = useState(null) // { type: 'success'|'error'|'info', title, desc, txHash, explorerUrl }

  // Auto-update tokens when chain changes
  const updateSrcChain = (newChain) => {
    setSrcChain(newChain)
    const availableTokens = CHAIN_TOKENS[newChain.id] || []
    // Try to find matching symbol, or fallback to first
    const matchedToken = availableTokens.find((t) => t.symbol === srcToken.symbol) || availableTokens[0]
    if (matchedToken) setSrcToken(matchedToken)
    triggerSound?.('click')
  }

  const updateDstChain = (newChain) => {
    setDstChain(newChain)
    const availableTokens = CHAIN_TOKENS[newChain.id] || []
    const matchedToken = availableTokens.find((t) => t.symbol === dstToken.symbol) || availableTokens[0]
    if (matchedToken) setDstToken(matchedToken)
    triggerSound?.('click')
  }

  // Swap / Flip Direction
  const handleFlipDirection = () => {
    setIsFlipping(true)
    triggerSound?.('click')

    const prevSrcChain = srcChain
    const prevDstChain = dstChain
    const prevSrcToken = srcToken
    const prevDstToken = dstToken

    setSrcChain(prevDstChain)
    setDstChain(prevSrcChain)

    const dstAvailable = CHAIN_TOKENS[prevDstChain.id] || []
    const srcAvailable = CHAIN_TOKENS[prevSrcChain.id] || []

    const newSrcToken = dstAvailable.find((t) => t.symbol === prevDstToken.symbol) || dstAvailable[0]
    const newDstToken = srcAvailable.find((t) => t.symbol === prevSrcToken.symbol) || srcAvailable[0]

    setSrcToken(newSrcToken)
    setDstToken(newDstToken)

    setTimeout(() => setIsFlipping(false), 300)
  }

  // Quote Hook Integration
  const {
    quote,
    isLoading: isQuoteLoading,
    validationError,
    apiError,
    isSecurityVerified,
    refreshQuote,
  } = useLibertyQuote({
    srcChainId: srcChain?.id,
    dstChainId: dstChain?.id,
    srcToken,
    dstToken,
    amount,
    recipientAddress: address,
  })

  // Balance query for Source Token
  const isSrcNative = Boolean(srcToken?.isNative)
  const { data: nativeBalanceData, refetch: refetchNativeBalance } = useBalance({
    address,
    chainId: srcChain?.id,
    query: {
      enabled: Boolean(isConnected && address && isSrcNative),
    },
  })

  const { data: erc20BalanceData, refetch: refetchErc20Balance } = useReadContract({
    address: srcToken?.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: srcChain?.id,
    query: {
      enabled: Boolean(
        isConnected &&
          address &&
          !isSrcNative &&
          srcToken?.address &&
          srcToken.address !== '0x0000000000000000000000000000000000000000'
      ),
    },
  })

  const userBalanceFormatted = useMemo(() => {
    if (!isConnected || !address) return null
    if (isSrcNative) {
      return nativeBalanceData ? parseFloat(nativeBalanceData.formatted).toFixed(4) : '0.00'
    }
    if (erc20BalanceData !== undefined && srcToken?.decimals) {
      try {
        const val = formatUnits(erc20BalanceData, srcToken.decimals)
        return parseFloat(val).toFixed(srcToken.decimals > 8 ? 4 : 2)
      } catch {
        return '0.00'
      }
    }
    return null
  }, [isConnected, address, isSrcNative, nativeBalanceData, erc20BalanceData, srcToken])

  // Allowance Query for ERC-20 Tokens against quote.to (Router)
  const routerAddress = quote?.to || ''
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: srcToken?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && routerAddress ? [address, routerAddress] : undefined,
    chainId: srcChain?.id,
    query: {
      enabled: Boolean(
        isConnected &&
          address &&
          !isSrcNative &&
          srcToken?.address &&
          routerAddress &&
          srcToken.address !== '0x0000000000000000000000000000000000000000'
      ),
    },
  })

  // Check if Approval is Needed
  const needsApproval = useMemo(() => {
    if (isSrcNative) return false
    if (!quote || !routerAddress || !amount || parseFloat(amount) <= 0) return false
    if (allowanceData === undefined) return false

    try {
      const parsedAmount = parseUnits(amount, srcToken.decimals || 18)
      return allowanceData < parsedAmount
    } catch {
      return false
    }
  }, [isSrcNative, quote, routerAddress, amount, allowanceData, srcToken])

  // Contract Write for ERC-20 Approval
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract()

  // Wait for Approval Transaction
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    chainId: srcChain?.id,
  })

  useEffect(() => {
    if (isApprovalSuccess) {
      refetchAllowance()
      setToastMessage({
        type: 'success',
        title: 'Approval Confirmed',
        desc: `Successfully approved ${srcToken.symbol} for Liberty Swap Router. You can now execute your cross-chain swap.`,
        txHash: approveTxHash,
        explorerUrl: `${srcChain.explorer}/tx/${approveTxHash}`,
      })
      triggerSound?.('trade')
      resetApprove()
    }
  }, [isApprovalSuccess, approveTxHash, refetchAllowance, srcToken, srcChain, triggerSound, resetApprove])

  // Swap Transaction Execution (sendTransaction with quote methodParameters)
  const {
    sendTransaction: executeSwapTx,
    data: swapTxHash,
    isPending: isSwapPending,
    error: swapError,
    reset: resetSwap,
  } = useSendTransaction()

  // Wait for Swap Transaction Receipt
  const { isLoading: isSwapConfirming, isSuccess: isSwapSuccess } = useWaitForTransactionReceipt({
    hash: swapTxHash,
    chainId: srcChain?.id,
  })

  useEffect(() => {
    if (isSwapSuccess && swapTxHash) {
      refetchNativeBalance?.()
      refetchErc20Balance?.()
      setToastMessage({
        type: 'success',
        title: 'Cross-Chain Swap Submitted!',
        desc: `Your swap from ${srcChain.name} to ${dstChain.name} is processing on-chain. Estimated arrival in ~2-5 mins.`,
        txHash: swapTxHash,
        explorerUrl: `${srcChain.explorer}/tx/${swapTxHash}`,
      })
      triggerSound?.('trade')
    }
  }, [isSwapSuccess, swapTxHash, srcChain, dstChain, refetchNativeBalance, refetchErc20Balance, triggerSound])

  useEffect(() => {
    if (swapError) {
      setToastMessage({
        type: 'error',
        title: 'Swap Transaction Failed',
        desc: swapError.shortMessage || swapError.message || 'Transaction rejected or reverted.',
      })
    }
  }, [swapError])

  // Handle Percentage Quick Select
  const handleQuickPercent = (pct) => {
    triggerSound?.('click')
    if (userBalanceFormatted && parseFloat(userBalanceFormatted) > 0) {
      const bal = parseFloat(userBalanceFormatted)
      const calculated = (bal * (pct / 100)).toFixed(srcToken?.decimals === 6 ? 2 : 4)
      setAmount(calculated)
    } else {
      // Preset sensible defaults if balance is 0 or wallet not connected
      const defaultMax = ['ETH', 'WETH'].includes(srcToken.symbol) ? '1.0' : '500'
      const calculated = (parseFloat(defaultMax) * (pct / 100)).toFixed(2)
      setAmount(calculated)
    }
  }

  // Handle Copy Address
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedAddr(text)
    triggerSound?.('click')
    setTimeout(() => setCopiedAddr(null), 2000)
  }

  // Action Button Handler (Multi-State Controller)
  const handleMainAction = async () => {
    triggerSound?.('click')

    // 1. Connect Wallet if not connected
    if (!isConnected) {
      onOpenWalletModal()
      return
    }

    // 2. Switch Chain if current connected chain != srcChain.id
    if (currentWalletChainId !== srcChain.id) {
      try {
        switchChain({ chainId: srcChain.id })
      } catch (err) {
        console.error('Failed to switch network:', err)
      }
      return
    }

    // 3. Security check before signing
    if (quote && !isSecurityVerified) {
      setToastMessage({
        type: 'error',
        title: 'Security Alert: Unverified Router',
        desc: 'The router returned by the API does not match the official Liberty Swap whitelist. Execution blocked for safety.',
      })
      return
    }

    // 4. Token Approval Flow
    if (needsApproval) {
      try {
        writeApprove({
          address: srcToken.address,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [routerAddress, maxUint256],
          chainId: srcChain.id,
        })
      } catch (err) {
        console.error('Approval failed:', err)
      }
      return
    }

    // 5. Execute Swap Flow
    if (quote && quote.to) {
      try {
        executeSwapTx({
          to: quote.to,
          data: quote.methodParameters.calldata,
          value: BigInt(quote.methodParameters.value || '0'),
          chainId: srcChain.id,
        })
      } catch (err) {
        console.error('Swap execution failed:', err)
      }
    }
  }

  // Determine Action Button Label & Disabled state
  const actionButtonState = useMemo(() => {
    if (!isConnected) {
      return {
        label: 'Connect Web3 Wallet',
        disabled: false,
        variant: 'btn-primary',
        icon: 'wallet',
      }
    }

    if (currentWalletChainId !== srcChain.id) {
      return {
        label: isSwitchingChain ? 'Switching Network...' : `Switch Network to ${srcChain.name}`,
        disabled: isSwitchingChain,
        variant: 'btn-primary',
        icon: 'switch',
      }
    }

    if (validationError) {
      return {
        label: validationError,
        disabled: true,
        variant: 'btn-secondary opacity-60',
        icon: 'alert',
      }
    }

    if (apiError) {
      return {
        label: 'Quote Unavailable (Retry)',
        disabled: false,
        variant: 'btn-secondary',
        icon: 'refresh',
      }
    }

    if (isQuoteLoading) {
      return {
        label: 'Calculating Best Route...',
        disabled: true,
        variant: 'btn-secondary opacity-80',
        icon: 'loading',
      }
    }

    if (!quote || parseFloat(amount || '0') <= 0) {
      return {
        label: 'Enter Swap Amount',
        disabled: true,
        variant: 'btn-secondary opacity-60',
        icon: 'none',
      }
    }

    if (!isSecurityVerified) {
      return {
        label: 'Security Check Failed (Unverified Router)',
        disabled: true,
        variant: 'btn-secondary text-pulse-red',
        icon: 'alert',
      }
    }

    if (needsApproval) {
      return {
        label: isApproving || isApprovalConfirming ? `Approving ${srcToken.symbol}...` : `Approve ${srcToken.symbol}`,
        disabled: isApproving || isApprovalConfirming,
        variant: 'btn-primary btn-glow-purple',
        icon: isApproving || isApprovalConfirming ? 'loading' : 'shield',
      }
    }

    return {
      label: isSwapPending || isSwapConfirming ? 'Broadcasting Cross-Chain Swap...' : `Swap Cross-Chain ➔ ${dstChain.shortName}`,
      disabled: isSwapPending || isSwapConfirming,
      variant: 'btn-primary btn-glow-pulse',
      icon: isSwapPending || isSwapConfirming ? 'loading' : 'swap',
    }
  }, [
    isConnected,
    currentWalletChainId,
    srcChain,
    dstChain,
    isSwitchingChain,
    validationError,
    apiError,
    isQuoteLoading,
    quote,
    amount,
    isSecurityVerified,
    needsApproval,
    isApproving,
    isApprovalConfirming,
    isSwapPending,
    isSwapConfirming,
    srcToken,
  ])

  // Destination amount formatted estimate
  const estimatedDestDisplay = useMemo(() => {
    if (isQuoteLoading) return '...'
    if (quote?.destAmountFormatted) {
      const num = parseFloat(quote.destAmountFormatted)
      return isNaN(num) ? quote.destAmountFormatted : num.toFixed(dstToken.decimals === 6 ? 2 : 4)
    }
    if (validationError || apiError) return '0.00'
    return '0.00'
  }, [isQuoteLoading, quote, dstToken, validationError, apiError])

  return (
    <div className="crosschain-view-container">
      {/* =========================================================================
          TOP BANNER STATUS & PROTOCOL HEALTH BAR
         ========================================================================= */}
      <div className="crosschain-subnav-bar glass-panel">
        <div className="crosschain-header-title-group">
          <div className="crosschain-header-icon-badge">
            <Zap size={16} />
          </div>
          <div className="crosschain-header-text">
            <div className="flex items-center gap-2">
              <h2 className="crosschain-main-title font-mono">Liberty Swap Cross-Chain Engine</h2>
              <span className="badge badge-pulse text-[10px] font-mono">Liberty API v1</span>
            </div>
            <span className="crosschain-sub-title">
              Instant non-custodial cross-chain bridges between PulseChain, Ethereum, Base, BSC, Arbitrum & Polygon
            </span>
          </div>
        </div>

        {/* Live Status Telemetry */}
        <div className="crosschain-telemetry desktop-only font-mono">
          <span className="telemetry-chip">
            <span className="live-dot"></span>
            <span className="text-muted">Liberty Engine:</span>
            <span className="text-pulse-green">Active (v1)</span>
          </span>
          <span className="telemetry-chip">
            <ShieldCheck size={13} className="text-pulse-cyan" />
            <span className="text-muted">Security:</span>
            <span className="text-pulse-cyan">Router Whitelisted</span>
          </span>
          <span className="telemetry-chip">
            <Clock size={13} className="text-pulse-yellow" />
            <span className="text-muted">Est. Speed:</span>
            <span className="text-white">~2-5 mins</span>
          </span>
        </div>
      </div>

      {/* Toast / Notification Banner */}
      {toastMessage && (
        <div
          className={`crosschain-toast-banner font-mono glass-panel animate-fade-in ${
            toastMessage.type === 'success'
              ? 'border-pulse-green'
              : toastMessage.type === 'error'
              ? 'border-pulse-red'
              : 'border-pulse-cyan'
          }`}
        >
          <div className="flex items-start gap-3">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-pulse-green mt-0.5" />
            ) : (
              <AlertTriangle size={18} className="text-pulse-red mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-bold text-sm text-white">{toastMessage.title}</div>
              <div className="text-xs text-muted mt-0.5">{toastMessage.desc}</div>
              {toastMessage.txHash && (
                <div className="mt-1.5 flex items-center gap-2">
                  <a
                    href={toastMessage.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-pulse-cyan hover:underline flex items-center gap-1"
                  >
                    <span>View Transaction on Explorer</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
            <button
              type="button"
              className="text-muted hover:text-white text-xs p-1"
              onClick={() => setToastMessage(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MAIN INTERFACE: SWAP CARD + COMPANION INTELLIGENCE BOARD
         ========================================================================= */}
      <div className="crosschain-main-grid">
        {/* Left / Main Card: Cross-Chain Swap Terminal */}
        <div className="crosschain-card-wrapper">
          <div className="crosschain-swap-card glass-panel">
            {/* Header: Title & Settings */}
            <div className="crosschain-card-header">
              <div className="flex items-center gap-2">
                <span className="crosschain-card-badge font-mono">CROSS-CHAIN ROUTE</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-icon-subtle"
                  onClick={refreshQuote}
                  disabled={isQuoteLoading}
                  title="Refresh Quote"
                >
                  <RefreshCw size={14} className={isQuoteLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* 1. SOURCE NETWORK & TOKEN SECTION */}
            <div className="crosschain-section-card source-section">
              <div className="section-top-bar font-mono">
                <span className="section-label text-muted">From Network & Pay</span>
                {isConnected && userBalanceFormatted !== null && (
                  <div className="balance-readout">
                    <span className="text-muted">Balance: </span>
                    <span className="text-white font-bold">{userBalanceFormatted}</span>
                    <span className="text-muted ml-1">{srcToken.symbol}</span>
                  </div>
                )}
              </div>

              {/* Chain & Token Selector Row */}
              <div className="selector-pills-row">
                {/* Source Chain Button */}
                <button
                  type="button"
                  className="chain-picker-btn font-mono"
                  onClick={() => setChainModalType('src')}
                >
                  <img
                    src={srcChain.icon}
                    alt={srcChain.name}
                    className="chain-picker-icon"
                  />
                  <span className="chain-picker-name">{srcChain.name}</span>
                  <ChevronDown size={13} className="text-muted" />
                </button>

                {/* Source Token Button */}
                <button
                  type="button"
                  className="token-picker-btn font-mono"
                  onClick={() => setTokenModalType('src')}
                >
                  <TokenLogo
                    symbol={srcToken.symbol}
                    address={srcToken.address}
                    customUrl={srcToken.icon}
                    size={22}
                  />
                  <span className="token-picker-sym font-bold">{srcToken.symbol}</span>
                  <ChevronDown size={13} className="text-muted" />
                </button>
              </div>

              {/* Amount Input & Percentage Controls */}
              <div className="amount-input-box">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  className="amount-large-input font-mono"
                />
                <div className="quick-percentages font-mono">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="quick-pct-pill"
                      onClick={() => handleQuickPercent(pct)}
                    >
                      {pct === 100 ? 'MAX' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* USD Conversion Estimate & Validation message */}
              <div className="section-bottom-info font-mono text-xs">
                <span className="text-muted">
                  ≈ ${parseFloat(amount || '0') * (['ETH', 'WETH'].includes(srcToken.symbol) ? 2650 : 1.0)} USD
                </span>
                {validationError && (
                  <span className="text-pulse-amber font-semibold flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>{validationError}</span>
                  </span>
                )}
              </div>
            </div>

            {/* DIRECTION FLIP BUTTON */}
            <div className="direction-flip-row">
              <button
                type="button"
                className={`direction-flip-btn ${isFlipping ? 'flipping' : ''}`}
                onClick={handleFlipDirection}
                title="Swap source and destination"
              >
                <ArrowDownUp size={16} className="flip-icon text-pulse-cyan" />
              </button>
            </div>

            {/* 2. DESTINATION NETWORK & TOKEN SECTION */}
            <div className="crosschain-section-card destination-section">
              <div className="section-top-bar font-mono">
                <span className="section-label text-muted">To Network & Receive (Est.)</span>
                {isQuoteLoading && (
                  <span className="text-pulse-cyan text-xs flex items-center gap-1">
                    <RefreshCw size={11} className="animate-spin" />
                    <span>Quoting...</span>
                  </span>
                )}
              </div>

              {/* Destination Chain & Token Selector Row */}
              <div className="selector-pills-row">
                {/* Dest Chain Button */}
                <button
                  type="button"
                  className="chain-picker-btn font-mono"
                  onClick={() => setChainModalType('dst')}
                >
                  <img
                    src={dstChain.icon}
                    alt={dstChain.name}
                    className="chain-picker-icon"
                  />
                  <span className="chain-picker-name">{dstChain.name}</span>
                  <ChevronDown size={13} className="text-muted" />
                </button>

                {/* Dest Token Button */}
                <button
                  type="button"
                  className="token-picker-btn font-mono"
                  onClick={() => setTokenModalType('dst')}
                >
                  <TokenLogo
                    symbol={dstToken.symbol}
                    address={dstToken.address}
                    customUrl={dstToken.icon}
                    size={22}
                  />
                  <span className="token-picker-sym font-bold">{dstToken.symbol}</span>
                  <ChevronDown size={13} className="text-muted" />
                </button>
              </div>

              {/* Estimated Output Read-Only Input */}
              <div className="amount-input-box readonly-box">
                <input
                  type="text"
                  readOnly
                  value={estimatedDestDisplay}
                  className="amount-large-input font-mono readonly text-pulse-green"
                  placeholder="0.0"
                />
                <span className="badge badge-green font-mono text-[11px]">
                  {dstToken.symbol}
                </span>
              </div>

              <div className="section-bottom-info font-mono text-xs">
                <span className="text-muted">
                  ≈ ${parseFloat(estimatedDestDisplay || '0') * (['ETH', 'WETH'].includes(dstToken.symbol) ? 2650 : 1.0)} USD
                </span>
                {quote && (
                  <span className="text-pulse-green">
                    1 {srcToken.symbol} ≈ {(parseFloat(estimatedDestDisplay) / (parseFloat(amount) || 1)).toFixed(4)} {dstToken.symbol}
                  </span>
                )}
              </div>
            </div>

            {/* 3. ROUTE & FEE BREAKDOWN ACCORDION */}
            <div className="quote-breakdown-card glass-panel">
              <button
                type="button"
                className="quote-breakdown-trigger font-mono"
                onClick={() => setShowQuoteDetails(!showQuoteDetails)}
              >
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-pulse-cyan" />
                  <span className="text-xs font-bold text-white">Routing & Fee Breakdown</span>
                  {isSecurityVerified && (
                    <span className="badge badge-green text-[9px]">Verified Router</span>
                  )}
                </div>
                {showQuoteDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showQuoteDetails && (
                <div className="quote-breakdown-body font-mono text-xs animate-fade-in">
                  <div className="breakdown-row">
                    <span className="text-muted">Bridge Provider</span>
                    <span className="text-white font-semibold">Liberty Swap v1 API</span>
                  </div>

                  <div className="breakdown-row">
                    <span className="text-muted">Protocol Bridge Fee</span>
                    <span className="text-pulse-cyan">
                      {quote?.fee?.percentage ? `${quote.fee.percentage}%` : '0.20%'}
                    </span>
                  </div>

                  <div className="breakdown-row">
                    <span className="text-muted">Estimated Time</span>
                    <span className="text-white flex items-center gap-1">
                      <Clock size={11} className="text-pulse-yellow" />
                      <span>{quote?.estimatedTime || '~2-5 minutes'}</span>
                    </span>
                  </div>

                  <div className="breakdown-row">
                    <span className="text-muted">Security Verification</span>
                    {isSecurityVerified ? (
                      <span className="text-pulse-green flex items-center gap-1">
                        <ShieldCheck size={12} />
                        <span>Official Whitelisted Router</span>
                      </span>
                    ) : (
                      <span className="text-muted">Pending quote check...</span>
                    )}
                  </div>

                  {routerAddress && (
                    <div className="breakdown-row router-row">
                      <span className="text-muted">Target Router</span>
                      <div className="flex items-center gap-1.5">
                        <code className="router-code font-mono text-[11px] text-white">
                          {routerAddress.slice(0, 6)}...{routerAddress.slice(-4)}
                        </code>
                        <button
                          type="button"
                          className="btn-icon-subtle p-0.5"
                          onClick={() => handleCopy(routerAddress)}
                          title="Copy router address"
                        >
                          {copiedAddr === routerAddress ? (
                            <Check size={11} className="text-pulse-green" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                        <a
                          href={`${srcChain.explorer}/address/${routerAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted hover:text-white"
                          title="View router contract on explorer"
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  )}

                  {apiError && (
                    <div className="breakdown-error-box text-pulse-red text-[11px] mt-2">
                      <AlertTriangle size={12} className="inline mr-1" />
                      <span>{apiError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. DYNAMIC ACTION BUTTON */}
            <div className="action-button-wrapper mt-4">
              <button
                type="button"
                disabled={actionButtonState.disabled}
                className={`w-full py-3.5 px-4 font-mono font-bold text-sm ${actionButtonState.variant}`}
                onClick={handleMainAction}
              >
                <div className="flex items-center justify-center gap-2">
                  {actionButtonState.icon === 'loading' && (
                    <RefreshCw size={16} className="animate-spin" />
                  )}
                  {actionButtonState.icon === 'shield' && <ShieldCheck size={16} />}
                  {actionButtonState.icon === 'alert' && <AlertTriangle size={16} />}
                  <span>{actionButtonState.label}</span>
                  {actionButtonState.icon === 'swap' && <ArrowRight size={15} />}
                </div>
              </button>
            </div>

            {/* Security Guarantee Note */}
            <div className="crosschain-footer-security font-mono text-[11px] text-muted text-center mt-3">
              <ShieldCheck size={12} className="inline mr-1 text-pulse-green" />
              <span>Non-custodial cross-chain routing. Funds move directly wallet-to-wallet.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Companion Intelligence & Supported Corridors */}
        <div className="crosschain-sidebar-column">
          {/* Card 1: Supported Cross-Chain Networks */}
          <div className="crosschain-info-card glass-panel">
            <div className="info-card-header">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-pulse-green" />
                <span className="font-mono font-bold text-xs text-white">Live Network Corridors</span>
              </div>
              <span className="badge badge-green text-[9px] font-mono">6 Chains</span>
            </div>

            <div className="chains-corridor-grid font-mono">
              {SUPPORTED_CHAINS.map((c) => (
                <div
                  key={c.id}
                  className={`corridor-chip ${
                    srcChain.id === c.id || dstChain.id === c.id ? 'active' : ''
                  }`}
                  onClick={() => {
                    if (srcChain.id !== c.id) updateDstChain(c)
                  }}
                >
                  <img src={c.icon} alt={c.name} className="w-4 h-4 rounded-full" />
                  <span className="text-xs text-white">{c.name}</span>
                  {c.id === 369 && (
                    <span className="badge badge-green text-[8px] ml-auto">Native</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Volume Limits & Safe Bridging Rules */}
          <div className="crosschain-info-card glass-panel">
            <div className="info-card-header">
              <div className="flex items-center gap-2">
                <Flame size={15} className="text-pulse-amber" />
                <span className="font-mono font-bold text-xs text-white">Volume & Limits Guide</span>
              </div>
              <span className="badge badge-pulse text-[9px] font-mono">Liberty v1</span>
            </div>

            <div className="volume-guide-rows font-mono text-xs">
              <div className="guide-row">
                <span className="text-muted">Stablecoins (USDC, USDT, DAI)</span>
                <span className="text-white font-bold">10 - 25,000 USD</span>
              </div>
              <div className="guide-row">
                <span className="text-muted">Native & Wrapped Ether (ETH, WETH)</span>
                <span className="text-white font-bold">0.01 - 20 ETH</span>
              </div>
              <div className="guide-row">
                <span className="text-muted">Rate Limiting Protection</span>
                <span className="text-pulse-cyan">30 Requests / Min</span>
              </div>
              <div className="guide-row no-border">
                <span className="text-muted">Anti-Frontrunning MEV Protection</span>
                <span className="text-pulse-green font-semibold">Enabled</span>
              </div>
            </div>
          </div>

          {/* Card 3: Router Whitelist Verification */}
          <div className="crosschain-info-card glass-panel">
            <div className="info-card-header">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-pulse-cyan" />
                <span className="font-mono font-bold text-xs text-white">Audited Router Whitelist</span>
              </div>
              <span className="badge badge-green text-[9px] font-mono">Protected</span>
            </div>

            <div className="whitelisted-routers-list font-mono text-[11px]">
              <div className="router-whitelist-item">
                <span className="text-muted">PulseChain USDC:</span>
                <code className="text-white">0xe7EE...2F09</code>
              </div>
              <div className="router-whitelist-item">
                <span className="text-muted">PulseChain WETH:</span>
                <code className="text-white">0x80C2...35Cd</code>
              </div>
              <div className="router-whitelist-item">
                <span className="text-muted">Base USDC:</span>
                <code className="text-white">0xefB1...Ced2</code>
              </div>
              <div className="router-whitelist-item">
                <span className="text-muted">Arbitrum USDC:</span>
                <code className="text-white">0x0521...7b6F</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chain Selector Modal */}
      <ChainSelectorModal
        isOpen={chainModalType !== null}
        onClose={() => setChainModalType(null)}
        selectedChainId={chainModalType === 'src' ? srcChain.id : dstChain.id}
        disabledChainId={chainModalType === 'src' ? dstChain.id : srcChain.id}
        onSelectChain={(c) => {
          if (chainModalType === 'src') updateSrcChain(c)
          else updateDstChain(c)
        }}
        title={chainModalType === 'src' ? 'Select Source Network' : 'Select Destination Network'}
      />

      {/* Token Selector Modal */}
      <TokenSelectorModal
        isOpen={tokenModalType !== null}
        onClose={() => setTokenModalType(null)}
        tokens={CHAIN_TOKENS[tokenModalType === 'src' ? srcChain.id : dstChain.id] || []}
        selectedToken={tokenModalType === 'src' ? srcToken : dstToken}
        onSelectToken={(tok) => {
          if (tokenModalType === 'src') setSrcToken(tok)
          else setDstToken(tok)
          triggerSound?.('click')
        }}
        chainName={tokenModalType === 'src' ? srcChain.name : dstChain.name}
      />
    </div>
  )
}
