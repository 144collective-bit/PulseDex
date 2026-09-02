import { useMemo, useState } from 'react'
import { X, Search, ShieldCheck, AlertTriangle, Loader2, Droplets } from 'lucide-react'
import TokenLogo from '../TokenLogo'
import { CURATED_TOKENS } from '../../config/dex'
import { fetchTokenMeta } from '../../services/dex'
import { rankTokens } from '../../services/tokenList'
import { useTradableTokens, useTokenSearch } from '../../hooks/useTradableTokens'
import { formatAddress } from '../../utils/formatters'
import { useEscapeKey } from '../../hooks/useEscapeKey'

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/** Compact USD, for a figure whose magnitude matters more than its digits. */
function usd(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

/** A price that may be very small, which on this chain most of them are. */
function price(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (n >= 0.0001) return `$${n.toFixed(6)}`
  return `$${n.toExponential(2)}`
}

/**
 * Token picker.
 *
 * It used to list the eleven curated tokens and nothing else, so anything
 * beyond them needed a contract address pasted in - the picker could only help
 * someone who already knew what they wanted. It now lists every token with a
 * real market, and falls back to searching DexScreener for anything rarer.
 *
 * Curated entries stay marked and stay first. Symbols are not unique on
 * PulseChain - three separate contracts answer to "PRVX" and only one is
 * ProveX - so a name is never proof of identity, and the warning on anything
 * unverified is the point of the list rather than decoration on it.
 *
 * Decimals are read when a token is picked, not when the list is built.
 * DexScreener does not carry them and the swap maths cannot work without them,
 * but reading them for several hundred tokens to populate a list would be
 * hundreds of calls to answer a question about the one that gets chosen.
 */
export default function TokenSelectModal({ open, onClose, onSelect, excludeAddress }) {
  useEscapeKey(open, onClose)

  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState(null)
  const [error, setError] = useState(null)
  const [resolving, setResolving] = useState(null)

  const trimmed = query.trim()
  const isAddress = ADDRESS_RE.test(trimmed)

  const { tokens, isLoading } = useTradableTokens()

  const listed = useMemo(
    () => rankTokens(tokens, { query: trimmed, excludeAddress }),
    [tokens, trimmed, excludeAddress]
  )

  // Only asked once the list itself has come up short, so an ordinary search
  // costs nothing.
  const { tokens: found, isFetching: searching } = useTokenSearch(trimmed, {
    enabled: open && !isAddress && listed.length === 0,
  })

  const remote = useMemo(() => {
    const already = new Set(listed.map((t) => t.address.toLowerCase()))
    return found.filter((t) => !already.has(t.address.toLowerCase()))
  }, [found, listed])

  /**
   * Hand back a token the panel can actually quote.
   *
   * Curated entries already carry decimals. Anything from the market does not,
   * and a token parsed at the wrong scale is the difference between selling one
   * and selling ten billion.
   */
  const choose = async (token) => {
    if (token.decimals != null) {
      onSelect(token)
      onClose()
      return
    }

    setError(null)
    setResolving(token.address.toLowerCase())
    try {
      const meta = await fetchTokenMeta(token.address)
      if (!meta || meta.decimals == null) {
        setError(`Could not read ${token.symbol} from the chain. It may not be a standard token.`)
        return
      }
      /*
       * Decimals from the chain, everything else from the market entry.
       * `fetchTokenMeta` reports the symbol as the name and carries no logo, so
       * spreading it last would replace a real name and picture with a
       * placeholder for no reason.
       */
      onSelect({ ...token, decimals: meta.decimals, verified: Boolean(token.verified) })
      onClose()
    } catch {
      setError(`Could not read ${token.symbol} from the chain.`)
    } finally {
      setResolving(null)
    }
  }

  const lookupCustom = async () => {
    setError(null)
    setCustom(null)
    if (!isAddress) return

    const known = CURATED_TOKENS.find((t) => t.address.toLowerCase() === trimmed.toLowerCase())
    if (known) return

    setResolving(trimmed.toLowerCase())
    try {
      const meta = await fetchTokenMeta(trimmed)
      if (meta?.symbol) setCustom({ ...meta, verified: false })
      else setError('No token found at that address.')
    } catch {
      setError('That address did not respond as a token contract.')
    } finally {
      setResolving(null)
    }
  }

  if (!open) return null

  const row = (token, { unverified = false } = {}) => (
    <button
      key={token.address}
      type="button"
      className={`dex-token-row ${unverified ? 'is-unlisted' : ''}`}
      onClick={() => choose(token)}
      disabled={resolving === token.address.toLowerCase()}
    >
      <TokenLogo
        symbol={token.symbol}
        address={token.isNative ? undefined : token.address}
        customUrl={token.logo}
        size={34}
      />
      <span className="dex-token-ident">
        <span className="dex-token-sym">
          {token.symbol}
          {token.verified && <ShieldCheck size={12} className="dex-token-verified" />}
        </span>
        {/* Unverified rows carry their address.
            Searching "atropa" returns three separate contracts and "hex"
            returns two, all with names that read alike - so on anything the
            curated list does not vouch for, the address is the only thing that
            actually tells them apart. Verified rows do not need it: being on
            the list is the identity. */}
        <span className="dex-token-name truncate">
          {token.verified ? (
            token.name
          ) : (
            <>
              {token.name}
              <span className="dex-token-addr">{formatAddress(token.address, 6, 4)}</span>
            </>
          )}
        </span>
      </span>
      <span className="dex-token-market">
        {resolving === token.address.toLowerCase() ? (
          <Loader2 size={14} className="dex-spin" />
        ) : (
          <>
            {price(token.priceUsd) && (
              <span className="dex-token-price">{price(token.priceUsd)}</span>
            )}
            {usd(token.liquidityUsd) && (
              <span className="dex-token-liq" title="Pool liquidity">
                <Droplets size={10} />
                {usd(token.liquidityUsd)}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  )

  return (
    <div className="dex-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="dex-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select a token"
      >
        <header className="dex-modal-head">
          <h3>Select a token</h3>
          <button type="button" className="dex-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="dex-search">
          <Search size={14} className="dex-search-icon" />
          <input
            type="text"
            className="dex-search-input"
            placeholder="Search name, symbol or paste an address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCustom(null)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && isAddress && lookupCustom()}
            autoFocus
          />
          {isAddress && !custom && (
            <button type="button" className="dex-lookup-btn" onClick={lookupCustom}>
              Look up
            </button>
          )}
          {(isLoading || searching) && <Loader2 size={14} className="dex-spin" />}
        </div>

        {error && <p className="dex-token-error">{error}</p>}

        <div className="dex-token-list">
          {listed.map((token) => row(token))}

          {remote.length > 0 && (
            <>
              <p className="dex-token-section">Found on DexScreener — not on our list</p>
              {remote.map((token) => row(token, { unverified: true }))}
            </>
          )}

          {custom && (
            <div className="dex-custom-token">
              <div className="dex-custom-warn">
                <AlertTriangle size={14} />
                <div>
                  <strong>Unverified token</strong>
                  <p>
                    This is not on our list. Anyone can deploy a token using any
                    name or symbol, including copies of well-known ones. Check the
                    contract address against a source you trust before trading.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="dex-token-row is-custom"
                onClick={() => {
                  onSelect(custom)
                  onClose()
                }}
              >
                <TokenLogo symbol={custom.symbol} address={custom.address} size={34} />
                <span className="dex-token-ident">
                  <span className="dex-token-sym">{custom.symbol}</span>
                  <span className="dex-token-name truncate">
                    {custom.name} · {formatAddress(custom.address, 6, 4)}
                  </span>
                </span>
                <span className="dex-token-anyway">Use anyway</span>
              </button>
            </div>
          )}

          {isLoading && !listed.length && <p className="dex-token-empty">Loading tokens…</p>}

          {!isLoading && !listed.length && !remote.length && !custom && !searching && (
            <p className="dex-token-empty">
              {isAddress
                ? 'Press Look up to check this address.'
                : 'Nothing matched. Paste a contract address to trade anything else.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
