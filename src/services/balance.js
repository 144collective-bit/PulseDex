import { publicClient as client } from './rpc'
import { NATIVE_PLS } from '../config/dex'

/**
 * What a wallet actually holds, in raw units.
 *
 * Raw on purpose. The portfolio service already reads balances, but it returns
 * floats for display - `parseFloat(formatUnits(...))` - and a float is not
 * something to compare an amount against when the answer decides whether a
 * transaction is offered. An 18-decimal balance can carry more significant
 * digits than a double, so the comparison has to happen in integers or it will
 * eventually say "you have enough" to someone who does not.
 */

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

const isNative = (token) => token?.address === NATIVE_PLS

/**
 * The wallet's balance of one token.
 *
 * @returns {Promise<bigint|null>} null when there is nothing to ask about.
 */
export async function readBalance({ token, owner }) {
  if (!token || !owner) return null

  if (isNative(token)) return client.getBalance({ address: owner })

  return client.readContract({
    address: token.address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [owner],
  })
}

/**
 * The current gas price, for working out what to leave behind.
 *
 * Read rather than assumed: on this chain the figure is large and moves, so a
 * hardcoded reserve is either too small to cover a fee or large enough to
 * matter to a small wallet.
 */
export async function readGasPrice() {
  return client.getGasPrice()
}
