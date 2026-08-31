import {
  CandlestickChart,
  LineChart,
  AreaChart,
  BarChart3,
  SlidersHorizontal,
  RotateCcw,
  Check,
  ChevronDown,
} from 'lucide-react'
import { CHART_TYPES, PANES, studyCount } from '../config/chartTools'
import { useDismissable } from '../hooks/useDismissable'
import FloatingMenu from './FloatingMenu'

const TYPE_ICONS = {
  candles: CandlestickChart,
  bars: BarChart3,
  line: LineChart,
  area: AreaChart,
}

/**
 * One dropdown in the chart bar.
 *
 * Portalled, like the board's menus: the chart panel clips its own overflow
 * and sets a backdrop filter, which makes it a clipper, a stacking context and
 * a containing block all at once - a menu left inside it is cut off and
 * painted under the canvas.
 */
function ToolMenu({ label, badge, title, children, wide = false }) {
  const { open, toggle, close, wrapRef, buttonRef, floatRef } = useDismissable()

  return (
    <div className="chart-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`chart-menu-btn ${badge ? 'active' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
      >
        <span className="chart-menu-label">{label}</span>
        {badge > 0 && <span className="chart-menu-count font-mono">{badge}</span>}
        <ChevronDown size={11} className="chart-menu-caret" />
      </button>

      {open && (
        <FloatingMenu
          anchorRef={buttonRef}
          floatRef={floatRef}
          align="right"
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

/** A checkable row, shared by every menu here. */
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
 * Chart type, scale, and the studies that have nothing to configure.
 *
 * Moving averages and RSI used to sit here too and have moved to the drawing
 * rail: this bar had collected the type, the scale, three menus and five
 * intervals, while the rail below the drawing tools was empty. What is left
 * here is what belongs to the chart as a whole rather than to a study.
 */
export default function ChartToolbar({
  settings,
  onTypeChange,
  onToggleLog,
  onTogglePane,
  onReset,
}) {
  return (
    <div className="chart-tools">
      <div className="chart-type-group" role="group" aria-label="Chart type">
        {CHART_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t.id]
          return (
            <button
              key={t.id}
              type="button"
              className={`chart-type-btn ${settings.type === t.id ? 'active' : ''}`}
              onClick={() => onTypeChange(t.id)}
              title={t.label}
              aria-label={t.label}
              aria-pressed={settings.type === t.id}
            >
              <Icon size={13} />
            </button>
          )
        })}
      </div>

      <span className="bar-sep" aria-hidden="true" />

      <button
        type="button"
        className={`chart-log-btn font-mono ${settings.logScale ? 'active' : ''}`}
        onClick={onToggleLog}
        aria-pressed={settings.logScale}
        title={
          settings.logScale
            ? 'Logarithmic scale — switch to linear'
            : 'Linear scale — switch to logarithmic'
        }
      >
        LOG
      </button>

      <span className="bar-sep" aria-hidden="true" />

      <ToolMenu
        label={<SlidersHorizontal size={13} />}
        badge={studyCount(settings)}
        title="Other studies"
      >
        <p className="cmp-group">Panes</p>
        {PANES.filter((p) => p.id !== 'rsi').map((p) => (
          <Row key={p.id} on={Boolean(settings.panes[p.id])} onClick={() => onTogglePane(p.id)}>
            {p.label}
          </Row>
        ))}

        <div className="cmp-foot">
          <button type="button" className="cmp-reset" onClick={onReset}>
            <RotateCcw size={11} />
            <span>Reset chart</span>
          </button>
          <span className="cmp-note">Remembered for next time</span>
        </div>
      </ToolMenu>
    </div>
  )
}
