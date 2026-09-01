/**
 * A grid of labelled figures.
 *
 * Shared so that the pair panel, the liquidity panel and the portfolio panel
 * present numbers identically. A stat with a null value renders as an em dash
 * rather than as zero - "we do not have this" and "this is zero" are different
 * statements and must not look the same.
 */
export default function StatGrid({ stats, columns }) {
  return (
    <dl className="dash-stat-row" style={columns ? { '--dash-stat-cols': columns } : undefined}>
      {stats.map((s) => (
        <div key={s.label} className="dash-stat">
          <dt>{s.label}</dt>
          <dd className={s.tone ? `is-${s.tone}` : undefined}>
            {s.value == null || s.value === '' ? <span className="dash-muted">&mdash;</span> : s.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
