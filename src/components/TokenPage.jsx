import { ArrowLeft, Loader2, SearchX, ExternalLink } from 'lucide-react'
import TrenchTokenModal from './TrenchTokenModal'
import { useTokenDetail } from '../hooks/usePumpTires'

/**
 * Full-page view of a token, reached at /token/<address>.
 *
 * Renders the same panel as the board's modal so the two can never drift
 * apart - a modal is chrome around a body, and this is the other chrome. In
 * phase two, when tokens get claimable profiles, this is the page that grows
 * rather than a second implementation.
 */
export default function TokenPage({ address, plsPrice, onBack }) {
  const { data: token, isLoading, isError } = useTokenDetail(address)

  return (
    <div className="token-page">
      <button type="button" className="token-page-back" onClick={onBack}>
        <ArrowLeft size={15} />
        <span>Back to the board</span>
      </button>

      {isLoading && !token && (
        <div className="token-page-state">
          <Loader2 size={18} className="tch-spin" />
          <span>Loading token…</span>
        </div>
      )}

      {isError && !token && (
        <div className="token-page-state is-error">
          <span>That token could not be loaded.</span>
        </div>
      )}

      {/* Resolved successfully with nothing to show. This page is fed by the
          bonding-curve launchpad, so any address that is not one of its
          launches - a major asset, a typo, a stale link - lands here. Without
          this branch the page rendered blank apart from the back button. */}
      {!isLoading && !isError && !token && (
        <div className="token-page-state is-empty">
          <SearchX size={22} />
          <h2>No launchpad token at this address</h2>
          <p>
            This page covers tokens launched on the pump.tires bonding curve.
            {address ? ' ' : ''}
            {address && <code>{address}</code>} is not one of them — it may be a
            token that trades on the open market instead, or the link may be wrong.
          </p>
          <div className="token-page-state-actions">
            <button type="button" className="btn-sm" onClick={onBack}>
              Back to the board
            </button>
            {address && (
              <a
                className="btn-sm"
                href={`https://scan.pulsechain.com/token/${address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on PulseScan
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      {token && (
        <TrenchTokenModal
          token={token}
          plsPrice={plsPrice}
          onClose={onBack}
          variant="page"
        />
      )}
    </div>
  )
}
