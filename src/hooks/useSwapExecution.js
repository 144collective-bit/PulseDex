import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { pulsechain } from '../config/pulsechain'
import { FEATURES } from '../config/features'
import { buildApproveCall, buildSwapCall } from '../services/swap'
import { quoteSwap } from '../services/dex'
import { NATIVE_PLS } from '../config/dex'
import {
  APPROVAL,
  BALANCE,
  SWAP_INTENT,
  SWAP_PHASE,
  approvalCoversCall,
  approvalState,
  balanceState,
  blockingReason,
  canBuildSwap,
  derivePhase,
  executionKey,
  isApprovalSettling,
  estimateGasReserve,
  isSwapInFlight,
  maxSpendable,
  needsAllowanceReset,
  needsRequoteConfirmation,
  nextAllowancePollMs,
  quoteDrift,
  parseAmountRaw,
  receiptOutcome,
  routeChanged,
  shouldLockInputs,
  swapAction,
} from '../services/swapFlow'
import { describeTxError, isRejection } from '../utils/walletErrors'
import { explorerTxUrl } from '../utils/explorer'
import { useAllowance } from './useAllowance'
import { useGasPrice, useTokenBalance } from './useTokenBalance'
import { usePulsechainGuard } from './usePulsechainGuard'

/**
 * Running a swap: allowance, approval, the trade, and what happened to it.
 *
 * Every decision this makes lives in `services/swapFlow.js`, which is pure and
 * tested. What is left here is plumbing - wagmi hooks, the hashes they hand
 * back, and the effects that keep the two in step. There is deliberately no
 * branch below that decides anything a test could not otherwise reach, because
 * this project cannot render a component in its test environment and anything
 * decided here would be decided unverified.
 *
 * The hook is null-tolerant on purpose. It is called before tokens resolve and
 * before a wallet is attached, and it must call the same hooks in the same
 * order every render regardless - so it never returns early, and passes
 * `enabled: false` downward instead.
 */
