import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Wallet } from 'lucide-react'
import TokenLogo from '../TokenLogo'
import { fetchWalletPortfolio } from '../../services/portfolio'
import { hiddenHoldingsLabel, visibleHoldings } from '../../utils/holdings'
import { formatUsd } from '../../utils/formatters'

/**
 * What this account holds, when it has asked for that to be shown.
 *
 * Drawn only when `profiles.show_holdings` is true. The switch is off for
 * every account until they throw it, and the reasoning is in
 * 0019_profile_depth.sql - briefly: none of this is secret, balances are on
 * the chain and an explorer will show anybody's to anybody, but publishing
 * them under a handle changes what is *findable*. Today you need somebody's
 * address to look at their money; here you would need only to have read one
 * of their posts.
 *
 * So this component never decides to appear. It is rendered when the account
 * said so and not otherwise, and there is no "partially shown" state to get
 * wrong.
 *
 * Read from the reader's own browser, like the portfolio page does, rather
 * than through our own endpoint. Worth stating because Batch 3 will fetch link
 * previews server-side specifically so a reader's IP never reaches the target,
 * and this is the opposite choice. The difference is who is on the other end:
 * a link preview's target is an arbitrary site chosen by the person being
 * looked at, while this is the block explorer the app already talks to from
 * the browser on the screener and the portfolio page. Routing it through our
 * own function would make us a portfolio-lookup proxy for any address anybody
 * names, which is a bigger thing to operate than this feature is worth.
 */
export default function HoldingsPanel({ address, isMine }) {
  const [state, setState] = useState({ status: 'loading', holdings: null })

  useEffect(() => {
    if (!address) return undefined

    let active = true
    setState({ status: 'loading', holdings: null })

    fetchWalletPortfolio(address)
      .then((portfolio) => {
        if (!active) return
        setState({ status: 'ready', holdings: visibleHoldings(portfolio?.tokens) })
      })
      .catch(() => {
        // One line of a profile. A failure says so and says nothing else -
        // there is no retry worth offering for a decoration.
        if (active) setState({ status: 'failed', holdings: null })
      })

    return () => {
      active = false
    }
  }, [address])

  if (state.status === 'loading') {
    return (
      <section className="xp-holdings">
        <Head />
        <p className="chat-notice">
          <Loader2 size={14} className="chat-spin" />
          <span>Reading the chain</span>
        </p>
      </section>
    )
  }

  if (state.status === 'failed') {
    return (
      <section className="xp-holdings">
        <Head />
        <p className="chat-notice">
          <AlertTriangle size={14} />
          <span>Holdings could not be read just now.</span>
        </p>
      </section>
    )
  }

  const { shown, totalUsd, hidden } = state.holdings
  const notShown = hiddenHoldingsLabel(hidden)

  return (
    <section className="xp-holdings">
      <Head total={totalUsd} />

      {shown.length === 0 ? (
        <p className="chat-empty">Nothing here worth listing.</p>
      ) : (
        <ul className="xp-holdings-list">
          {shown.map((token) => (
            <li key={token.address} className="xp-holding">
              <TokenLogo address={token.address} symbol={token.symbol} size={22} />

              <span className="xp-holding-name">
                {token.symbol}
                {/*
                  Symbols are not unique on PulseChain and this is where that
                  bites: two tokens both called DAI, one worth a fifth of a
                  cent and one worth a dollar. The portfolio list works this
                  out once - see fetchWalletPortfolio - and a reader comparing
                  two rows with the same name needs to be told which case they
                  are in.
                */}
                {token.ambiguousSymbol && (
                  <span className="xp-holding-warn" title={token.address}>
                    this symbol is used by more than one token
                  </span>
                )}
              </span>

              <span className="xp-holding-value font-mono">{formatUsd(token.valueUsd)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* What was left out, and why, rather than a trimmed list presented as
          a whole one. hiddenHoldingsLabel names the reasons - airdropped spam
          in particular, so a reader judging somebody by their wallet does not
          count forty scam tokens against them. */}
      {notShown && <p className="xp-holdings-hidden">{notShown}</p>}

      <p className="xp-holdings-note">
        {isMine
          ? 'Your holdings are public on your profile because you turned this on. Turn it off in profile settings.'
          : 'Shown because this account chose to. Balances come from the chain and are not a recommendation.'}
      </p>
    </section>
  )
}

function Head({ total = null }) {
  return (
    <header className="xp-holdings-head">
      <h2>
        <Wallet size={13} />
        Holdings
      </h2>
      {/* The total covers everything the wallet holds, including the rows
          below the cut - so the number is the truth about the wallet even
          though the list under it is a selection. */}
      {total !== null && <span className="font-mono">{formatUsd(total)}</span>}
    </header>
  )
}
