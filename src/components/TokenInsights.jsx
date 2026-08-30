import { useMemo } from 'react'
import { PieChart, ShieldCheck, ShieldAlert, TrendingUp } from 'lucide-react'
import { formatCompactCount, formatAddress, formatUsd } from '../utils/formatters'
import { ipfsImageUrl } from '../services/pumptires'

/**
 * Dashboard panels beneath the trade tape.
 *
 * Everything here is derived from data already fetched for the panel - the
 * holder list and the trade page - so these add no extra requests.
 */

/** Concentration bands, which is what actually signals risk on a launchpad. */
function distribution(holders, supplyBase) {
  if (!holders.length || !supplyBase) return null

  const share = (h) => (h.balance / supplyBase) * 100
  const top1 = share(holders[0])
  const top5 = holders.slice(0, 5).reduce((s, h) => s + share(h), 0)
  const top10 = holders.slice(0, 10).reduce((s, h) => s + share(h), 0)

  // Anything outside the top ten, plus whatever supply no listed holder owns.
  const rest = Math.max(0, 100 - top10)

  return { top1, top5, top10, rest }
}

export default function TokenInsights({ token, holders = [], trades = [] }) {
  const supplyBase = token?.totalSupply > 0
    ? token.totalSupply
    : holders.reduce((s, h) => s + h.balance, 0)

  const dist = useMemo(() => distribution(holders, supplyBase), [holders, supplyBase])

  // Deployer signals. The launchpad exposes the creator, so we can say whether
  // they still hold and how much - the single most useful rug check available.
  const deployer = useMemo(() => {
    const addr = (token?.creatorAddress || '').toLowerCase()
    if (!addr) return null

    const holding = holders.find((h) => (h.address || '').toLowerCase() === addr)
    const pct = holding && supplyBase ? (holding.balance / supplyBase) * 100 : 0
    const sells = trades.filter(
      (t) => t.type === 'sell' && (t.userAddress || '').toLowerCase() === addr
    )

    return {
      address: token.creatorAddress,
      username: token.creatorUsername,
      holds: Boolean(holding),
      pct,
      soldCount: sells.length,
      soldUsd: sells.reduce((s, t) => s + (t.usdValue || 0), 0),
    }
  }, [token, holders, trades, supplyBase])

  // Verdict is deliberately conservative and states its own basis, because a
  // clean reading here is not the same as a safe token.
  const verdict = useMemo(() => {
    if (!dist) return null
    if (dist.top1 >= 30) return { tone: 'bad', text: `Top holder controls ${dist.top1.toFixed(1)}% of supply` }
    if (dist.top10 >= 80) return { tone: 'bad', text: `Top 10 control ${dist.top10.toFixed(1)}% of supply` }
    if (dist.top10 >= 50) return { tone: 'warn', text: `Top 10 control ${dist.top10.toFixed(1)}% of supply` }
    return { tone: 'ok', text: `Top 10 control ${dist.top10.toFixed(1)}% of supply` }
  }, [dist])

  if (!dist) return null

  const bands = [
    { key: 'top1', label: 'Top holder', value: dist.top1, cls: 'band-1' },
    { key: 'next4', label: 'Holders 2-5', value: dist.top5 - dist.top1, cls: 'band-2' },
    { key: 'next5', label: 'Holders 6-10', value: dist.top10 - dist.top5, cls: 'band-3' },
    { key: 'rest', label: 'Everyone else', value: dist.rest, cls: 'band-4' },
  ]

  return (
    <div className="tm-insights">
      {/* ---- Holder distribution ---- */}
      <section className="tmi-panel">
        <header className="tmi-head">
          <PieChart size={14} className="text-pulse-cyan" />
          <h4>Holder distribution</h4>
        </header>

        <div className="tmi-dist-bar" role="img" aria-label="Supply concentration by holder band">
          {bands.map((b) => (
            b.value > 0.05 && (
              <span
                key={b.key}
                className={`tmi-seg ${b.cls}`}
                style={{ width: `${b.value}%` }}
                title={`${b.label}: ${b.value.toFixed(2)}%`}
              />
            )
          ))}
        </div>

        <ul className="tmi-legend">
          {bands.map((b) => (
            <li key={b.key}>
              <span className={`tmi-dot ${b.cls}`} aria-hidden="true" />
              <span className="tmi-legend-label">{b.label}</span>
              <span className="tmi-legend-val">{b.value.toFixed(1)}%</span>
            </li>
          ))}
        </ul>

        {verdict && (
          <div className={`tmi-verdict tone-${verdict.tone}`}>
            {verdict.tone === 'ok' ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
            <span>{verdict.text}</span>
          </div>
        )}
      </section>

      {/* ---- Deployer ---- */}
      <section className="tmi-panel">
        <header className="tmi-head">
          <TrendingUp size={14} className="text-pulse-purple" />
          <h4>Deployer</h4>
        </header>

        {deployer ? (
          <div className="tmi-rows">
            <div className="tmi-deployer-id">
              {/* The launchpad carries a creator avatar for roughly half of
                  tokens; initials stand in for the rest. */}
              {token.creatorAvatarCid ? (
                <img
                  className="tmi-avatar"
                  src={ipfsImageUrl(token.creatorAvatarCid)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="tmi-avatar is-fallback" aria-hidden="true">
                  {(deployer.username || '?').slice(0, 2).toUpperCase()}
                </span>
              )}

              <span className="tmi-deployer-name">
                {deployer.username || formatAddress(deployer.address, 6, 4)}
              </span>

              {token.creatorTwitter && (
                <a
                  className="tmi-deployer-link"
                  href={token.creatorTwitter}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  X
                </a>
              )}
            </div>

            {token.creatorBio && <p className="tmi-bio">{token.creatorBio}</p>}
            <div className="tmi-row">
              <span className="tmi-row-label">Still holding</span>
              <span className={`tmi-row-val ${deployer.holds ? 'is-ok' : 'is-warn'}`}>
                {deployer.holds ? `Yes · ${deployer.pct.toFixed(2)}% of supply` : 'No balance'}
              </span>
            </div>
            <div className="tmi-row">
              <span className="tmi-row-label">Sells in recent trades</span>
              <span className={`tmi-row-val ${deployer.soldCount ? 'is-warn' : 'is-ok'}`}>
                {deployer.soldCount
                  ? `${deployer.soldCount} · ${formatUsd(deployer.soldUsd)}`
                  : 'None seen'}
              </span>
            </div>
            <p className="tmi-note">
              Sells are counted across the {trades.length} most recent trades only,
              not the token's full history.
            </p>
          </div>
        ) : (
          <p className="tmi-empty">The launchpad reports no deployer for this token.</p>
        )}
      </section>

      {/* ---- Top holders ---- */}
      <section className="tmi-panel tmi-wide">
        <header className="tmi-head">
          <PieChart size={14} className="text-pulse-green" />
          <h4>Largest holders</h4>
        </header>

        <ol className="tmi-holders">
          {holders.slice(0, 6).map((h, i) => {
            const pct = supplyBase ? (h.balance / supplyBase) * 100 : 0
            return (
              <li key={h.address}>
                <span className="tmi-h-rank">{i + 1}</span>
                <span className="tmi-h-name truncate">
                  {h.username || formatAddress(h.address, 6, 4)}
                </span>
                <span className="tmi-h-bar">
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                </span>
                <span className="tmi-h-pct">{pct.toFixed(2)}%</span>
                <span className="tmi-h-bal">{formatCompactCount(h.balance)}</span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
