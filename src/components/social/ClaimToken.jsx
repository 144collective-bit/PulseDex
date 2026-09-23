import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import DevBadge from './DevBadge'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { prepareClaim, submitClaim } from '../../services/claims'
import { formatAddress } from '../../utils/formatters'

/**
 * Claiming a token, from the token's own page.
 *
 * Shown to everyone rather than only to whoever could succeed, because the
 * only way to know who that is would be to publish the deploying wallet
 * beside every token as a "claim this" prompt - which is a list of addresses
 * worth phishing. The person who deployed it knows they deployed it.
 *
 * What the button actually does: asks the server for a message, asks the
 * wallet to sign it, and sends the signature back. Nothing here decides
 * anything. The server rebuilds the message, checks the signature against it,
 * and then checks the signing address against what the chain says sent the
 * creation transaction - all three, server-side, every time.
 */
export default function ClaimToken({ token, claim, onClaimed }) {
  const { account, isSignedIn, signIn, isBusy } = useSiweAuth()

  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  const mine = Boolean(account) && claim?.address === account.toLowerCase()

  /*
   * Already claimed by somebody.
   *
   * Says who, shortened, rather than only that it is taken. A reader looking
   * at a badge on a message wants to be able to check that the two are the
   * same account, and an unnamed "claimed" tells them nothing they can check.
   */
  if (claim) {
    return (
      <div className="token-claim is-claimed">
        <DevBadge size="full" />
        <span className="token-claim-who font-mono">
          {mine ? 'Claimed by you' : `Claimed by ${formatAddress(claim.address)}`}
        </span>
      </div>
    )
  }

  async function start() {
    setWorking(true)
    setError(null)

    try {
      const message = await prepareClaim(token)

      /*
       * Signed through the injected provider directly.
       *
       * `personal_sign` rather than anything typed: it is what every wallet
       * on this chain supports, and the message is deliberately prose so the
       * person reading the wallet prompt can tell what they are agreeing to.
       */
      const provider = window.ethereum
      if (!provider?.request) {
        throw new Error('No wallet is available in this browser.')
      }

      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, account],
      })

      await submitClaim({ token, signature })
      onClaimed?.()
    } catch (err) {
      /*
       * A wallet rejection is not a failure worth a red message - the person
       * chose it. 4001 is the EIP-1193 code every wallet sends for that.
       */
      if (err?.code !== 4001) {
        setError(err.message || 'That claim could not be completed.')
      }
    } finally {
      setWorking(false)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="token-claim">
        <button type="button" className="btn-sm" onClick={signIn} disabled={isBusy}>
          {isBusy ? 'Signing in' : 'Sign in to claim this token'}
        </button>
        <p className="token-claim-note">
          Deployed this token? Sign in with the wallet that sent its creation
          transaction to claim it.
        </p>
      </div>
    )
  }

  return (
    <div className="token-claim">
      <button type="button" className="btn-sm" onClick={start} disabled={working}>
        {working && <Loader2 size={12} className="chat-spin" />}
        {working ? 'Waiting for your wallet' : 'Claim this token'}
      </button>

      {error ? (
        <p className="token-claim-note is-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="token-claim-note">
          {/*
            Says what will be checked before anybody signs anything. Somebody
            whose launch went through a factory from a different wallet should
            find that out here, not from a refusal after a wallet prompt.
          */}
          Only the wallet that sent this token’s creation transaction can claim
          it. Signing costs no gas and transfers nothing.
        </p>
      )}
    </div>
  )
}
