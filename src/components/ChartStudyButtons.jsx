import { Check } from 'lucide-react'
import { EMA_PERIODS, SMA_PERIODS, RSI_PERIODS, maCount } from '../config/chartTools'
import { useDismissable } from '../hooks/useDismissable'
import FloatingMenu from './FloatingMenu'

/**
 * One study menu, shaped for the vertical rail.
 *
 * Anchored left so the panel opens across the chart rather than off the side
 * of the window - the rail is 52px from the left edge and a right-aligned menu
 * would have nowhere to go.
 */
function RailMenu({ label, badge, title, children, wide = false }) {
  const { open, toggle, close, wrapRef, buttonRef, floatRef } = useDismissable()

  return (
    <div className="cdr-study" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`cdr-btn cdr-study-btn ${badge ? 'active' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
      >
        <span className="cdr-study-label font-mono">{label}</span>
        {badge > 0 && <span className="cdr-study-count font-mono">{badge}</span>}
      </button>

      {open && (
        <FloatingMenu
          anchorRef={buttonRef}
          floatRef={floatRef}
          align="left"
          onDismiss={close}
          className={`chart-menu-panel ${wide ? 'is-wide' : ''}`}
          role="dialog"
          aria-label={title}
        >
          {children}
        </FloatingMenu>
      )}
    </div>
  )
}

/** A checkable row, shared by both menus. */
function Row({ on, onClick, swatch, children }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      className={`cmp-item ${on ? 'is-on' : ''}`}
      onClick={onClick}
    >
      <Check size={11} className={on ? '' : 'is-hidden'} />
      {swatch && <span className="cmp-swatch" style={{ background: swatch }} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  )
}

/**
 * Moving averages and RSI, living in the drawing rail.
 *
 * They were in the bar across the top, which had accumulated the chart type,
 * the scale, three menus and five intervals - while the rail below the drawing
 * tools sat empty. These are the two studies with periods worth choosing, so
 * they are the two that earn a permanent control rather than a line in a
 * general menu.
 */
export default function ChartStudyButtons({
  settings,
  onToggleMa,
  onTogglePane,
  onSetRsiPeriod,
  onToggleBollinger,
}) {
  const rsiOn = Boolean(settings.panes.rsi)

  return (
    <>
      <RailMenu label="EMA" badge={maCount(settings)} title="Moving averages" wide>
        <p className="cmp-group">Exponential</p>
        <div className="cmp-grid">
          {EMA_PERIODS.map(({ period, color }) => (
            <Row
              key={period}
              on={settings.ema.includes(period)}
              swatch={color}
              onClick={() => onToggleMa('ema', period)}
            >
              {period}
            </Row>
          ))}
        </div>

        <p className="cmp-group">Simple</p>
        <div className="cmp-grid">
          {SMA_PERIODS.map(({ period, color }) => (
            <Row
              key={period}
              on={settings.sma.includes(period)}
              swatch={color}
              onClick={() => onToggleMa('sma', period)}
            >
              {period}
            </Row>
          ))}
        </div>

        <p className="cmp-group">Envelope</p>
        <Row on={settings.bollinger} swatch="#7c8b99" onClick={onToggleBollinger}>
          Bollinger 20 / 2
        </Row>
      </RailMenu>

      <RailMenu label="RSI" badge={rsiOn ? 1 : 0} title="Relative strength index">
        <p className="cmp-group">Period</p>
        {RSI_PERIODS.map((period) => (
          <Row
            key={period}
            on={rsiOn && settings.rsiPeriod === period}
            onClick={() => onSetRsiPeriod(period)}
          >
            RSI {period}
          </Row>
        ))}

        {rsiOn && (
          <div className="cmp-foot">
            <button type="button" className="cmp-reset" onClick={() => onTogglePane('rsi')}>
              Turn RSI off
            </button>
            <span className="cmp-note">Bands at 70 and 30</span>
          </div>
        )}
      </RailMenu>
    </>
  )
}
