import { Flame, MessagesSquare, TrendingUp } from 'lucide-react'
import { useTrending } from '../../hooks/useTrending'
import { trendingLabel } from '../../utils/trending'
import { formatAddress, formatUsd } from '../../utils/formatters'

/**
 * What is moving, and whether anybody is talking about it.
 *
 * Two columns of one list rather than two lists, and the order comes from one
 * of them only.
 *
 * **Ranked on-chain. Social activity is context and never a ranking signal.**
 * Said on the surface itself, not just in the code, because a reader deciding
 * what to look at needs to know what put it in front of them:
 *
 *   A trending list built from mentions is a pump button. A handful of
 *   accounts posting a ticker repeatedly would put it at the top, labelled as
 *   organic interest. Trading a token moves this list; posting about it does
 *   not.
 *
 * The useful part is where the two disagree. A token doing six times its usual
 * hour with an empty room is something nobody has noticed yet; a busy room
 * around a token doing nothing is a conversation about a token that is not
 * moving. Both are worth knowing and a single blended score would have
 * destroyed exactly that.
 */
export default function TrendingPanel({ pairs, onOpenToken, onOpenRoom }) {
  const rows = useTrending(pairs)

  return (
    <div className="trending-panel">
      {/*
        The method, on the surface, in one sentence. Not a tooltip and not
        buried in a help page: the whole defensibility of a list like this on a
        site about which tokens to buy is that a reader can tell what it
        measures.
      */}
      <p className="trending-note">
        Ranked by the last hour&apos;s volume against each pair&apos;s own daily average —
        so a small token can be here and a large one is not here by default.
        Trading moves this list; posting about a token does not.
      </p>

      {rows.length === 0 ? (
        /*
         * Said rather than shown empty. "Nothing is trading unusually fast" is
         * a real answer about the market; an empty list reads as the surface
         * being broken, and the two must not look the same.
         */
        <p className="chat-empty">
          Nothing is trading unusually fast right now. This fills up when a pair
          starts running above its own normal rate.
        </p>
      ) : (
        <ol className="trending-list">
          {rows.map(({ pair, score, messages }) => (
            <li key={pair.pairAddress} className="trending-row">
              <button
                type="button"
                className="trending-main"
                /*
                 * The address, not the pair. `openToken` in App.jsx takes an
                 * address and guards with `if (!address) return` - so a pair
                 * object passes the guard, lands in the route as the address,
                 * and builds a URL for a token that does not exist. Caught by
                 * reading the call site rather than by any test, because the
                 * types agree at every step.
                 */
                onClick={() => onOpenToken?.(pair.baseToken?.address)}
                title={pair.baseToken?.address || ''}
              >
                <span className="trending-symbol font-mono">
                  {pair.baseToken?.symbol || formatAddress(pair.baseToken?.address)}
                </span>

                <span className="trending-rate">
                  <Flame size={11} aria-hidden="true" />
                  {trendingLabel(score)}
                </span>

                {/* The absolute figure beside the ratio, because the ratio
                    alone cannot tell a $6k hour from a $6m one - and on a
                    trading surface that is the difference between a curiosity
                    and something worth acting on. */}
                <span className="trending-volume font-mono">
                  {formatUsd(Number(pair.volume?.h1 ?? 0))} this hour
                </span>
              </button>

              {/*
                The social column. Deliberately not a number dressed up as
                momentum: null means no room exists for this token yet, which
                is different from a room nobody is using, and the two are
                worded differently rather than both showing a zero.
              */}
              {messages === null ? (
                <span className="trending-social is-quiet">No room yet</span>
              ) : (
                <button
                  type="button"
                  className="trending-social"
                  onClick={() => onOpenRoom?.(pair.baseToken?.address)}
                >
                  <MessagesSquare size={11} aria-hidden="true" />
                  {messages === 1 ? '1 message' : `${messages} messages`}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="trending-foot">
        <TrendingUp size={11} aria-hidden="true" />
        <span>
          Volume and liquidity from DexScreener. A pair needs real depth behind it
          to appear, because a pool with none can be moved by a single trade.
        </span>
      </p>
    </div>
  )
}
