import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2, Search, ShieldCheck, AlertTriangle } from 'lucide-react'
import TokenLogo from '../../components/TokenLogo'
import { CURATED_TOKENS } from '../../config/dex'
import { fetchTokenMetadata } from '../../services/portfolio'
import { formatAddress } from '../../utils/formatters'
import { useDismissable } from '../../hooks/useDismissable'
import { POPULAR_TOKENS, toTokenRef } from '../state/tokens'
import { readScoped, writeScoped } from '../../utils/profileStorage'
import { useSiweAuth } from '../../context/SiweAuthContext'

/**
 * The token picker, used by every module that needs an asset.
 *
 * There is already a token modal in the DEX terminal; this is the inline
 * version the dashboard needs, because a module configuring itself should not
 * throw a full-screen dialog over the canvas. The two share the curated list,
 * the logo component and the same rule about unverified addresses.
 *
 * That rule is the important part: symbols are not unique on PulseChain -
 * several contracts answer to the same ticker and only one of them is the real
 * asset - so anything outside the curated list is selectable but is marked, and
 * is shown by address rather than by name alone.
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const RECENTS_KEY = 'dashboard_recent_tokens'
const MAX_RECENTS = 6

function readRecents(account) {
  const stored = readScoped(RECENTS_KEY, account, null)
  return Array.isArray(stored?.tokens) ? stored.tokens : []
}

export default function TokenSelector({
  value,
  onChange,
  label = 'Token',
  excludeAddress,
  allowNative = true,
  className = '',
}) {
  const { account } = useSiweAuth()
  const menu = useDismissable()
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recents, setRecents] = useState(() => readRecents(account))

  useEffect(() => setRecents(readRecents(account)), [account])

  const trimmed = query.trim()
  const isAddress = ADDRESS_RE.test(trimmed)

  const pool = useMemo(
    () => CURATED_TOKENS.filter((t) => allowNative || !t.isNative),
    [allowNative],
  )

  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase()
    return pool.filter((t) => {
      if (excludeAddress && t.address?.toLowerCase() === excludeAddress?.toLowerCase()) return false
      if (!q) return true
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase() === q
      )
    })
  }, [pool, trimmed, excludeAddress])

  /*
   * An address that matches nothing curated is read off the chain rather than
   * rejected. Decimals in particular have to come from the contract - assuming
   * 18 for a 6-decimal token misprices everything downstream by a factor of a
   * trillion, and it renders as a perfectly ordinary number.
   */
  useEffect(() => {
    if (!isAddress || filtered.length > 0) {
      setCustom(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTokenMetadata(trimmed)
      .then((meta) => {
        if (cancelled) return
        setCustom(meta ? { ...meta, address: trimmed, verified: false } : null)
        if (!meta) setError('No token found at that address')
      })
      .catch(() => {
        if (!cancelled) setError('Could not read that contract')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [isAddress, trimmed, filtered.length])

  const select = useCallback(
    (token) => {
      const ref = toTokenRef(token)
      onChange?.(ref)

      // Recents are per account, like everything else the dashboard stores.
      const next = [ref, ...recents.filter((t) => t.address !== ref.address)].slice(0, MAX_RECENTS)
      setRecents(next)
      writeScoped(RECENTS_KEY, account, { tokens: next })

      setQuery('')
      menu.close()
    },
    [onChange, recents, account, menu],
  )

  const renderRow = (token, key) => (
    <button
      type="button"
      key={key ?? token.address}
      className="dash-token-row"
      onClick={() => select(token)}
    >
      <TokenLogo symbol={token.symbol} address={token.address} size={20} />
      <span className="dash-token-symbol">{token.symbol}</span>
      <span className="dash-token-name">{token.name}</span>
      {token.verified ? (
        <ShieldCheck size={12} className="dash-token-verified" aria-label="Curated token" />
      ) : (
        <span className="dash-token-addr">{formatAddress(token.address)}</span>
      )}
    </button>
  )

  return (
    <div className={`dash-token-select ${className}`} ref={menu.wrapRef}>
      <button
        type="button"
        ref={menu.buttonRef}
        className="dash-token-trigger"
        onClick={menu.toggle}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-label={value ? `${label}: ${value.symbol}. Change token` : `Select ${label}`}
      >
        {value ? (
          <>
            <TokenLogo symbol={value.symbol} address={value.address} size={18} />
            <span className="dash-token-symbol">{value.symbol}</span>
          </>
        ) : (
          <span className="dash-token-placeholder">Select token</span>
        )}
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {menu.open ? (
        <div className="dash-token-panel" ref={menu.floatRef} role="dialog" aria-label={`Select ${label}`}>
          <div className="dash-token-search">
            <Search size={13} aria-hidden="true" />
            <input
              autoFocus
              type="text"
              value={query}
              placeholder="Search name, symbol or paste address"
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search tokens"
            />
          </div>

          <div className="dash-token-list">
            {!trimmed && recents.length > 0 ? (
              <>
                <p className="dash-token-group">Recent</p>
                {recents.map((t) => renderRow(t, `recent-${t.address}`))}
                <p className="dash-token-group">Popular</p>
                {POPULAR_TOKENS.map((t) => renderRow(t, `popular-${t.address}`))}
              </>
            ) : null}

            {trimmed || recents.length === 0 ? (
              <>
                {filtered.length > 0 ? <p className="dash-token-group">Curated</p> : null}
                {filtered.map((t) => renderRow(t))}
              </>
            ) : null}

            {loading ? (
              <div className="dash-module-state">
                <Loader2 size={14} className="dash-spin" aria-hidden="true" />
                <span>Reading contract</span>
              </div>
            ) : null}

            {custom ? (
              <>
                <p className="dash-token-group dash-token-group-warn">
                  <AlertTriangle size={11} aria-hidden="true" /> Not on the curated list
                </p>
                {renderRow(custom, 'custom')}
                <p className="dash-token-warning">
                  Several contracts can share a ticker on PulseChain. Check the address against a
                  source you trust before trading it.
                </p>
              </>
            ) : null}

            {!loading && !custom && filtered.length === 0 ? (
              <div className="dash-module-state">
                <span>{error ?? 'No matching token'}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