export function useSwapExecution({
  from,
  to,
  amount,
  quote,
  slippagePct,
  deadlineMinutes,
  isQuoteFetching = false,
  isQuoteError = false,
  onSuccess,
  enabled = FEATURES.dexSwapLive,
}) {
  const guard = usePulsechainGuard()
  const { address } = useAccount()

  const [approveHash, setApproveHash] = useState(null)
  const [swapHash, setSwapHash] = useState(null)
  const [approveError, setApproveError] = useState(null)
  const [swapError, setSwapError] = useState(null)
  const [refetchesSinceConfirm, setRefetchesSinceConfirm] = useState(0)

  /*
   * The output the user has actually looked at, and whether it has since moved
   * out from under them. `shownRaw` starts as whatever the panel is displaying
   * and is replaced each time they are shown a new price, so a second press
   * compares against what they just saw rather than against a figure from
   * several moves ago.
   */
  const [priceMoved, setPriceMoved] = useState(null)
  const [routeMoved, setRouteMoved] = useState(false)
  const [acceptedRaw, setAcceptedRaw] = useState(null)
  const [requoting, setRequoting] = useState(false)

  const amountInRaw = parseAmountRaw(amount, from?.decimals)
  /*
   * The router the allowance is about.
   *
   * Normally the one the displayed quote used, but re-pricing at the moment of
   * signing can land on the other one, and from then on it is the new router
   * that matters: the allowance has to be read for it, and an approval has to
   * be granted to it. Held separately from the quote so that switching does
   * not read as a different trade and wipe the state of the one in progress.
   */
  const quotedRouter = quote?.router ?? null
  const [activeRouter, setActiveRouter] = useState(null)
  const spender = activeRouter ?? quotedRouter

  const allowance = useAllowance({
    token: from,
    owner: address,
    spender,
    // Nothing is gained by re-reading an allowance while a transaction that
    // will change it is still in the air.
    enabled: !approveHash && !swapHash,
  })

  /*
   * The pieces of the query that are actually depended on, pinned.
   *
   * React Query returns a new object every render, so an effect or a callback
   * that names `allowance` restarts on every render - which for the poll below
   * means the timer is cleared and rebuilt before it can ever fire. `refetch`
   * is stable across renders; `data` is a bigint. Naming those two directly is
   * what makes the schedule actually elapse.
   */
  const allowanceRaw = allowance.data
  const refetchAllowance = allowance.refetch

  /*
   * Two balances, because both can be the thing that stops a trade. Selling a
   * token needs that token and some PLS for the fee; selling PLS needs the
   * amount and the fee to come out of one balance.
   */
  const isNativeFrom = from?.address === NATIVE_PLS
  const fromBalance = useTokenBalance({ token: from, owner: address })
  const nativeBalance = useTokenBalance({
    token: { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' },
    owner: address,
    enabled: Boolean(address) && !isNativeFrom,
  })
  const gasPrice = useGasPrice({ enabled: Boolean(address) })

  const gasReserveRaw = estimateGasReserve(gasPrice.data)
  const nativeBalanceRaw = isNativeFrom ? fromBalance.data : nativeBalance.data

  const balance = balanceState({
    isNative: isNativeFrom,
    balanceRaw: fromBalance.data,
    nativeBalanceRaw,
    amountInRaw,
    gasReserveRaw,
    isLoading: fromBalance.isLoading || (!isNativeFrom && nativeBalance.isLoading),
    isError: fromBalance.isError,
  })

  const approveWrite = useWriteContract()
  const swapWrite = useWriteContract()

  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveHash ?? undefined,
    chainId: pulsechain.id,
    confirmations: 1,
  })
  const swapReceipt = useWaitForTransactionReceipt({
    hash: swapHash ?? undefined,
    chainId: pulsechain.id,
    confirmations: 1,
  })

  const approveOutcome = receiptOutcome(approveReceipt.data)
  const swapOutcome = receiptOutcome(swapReceipt.data)

  const approval = approvalState({
    from,
    allowanceRaw,
    amountInRaw,
    isLoading: allowance.isLoading,
    isError: allowance.isError,
  })

  const approvalSettling = isApprovalSettling({
    approveConfirmed: approveOutcome === 'success',
    approval,
    refetchesSinceConfirm,
  })

  /*
   * Asked, then discarded. The real call has to be built at the moment of
   * clicking because it carries a deadline: one built during render and held
   * would be signed stale by anyone who left the panel open.
   */
  const canBuild = useMemo(
    () =>
      canBuildSwap({
        quote,
        from,
        to,
        amount,
        slippagePct,
        recipient: address,
        deadlineMinutes,
      }),
    [quote, from, to, amount, slippagePct, address, deadlineMinutes]
  )

  const block = blockingReason({
    enabled,
    isConnected: guard.isConnected,
    chainId: guard.chainId,
    expectedChainId: pulsechain.id,
    from,
    to,
    amountRaw: amountInRaw,
    quote,
    isQuoteFetching,
    isQuoteError,
    canBuild,
    balance,
  })

  const { phase, failedStep } = derivePhase({
    block,
    approval,
    approve: {
      pending: approveWrite.isPending,
      hash: approveHash,
      outcome: approveOutcome,
      error: approveError,
    },
    swap: {
      pending: swapWrite.isPending,
      hash: swapHash,
      outcome: swapOutcome,
      error: swapError,
    },
    approvalSettling,
    priceMoved: Boolean(priceMoved),
    isRejection,
  })

  const inFlight = isSwapInFlight(phase)

  const reset = useCallback(() => {
    setApproveHash(null)
    setSwapHash(null)
    setApproveError(null)
    setSwapError(null)
    setRefetchesSinceConfirm(0)
    setPriceMoved(null)
    setAcceptedRaw(null)
    setActiveRouter(null)
    setRouteMoved(false)
    approveWrite.reset?.()
    swapWrite.reset?.()
  }, [approveWrite, swapWrite])

  /*
   * Look again after an approval lands.
   *
   * The read very often reaches a different node than the one that accepted the
   * approval, and that node can be a block or two behind. Bounded, so a chain
   * that genuinely has not caught up ends in an honest "approve again" rather
   * than a spinner with no end.
   */
  useEffect(() => {
    if (approveOutcome !== 'success') return undefined
    if (approval === APPROVAL.satisfied) return undefined

    const wait = nextAllowancePollMs(refetchesSinceConfirm)
    if (wait === null) return undefined

    const id = window.setTimeout(() => {
      refetchAllowance()
      setRefetchesSinceConfirm((n) => n + 1)
    }, wait)

    return () => window.clearTimeout(id)
  }, [approveOutcome, approval, refetchesSinceConfirm, refetchAllowance])

  /*
   * Forget a finished trade when the user moves on to a different one - but
   * never while something is still outstanding, or a pending hash would vanish
   * from the panel while its transaction is still in the mempool.
   */
  const key = executionKey({
    from,
    to,
    amount,
    slippagePct,
    recipient: address,
    chainId: guard.chainId,
    router: quotedRouter,
  })
  const lastKey = useRef(key)

  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    if (!inFlight) reset()
  }, [key, inFlight, reset])

  /** Let the host refresh balances once a trade has actually cleared. */
  const notified = useRef(false)
  useEffect(() => {
    if (phase !== SWAP_PHASE.success) {
      notified.current = false
      return
    }
    if (notified.current) return
    notified.current = true
    refetchAllowance()
    onSuccess?.()
  }, [phase, onSuccess, refetchAllowance])

  const approve = useCallback(async () => {
    setApproveError(null)
    setRefetchesSinceConfirm(0)
    if (!from || !spender || !amountInRaw) return

    try {
      /*
       * USDT and its clones refuse to raise a standing allowance, so it is
       * cleared first. Only in that window - a fresh approval from zero needs
       * one signature, not two.
       */
      if (needsAllowanceReset({ allowanceRaw, amountInRaw })) {
        const zero = buildApproveCall({ token: from, spender, amountRaw: 1n })
        if (zero) {
          await approveWrite.writeContractAsync({ ...zero, args: [spender, 0n] })
        }
      }

      const call = buildApproveCall({ token: from, spender, amountRaw: amountInRaw })
      if (!call) return

      const hash = await approveWrite.writeContractAsync(call)
      setApproveHash(hash)
    } catch (err) {
      setApproveError(err)
    }
  }, [from, spender, amountInRaw, allowanceRaw, approveWrite])

  const swap = useCallback(async () => {
    setSwapError(null)
    if (!address) return

    /*
     * Price the trade again, now, and sign that.
     *
     * The displayed quote refreshes on a twelve-second cycle, so the floor
     * derived from it can be that far behind the pool. A stale floor does not
     * lose anyone money - it is a floor - but it reverts, and a revert is paid
     * for in gas. Asking once more costs a round trip and removes the whole
     * class of failure.
     */
    setRequoting(true)
    let fresh
    try {
      fresh = await quoteSwap({ from, to, amount })
    } catch (err) {
      setRequoting(false)
      setSwapError(err)
      return
    }
    setRequoting(false)

    if (!fresh) {
      // Refusing beats signing against a price we could not confirm: the
      // trade would revert and the gas would be spent finding that out.
      setSwapError(new Error('Could not price this trade just now. Try again.'))
      return
    }

    /*
     * The route moved to the other router.
     *
     * Only when an allowance is in play. Selling native PLS approves nothing,
     * so which router the call names costs the user a press for no reason -
     * the call is built from `fresh` and names the right one either way.
     *
     * When it does matter, nothing is signed on this press: pointing the
     * allowance at the new router has to happen first, which re-reads it and
     * lets the button offer an approval for the router the trade will actually
     * use. Carrying on here would fail the spender check below and then send
     * the user to approve the old router again - a loop with a fee on a lap.
     */
    if (approval !== APPROVAL.notRequired && routeChanged(spender, fresh.router)) {
      setActiveRouter(fresh.router)
      setAcceptedRaw(fresh.amountOutRaw)
      setRouteMoved(true)
      return
    }
    setRouteMoved(false)

    /*
     * A move beyond their own tolerance is shown rather than signed. The floor
     * is rebuilt from the fresh quote either way, so nobody is unprotected -
     * what is missing is consent to a number they have not seen.
     */
    const shownRaw = acceptedRaw ?? quote?.amountOutRaw
    if (needsRequoteConfirmation({ shownRaw, freshRaw: fresh.amountOutRaw, slippagePct })) {
      setPriceMoved({
        drift: quoteDrift(shownRaw, fresh.amountOutRaw),
        amountOut: fresh.amountOut,
        quote: fresh,
      })
      setAcceptedRaw(fresh.amountOutRaw)
      return
    }

    setPriceMoved(null)
    setAcceptedRaw(fresh.amountOutRaw)

    const call = buildSwapCall({
      quote: fresh,
      from,
      to,
      amount,
      slippagePct,
      recipient: address,
      deadlineMinutes,
      nowMs: Date.now(),
    })
    if (!call) return

    /*
     * Last check before signing: the allowance that was validated has to name
     * the router this call is actually going to. A quote that flipped V2 to V1
     * between the approval and the press would otherwise spend a real
     * transaction discovering the mismatch.
     */
    if (
      from?.address !== undefined &&
      approval !== APPROVAL.notRequired &&
      !approvalCoversCall({ allowanceRaw, spender, call, amountInRaw })
    ) {
      setSwapError(new Error('The approval does not cover this route. Approve again.'))
      return
    }

    try {
      const hash = await swapWrite.writeContractAsync(call)
      setSwapHash(hash)
    } catch (err) {
      setSwapError(err)
    }
  }, [
    address,
    quote,
    acceptedRaw,
    from,
    to,
    amount,
    slippagePct,
    deadlineMinutes,
    approval,
    allowanceRaw,
    spender,
    amountInRaw,
    swapWrite,
  ])

  const base = swapAction({ phase, block, fromSymbol: from?.symbol ?? 'token', failedStep })

  const onClick = useMemo(() => {
    switch (base.intent) {
      case SWAP_INTENT.switchChain:
        return guard.switchToPulsechain
      case SWAP_INTENT.approve:
        return approve
      case SWAP_INTENT.swap:
      // Accepting re-prices once more before signing, which is the point: the
      // number just shown could itself have moved while it was being read.
      case SWAP_INTENT.acceptPrice:
        return swap
      case SWAP_INTENT.reset:
        return reset
      default:
        return undefined
    }
  }, [base.intent, guard.switchToPulsechain, approve, swap, reset])

  const errorMessage =
    describeTxError(swapError, { step: 'swap' }) ||
    describeTxError(approveError, { step: 'approve' }) ||
    (approval === APPROVAL.unreadable ? 'Could not read the token allowance. Try again.' : null) ||
    guard.switchError ||
    null

  return {
    phase,
    block,
    approval,
    failedStep,
    action: {
      ...base,
      busy: base.busy || guard.isSwitching || requoting,
      onClick,
      // A connect intent has no handler here - the host owns the wallet modal.
      needsConnect: base.intent === SWAP_INTENT.connect,
    },
    isInFlight: inFlight,
    inputsLocked: shouldLockInputs(phase),
    balance,
    priceMoved,
    routeMoved,
    isRequoting: requoting,
    balanceRaw: fromBalance.data,
    /*
     * The largest amount that can actually be sent - the whole balance for a
     * token, and everything but the fee reserve for native PLS. Offered as a
     * bigint so the panel formats it with the token's own decimals rather than
     * round-tripping it through a float.
     */
    maxSpendableRaw: maxSpendable({
      balanceRaw: fromBalance.data,
      isNative: isNativeFrom,
      gasReserveRaw,
    }),
    approveHash,
    swapHash,
    explorer: {
      approve: explorerTxUrl(approveHash),
      swap: explorerTxUrl(swapHash),
    },
    errorMessage,
    reset,
  }
}

export default useSwapExecution
