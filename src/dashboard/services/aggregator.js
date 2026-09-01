import { quoteSwap, minimumReceived } from '../../services/dex'
import { NATIVE_PLS } from '../../config/dex'

/**
 * The swap aggregator seam.
 *
 * The Trade module talks to this interface and never to PulseX. That is the
 * whole point: when a real PulseChain aggregator is wired in, it becomes a
 * second object implementing the same three methods, and the module does not
 * change.
 *
 * @typedef {Object} SwapAggregator
 * @property {string} id
 * @property {string} name
 * @property {(params: QuoteParams) => Promise<Quote|null>} getQuote
 * @property {(params: QuoteParams) => Promise<Route|null>} getRoute
 * @property {(params: BuildParams) => Promise<never>} buildTransaction
 * @property {{ multiHop: boolean, execution: boolean }} capabilities
 *
 * @typedef {Object} QuoteParams
 * @property {import('../types/dashboard.js').TokenRef} from
 * @property {import('../types/dashboard.js').TokenRef} to
 * @property {string|number} amount
 * @property {number} [slippage] Percent.
 *
 * @typedef {Object} Quote
 * @property {number} amountIn
 * @property {number} amountOut
 * @property {number} rate
 * @property {number|null} priceImpact  Percent, or null when it could not be probed.
 * @property {number} minimumReceived
 * @property {Route} route
 * @property {string} venue
 *
 * @typedef {Object} Route
 * @property {string[]} path   Contract addresses, input first.
 * @property {number} hops
 * @property {string} venue
 */

/**
 * PulseX, read-only.
 *
 * Wraps the quoting already in `services/dex.js`, which asks both the V2 and V1
 * routers and takes the better answer. It already routes through WPLS when two
 * assets have no direct pool, so the "HEX to USDC via WPLS" case works today -
 * the two selected tokens are never required to share a pool.
 *
 * `execution: false` is the honest part. Nothing in PulseDEX signs or sends a
 * transaction: there is no wallet client, no approval flow and no swap call
 * anywhere in the app. Rather than shipping a button that silently does nothing,
 * this capability flag is what the UI reads to disable execution and say why.
 */
export const pulseXAggregator = {
  id: 'pulsex',
  name: 'PulseX',
  capabilities: { multiHop: true, execution: false },

  async getQuote({ from, to, amount, slippage = 0.5 }) {
    const raw = await quoteSwap({ from, to, amount })
    if (!raw) return null

    return {
      amountIn: raw.amountIn,
      amountOut: raw.amountOut,
      rate: raw.rate,
      priceImpact: raw.impact,
      minimumReceived: minimumReceived(raw.amountOut, slippage),
      venue: raw.routerLabel,
      route: { path: raw.path, hops: raw.hops, venue: raw.routerLabel },
    }
  },

  async getRoute(params) {
    const quote = await this.getQuote(params)
    return quote?.route ?? null
  },

  /**
   * Deliberately unimplemented.
   *
   * Building a swap transaction means approvals and signing, and neither exists
   * in this codebase yet. Throwing here rather than returning a plausible object
   * means the gap cannot be mistaken for working code by whoever wires the real
   * aggregator in.
   */
  async buildTransaction() {
    throw new Error(
      'PulseDEX has no transaction signing path yet. Swaps are quoted here and executed elsewhere.',
    )
  },
}

/**
 * The registry of available aggregators.
 *
 * One entry today. It is a list rather than a constant so that adding a second
 * is a push, and so the Trade module can offer a venue choice without being
 * rewritten when there is more than one to choose from.
 */
export const AGGREGATORS = [pulseXAggregator]

export function getAggregator(id) {
  return AGGREGATORS.find((a) => a.id === id) ?? AGGREGATORS[0]
}

/** Native PLS has no contract, so route display has to special-case the sentinel. */
export function isNative(address) {
  return address === NATIVE_PLS
}
