import { ShieldCheck, Sparkles, RotateCcw } from 'lucide-react'
import {
  QUALITY_SIGNALS,
  DEFAULT_QUALITY,
  RECOMMENDED_QUALITY,
  activeQualityCount,
} from '../utils/trenchQuality'
import { useDismissable } from '../hooks/useDismissable'
import FloatingMenu from './FloatingMenu'

/**
 * The launch-quality filters, in the New Launches heading.
 *
 * A popover rather than a row of chips: each of these needs a sentence saying
 * what it removes, and the heading has room for an icon. Every switch carries
 * a live count of the rows it is taking out right now, which is the only
 * honest way to offer a heuristic - it can be seen working before it is
 * trusted.
 *
 * It sits in the column rather than the shared bar because it belongs to one
 * column: scripted launches arrive here, and anything that reached King of the
 * Hill or graduated has already been judged by the market more harshly than
 * these signals could.
 */
export default function TrenchQualityMenu({ quality, counts, onChange }) {
  const { open, toggle, close, wrapRef, buttonRef, floatRef } = useDismissable()
  const active = activeQualityCount(quality)

  const set = (id, value) => onChange({ ...quality, [id]: value })

  return (
    <div className="trench-quality" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`trench-quality-btn ${active ? 'is-on' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          active
            ? `${active} quality filter${active === 1 ? '' : 's'} on - hiding scripted launches`
            : 'Hide bot launches and low-effort tokens'
        }
      >
        <ShieldCheck size={12} />
        {active > 0 && <span className="tqb-count font-mono">{active}</span>}
      </button>

      {open && (
        <FloatingMenu
          anchorRef={buttonRef}
          floatRef={floatRef}
          onDismiss={close}
          className="trench-quality-menu"
          role="dialog"
          aria-label="Launch quality filters"
        >
          <div className="tqm-head">
            <p className="tqm-title font-mono">LAUNCH QUALITY</p>
            <p className="tqm-note">
              Signals of effort, not safety. LP is locked automatically on this launchpad, so
              none of these predict a rug — they separate hand-made launches from scripted ones.
            </p>
          </div>

          <div className="tqm-list">
            {QUALITY_SIGNALS.map((signal) => {
              const on = Boolean(quality?.[signal.id])
              const removes = counts?.[signal.id] || 0

              return (
                <label key={signal.id} className={`tqm-row ${on ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => set(signal.id, e.target.checked)}
                  />
                  <span className="tqm-text">
                    <span className="tqm-label">Hide {signal.label.toLowerCase()}</span>
                    <span className="tqm-hint">{signal.hint}</span>
                  </span>
                  {/* Counted across the loaded rows, like every other filter. */}
                  <span className="tqm-count font-mono" title="Rows this would hide right now">
                    {removes}
                  </span>
                </label>
              )
            })}
          </div>

          <div className="tqm-actions">
            <button
              type="button"
              className="tfb-reset"
              onClick={() => {
                onChange(RECOMMENDED_QUALITY)
                close()
              }}
            >
              <Sparkles size={11} />
              <span>Recommended</span>
            </button>

            <button
              type="button"
              className="tfb-reset"
              onClick={() => {
                onChange(DEFAULT_QUALITY)
                close()
              }}
            >
              <RotateCcw size={11} />
              <span>All off</span>
            </button>
          </div>

          <p className="tqm-foot">Starred tokens are never hidden by these.</p>
        </FloatingMenu>
      )}
    </div>
  )
}
