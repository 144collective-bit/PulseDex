/**
 * Pool activity, for the dashboard.
 *
 * The reconstruction itself is app-level rather than dashboard-level: the
 * screener's trade tape reads the same swaps from the same pools, and two
 * implementations of "what traded here" would drift apart. This re-export keeps
 * the dashboard's imports pointing at its own services directory while there is
 * only one source underneath.
 */

export { fetchPoolSwaps, usePoolSwaps } from '../../services/poolSwaps'
