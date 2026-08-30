import { useMemo, useState } from 'react'
import { X, Search, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react'
import TokenLogo from '../TokenLogo'
import { CURATED_TOKENS } from '../../config/dex'
import { fetchTokenMetadata } from '../../services/portfolio'
import { formatAddress } from '../../utils/formatters'

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * Token picker.
 *
 * Curated tokens are listed first and marked verified. Any other address can
 * still be traded, but only behind an explicit warning: symbols are not unique
 * on PulseChain - three separate contracts answer to "PRVX" and only one is
 * ProveX - so a name alone is never proof of identity.
 */
export default function TokenSelectModal({ open, onClose, onSelect, excludeAddress }) {
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const trimmed = query.trim()
  const isAddress = ADDRESS_RE.test(trimmed)

  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase()
    return CURATED_TOKENS.filter((t) => {
      if (excludeAddress && t.address === excludeAddress) return false
      if (!q) return true
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase() === q
      )
    })
  }, [trimmed, excludeAddress])

  const lookupCustom = async () => {
    setError(null)
    setCustom(null)
    if (!isAddress) return

    const known = CURATED_TOKENS.find(
      (t) => t.address.toLowerCase() === trimmed.toLowerCase()
    )
    if (known) return

    setLoading(true)
    try {
      const meta = await fetchTokenMetadata(trimmed)
      if (meta?.symbol) setCustom({ ...meta, verified: false })
      else setError('No token found at that address.')
    } catch {
      setError('That address did not respond as a token contract.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

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
            onKeyDown={(e) => e.key === 'Enter' && lookupCustom()}
            autoFocus
          />
          {isAddress && !custom && !loading && (
            <button type="button" className="dex-lookup-btn" onClick={lookupCustom}>
              Look up
            </button>
          )}
          {loading && <Loader2 size={14} className="dex-spin" />}
        </div>

        {error && <p className="dex-token-error">{error}</p>}

        <div className="dex-token-list">
          {filtered.map((token) => (
            <button
              key={token.address}
              type="button"
              className="dex-token-row"
              onClick={() => {
                onSelect(token)
                onClose()
              }}
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
                  <ShieldCheck size={12} className="dex-token-verified" />
                </span>
                <span className="dex-token-name truncate">{token.name}</span>
              </span>
            </button>
          ))}

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

          {!filtered.length && !custom && !loading && (
            <p className="dex-token-empty">
              {isAddress
                ? 'Press Look up to check this address.'
                : 'No matching token. Paste a contract address to trade anything else.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
