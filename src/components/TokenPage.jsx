import { ArrowLeft, Loader2 } from 'lucide-react'
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
