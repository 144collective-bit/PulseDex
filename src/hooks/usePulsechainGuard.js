import { useCallback, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { pulsechain } from '../config/pulsechain'
import { chainGate } from '../services/swapFlow'
import { isRejection, describeTxError } from '../utils/walletErrors'

/**
 * Which network the wallet is on, and getting it onto the right one.
 *
 * The chain id comes from `useAccount()`, deliberately, and not from
 * `useChainId()`. The latter reports the chain wagmi's config is currently
 * pointed at, which can read as PulseChain while the wallet itself sits
 * somewhere else entirely; `useAccount().chainId` is the connector's own answer
 * and is `undefined` when the wallet is on a chain the app does not list. That
 * `undefined` is a real state - it has to block, not pass - and only one of the
 * two hooks can express it.
 *
 * WalletConnectModal still uses `useChainId`. Left alone rather than changed
 * blind, but the two will disagree for a wallet parked on an unlisted chain,
 * and this is the one that must be trusted before anything is signed.
 */
export function usePulsechainGuard() {
  const { isConnected, chainId } = useAccount()
  const { switchChainAsync, isPending } = useSwitchChain()
  const [switchError, setSwitchError] = useState(null)

  const gate = chainGate({ isConnected, chainId, expected: pulsechain.id })

  /*
   * Awaited rather than fired and forgotten, so declining the prompt can be
   * told apart from a wallet that has never heard of chain 369 - the second
   * needs the user to add the network by hand, and saying nothing leaves them
   * pressing a button that appears to do nothing.
   */
  const switchToPulsechain = useCallback(async () => {
    setSwitchError(null)
    try {
      await switchChainAsync({ chainId: pulsechain.id })
      return true
    } catch (err) {
      if (!isRejection(err)) setSwitchError(describeTxError(err, { step: 'swap' }))
      return false
    }
  }, [switchChainAsync])

  return {
    isConnected,
    chainId,
    gate,
    isWrongChain: gate === 'wrong',
    isSwitching: isPending,
    switchError,
    switchToPulsechain,
  }
}

export default usePulsechainGuard
