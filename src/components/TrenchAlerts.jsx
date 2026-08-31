import { Rocket, Crown, X } from 'lucide-react'
import TrenchTokenLogo from './TrenchTokenLogo'

const COPY = {
  grad: { icon: Rocket, label: 'Graduated', tone: 'is-grad' },
  koth: { icon: Crown, label: 'New King of the Hill', tone: 'is-koth' },
}

/**
 * Board events, announced in the corner of the page.
 *
 * Silent by design - no audio, nothing that steals focus, and each one fades
 * itself out after a few seconds. A trader watching this board is reading it,
 * not waiting to be summoned by it.
 *
 * `aria-live="polite"` rather than "assertive": a screen reader should finish
 * the sentence it is on before it mentions that a token graduated.
 */
export default function TrenchAlerts({ alerts, onDismiss, onSelectToken }) {
  if (!alerts?.length) return null

  return (
    <div className="trench-alerts" role="status" aria-live="polite">
      {alerts.map((alert) => {
        const { icon: Icon, label, tone } = COPY[alert.kind] || COPY.grad
        const token = alert.token

        return (
          <div key={alert.id} className={`trench-alert ${tone}`}>
            <button
              type="button"
              className="trench-alert-main"
              onClick={() => {
                onSelectToken?.(token)
                onDismiss?.(alert.id)
              }}
            >
              <span className="ta-icon">
                <Icon size={12} />
              </span>

              <TrenchTokenLogo
                cid={token.imageCid}
                address={token.address}
                symbol={token.symbol}
                size={26}
                eager
              />

              <span className="ta-text">
                <span className="ta-label font-mono">{label}</span>
                <span className="ta-symbol font-mono">{token.symbol}</span>
              </span>
            </button>

            <button
              type="button"
              className="trench-alert-close"
              onClick={() => onDismiss?.(alert.id)}
              aria-label="Dismiss"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
