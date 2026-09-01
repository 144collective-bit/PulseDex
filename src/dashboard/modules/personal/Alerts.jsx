import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Plus, X } from 'lucide-react'
import TokenSelector from '../../components/TokenSelector'
import { useTopPairs } from '../../services/marketData'
import { ModuleEmpty } from '../../components/ModuleStates'
import { readScoped, writeScoped } from '../../../utils/profileStorage'
import { useSiweAuth } from '../../../context/SiweAuthContext'
import { NATIVE_PLS } from '../../../config/dex'
import { WPLS } from '../../state/tokens'
import { formatCryptoPrice, formatUsd } from '../../../utils/formatters'

/**
 * User-defined alert rules.
 *
 * Rules are real: they are stored per account, evaluated against live market
 * data, and a rule whose condition is met is marked as met on screen.
 *
 * What they are not is notifications. PulseDEX has no notification backend -
 * no push, no email, no worker evaluating rules while the tab is closed - so a
 * rule only fires while this dashboard is open and looking at it. The module
 * says that outright rather than implying a watchdog that does not exist.
 *
 * The integration point is a server-side evaluator reading these same rules;
 * the shape below is what it would consume.
 */

const KEY = 'dashboard_alerts'

const METRICS = {
  price: { label: 'Price', read: (p) => Number(p.priceUsd ?? 0), format: (v) => `${formatCryptoPrice(v)}` },
  change24h: {
    label: '24h change %',
    read: (p) => Number(p.priceChange?.h24 ?? 0),
    format: (v) => `${v.toFixed(2)}%`,
  },
  volume24h: {
    label: '24h volume',
    read: (p) => Number(p.volume?.h24 ?? 0),
    format: (v) => formatUsd(v, 0),
  },
  liquidity: {
    label: 'Liquidity',
    read: (p) => Number(p.liquidity?.usd ?? 0),
    format: (v) => formatUsd(v, 0),
  },
}

const OPERATORS = { gt: { label: 'rises above', test: (a, b) => a > b }, lt: { label: 'falls below', test: (a, b) => a < b } }

export default function Alerts() {
  const { account } = useSiweAuth()
  const { data: pairs } = useTopPairs()

  const [rules, setRules] = useState(() => {
    const stored = readScoped(KEY, account, null)
    return Array.isArray(stored?.rules) ? stored.rules : []
  })
  const [draft, setDraft] = useState({ token: null, metric: 'price', operator: 'gt', value: '' })
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const stored = readScoped(KEY, account, null)
    setRules(Array.isArray(stored?.rules) ? stored.rules : [])
  }, [account])

  const commit = useCallback(
    (next) => {
      setRules(next)
      writeScoped(KEY, account, { rules: next })
    },
    [account],
  )

  /**
   * Evaluate every rule against the current board.
   *
   * A rule whose token has no market is reported as such rather than silently
   * counted as not-met - "we cannot check this" and "this is false" are
   * different answers.
   */
  const evaluated = useMemo(() => {
    return rules.map((rule) => {
      if (!pairs?.length) return { ...rule, state: 'pending' }

      const wanted =
        rule.token?.address === NATIVE_PLS ? WPLS.address : rule.token?.address
      const pair = pairs.find(
        (p) => p.baseToken?.address?.toLowerCase() === wanted?.toLowerCase(),
      )
      if (!pair) return { ...rule, state: 'unknown' }

      const spec = METRICS[rule.metric] ?? METRICS.price
      const current = spec.read(pair)
      const met = (OPERATORS[rule.operator] ?? OPERATORS.gt).test(current, Number(rule.value))

      return { ...rule, state: met ? 'met' : 'waiting', current, format: spec.format }
    })
  }, [rules, pairs])

  const addRule = () => {
    if (!draft.token || !draft.value) return
    commit([...rules, { ...draft, id: `alert-${Date.now()}`, value: Number(draft.value) }])
    setDraft({ token: null, metric: 'price', operator: 'gt', value: '' })
    setAdding(false)
  }

  return (
    <div className="dash-alerts">
      {evaluated.length === 0 && !adding ? (
        <ModuleEmpty label="No alerts set" hint="Add a rule to watch a price or a volume level." />
      ) : null}

      {evaluated.length > 0 ? (
        <ul className="dash-alert-list">
          {evaluated.map((rule) => {
            const spec = METRICS[rule.metric] ?? METRICS.price
            return (
              <li key={rule.id} className={`dash-alert is-${rule.state}`}>
                <Bell size={13} aria-hidden="true" />
                <span className="dash-alert-text">
                  <strong>{rule.token?.symbol}</strong> {spec.label.toLowerCase()}{' '}
                  {(OPERATORS[rule.operator] ?? OPERATORS.gt).label} {spec.format(Number(rule.value))}
                </span>
                <span className="dash-alert-state">
                  {rule.state === 'met' ? 'Met' : null}
                  {rule.state === 'waiting' && rule.current != null
                    ? `now ${spec.format(rule.current)}`
                    : null}
                  {rule.state === 'unknown' ? 'no market' : null}
                  {rule.state === 'pending' ? 'checking' : null}
                </span>
                <button
                  type="button"
                  className="dash-icon-btn"
                  onClick={() => commit(rules.filter((r) => r.id !== rule.id))}
                  aria-label={`Delete alert for ${rule.token?.symbol}`}
                >
                  <X size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {adding ? (
        <div className="dash-alert-form">
          <TokenSelector
            label="Token"
            value={draft.token}
            onChange={(t) => setDraft((d) => ({ ...d, token: t }))}
          />
          <select
            className="dash-input"
            value={draft.metric}
            onChange={(e) => setDraft((d) => ({ ...d, metric: e.target.value }))}
            aria-label="Metric"
          >
            {Object.entries(METRICS).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            className="dash-input"
            value={draft.operator}
            onChange={(e) => setDraft((d) => ({ ...d, operator: e.target.value }))}
            aria-label="Condition"
          >
            {Object.entries(OPERATORS).map(([k, o]) => (
              <option key={k} value={k}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="dash-input"
            placeholder="Value"
            value={draft.value}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
            aria-label="Threshold value"
          />
          <button type="button" className="dash-btn dash-btn-sm dash-btn-primary" onClick={addRule}>
            Add
          </button>
          <button type="button" className="dash-btn dash-btn-sm" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="dash-btn dash-btn-sm" onClick={() => setAdding(true)}>
          <Plus size={12} /> Add alert
        </button>
      )}

      <p className="dash-module-note">
        Rules are checked while this dashboard is open. PulseDEX has no notification service, so
        nothing is sent to you when the tab is closed.
      </p>
    </div>
  )
}
