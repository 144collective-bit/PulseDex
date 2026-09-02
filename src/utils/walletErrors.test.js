import { describe, it, expect } from 'vitest'
import { isRejection, describeTxError } from './walletErrors'

/*
 * Telling a refusal from a failure.
 *
 * The distinction matters more than the wording. Someone who closes a wallet
 * prompt has not hit a problem, and showing them an error for it teaches them
 * that the red text means nothing - which is the state you do not want them in
 * when a trade actually fails.
 */

const withCode = (code) => Object.assign(new Error('Request failed'), { code })
const withCause = (code) => Object.assign(new Error('Request failed'), { cause: { code } })

describe('isRejection', () => {
  it('recognises the EIP-1193 refusal code, wrapped or not', () => {
    expect(isRejection(withCode(4001))).toBe(true)
    expect(isRejection(withCause(4001))).toBe(true)
  })

  it('recognises the wordings wallets actually use', () => {
    for (const message of [
      'User rejected the request',
      'user denied transaction signature',
      'MetaMask Tx Signature: User denied transaction signature.',
      'The request was cancelled',
      'Request canceled by user',
    ]) {
      expect(isRejection(new Error(message))).toBe(true)
    }
  })

  it('does not mistake a revert for a refusal', () => {
    expect(isRejection(new Error('execution reverted: TRANSFER_FROM_FAILED'))).toBe(false)
    expect(isRejection(withCode(-32000))).toBe(false)
    expect(isRejection(undefined)).toBe(false)
  })
})

describe('describeTxError', () => {
  it('says nothing at all for a refusal', () => {
    // Nothing went wrong, so there is nothing to report.
    expect(describeTxError(withCode(4001))).toBeNull()
    expect(describeTxError(null)).toBeNull()
  })

  it('names the gas case, which is the one people hit first', () => {
    const message = describeTxError(new Error('insufficient funds for gas * price + value'))

    expect(message).toMatch(/gas/i)
  })

  it('explains a failed transfer rather than repeating the revert string', () => {
    /*
     * TRANSFER_FROM_FAILED almost never means what it says: it is an approval
     * that did not stick, or a token that taxes transfers so the pool receives
     * less than the router was told to expect.
     */
    const onSwap = describeTxError(new Error('execution reverted: TransferHelper: TRANSFER_FROM_FAILED'), {
      step: 'swap',
    })
    const onApprove = describeTxError(new Error('TRANSFER_FROM_FAILED'), { step: 'approve' })

    expect(onSwap).toMatch(/approval|fee on transfer/i)
    expect(onApprove).toMatch(/cleared first|refused the approval/i)
  })

  it('explains a slippage failure as a price move, not a fault', () => {
    const message = describeTxError(new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT'))

    expect(message).toMatch(/slippage|price moved/i)
  })

  it('names an expired deadline', () => {
    expect(describeTxError(new Error('execution reverted: EXPIRED'))).toMatch(/deadline/i)
  })

  it('names thin liquidity', () => {
    expect(describeTxError(new Error('execution reverted: INSUFFICIENT_LIQUIDITY'))).toMatch(
      /liquidity/i
    )
  })

  it('tells a wallet that does not know PulseChain to add it', () => {
    const message = describeTxError(
      new Error('Unrecognized chain ID. Try adding the chain using wallet_addEthereumChain first.')
    )

    expect(message).toMatch(/369|add the network/i)
  })

  it('falls back to a plain sentence rather than a stack trace', () => {
    const ugly = Object.assign(new Error('x'.repeat(400)), { shortMessage: 'y'.repeat(400) })

    const message = describeTxError(ugly)

    expect(message).toBe('The transaction failed. Nothing was traded.')
  })

  it('prefers a wallet short message when there is a readable one', () => {
    const err = Object.assign(new Error('long internal detail'), {
      shortMessage: 'The contract function reverted.',
    })

    expect(describeTxError(err)).toBe('The contract function reverted.')
  })
})
