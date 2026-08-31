import { useEffect } from 'react'
import {
  MousePointer2,
  TrendingUp,
  MoveUpRight,
  Minus,
  Columns3,
  Trash2,
  Eraser,
  Palette,
  Magnet,
  Check,
} from 'lucide-react'
import { TOOLS, DRAWING_COLORS, LINE_WIDTHS, LINE_STYLES } from '../utils/chartDrawings'
import { useDismissable } from '../hooks/useDismissable'
import FloatingMenu from './FloatingMenu'

const TOOL_ICONS = {
  trend: TrendingUp,
  ray: MoveUpRight,
  hline: Minus,
  channel: Columns3,
}

/** A short line drawn in the given style, so the menu shows rather than tells. */
function StylePreview({ color, width, lineStyle }) {
  const dash = LINE_STYLES.find((l) => l.id === lineStyle)?.dash
  return (
    <svg viewBox="0 0 34 8" className="cdr-preview" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="33"
        y2="4"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash ? dash.join(' ') : undefined}
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The drawing rail beside the chart.
 *
 * Vertical and on the left, where every charting package puts it - the muscle
 * memory is worth more than the novelty of moving it.
 *
 * Colour used to sit here as six permanent swatches. It has moved into a style
 * menu with the width and the dash pattern, because a rail is for choosing
 * what to do and a menu is for how it should look - and because that menu can
 * now edit the selected drawing as well as set the pen, which a row of
 * swatches could not.
 */
export default function ChartDrawingTools({
  tool,
  onToolChange,
  style,
  onStyleChange,
  magnet,
  onToggleMagnet,
  selectedId,
  onDeleteSelected,
  onClearAll,
  hasDrawings,
  children,
}) {
  const styleMenu = useDismissable()

  /*
   * Single-key shortcuts, the way every charting package has them.
   *
   * Ignored while typing, so the search box and the swap inputs keep their
   * letters, and ignored with a modifier held, so browser shortcuts still work.
   */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return

      const key = event.key.toLowerCase()
      const match = TOOLS.find((t) => t.key === key)

      if (match) {
        event.preventDefault()
        onToolChange(tool === match.id ? null : match.id)
      } else if (key === 'v') {
        event.preventDefault()
        onToolChange(null)
      } else if (key === 'm') {
        event.preventDefault()
        onToggleMagnet()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [tool, onToolChange, onToggleMagnet])

  return (
    <div
      className="chart-draw-rail"
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
    >
      <button
        type="button"
        className={`cdr-btn ${tool === null ? 'active' : ''}`}
        onClick={() => onToolChange(null)}
        title="Select and move · V"
        aria-label="Select"
        aria-pressed={tool === null}
      >
        <MousePointer2 size={14} />
      </button>

      <span className="cdr-sep" aria-hidden="true" />

      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.id]
        return (
          <button
            key={t.id}
            type="button"
            className={`cdr-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => onToolChange(tool === t.id ? null : t.id)}
            title={`${t.label} · ${t.key.toUpperCase()} — ${t.hint}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
          >
            <Icon size={14} />
          </button>
        )
      })}

      <span className="cdr-sep" aria-hidden="true" />

      <button
        type="button"
        className={`cdr-btn ${magnet ? 'active' : ''}`}
        onClick={onToggleMagnet}
        title={
          magnet
            ? 'Magnet on · M — anchors snap to the nearest open, high, low or close'
            : 'Magnet off · M — anchors land anywhere'
        }
        aria-label="Magnet"
        aria-pressed={magnet}
      >
        <Magnet size={14} />
      </button>

      <div className="cdr-style" ref={styleMenu.wrapRef}>
        <button
          ref={styleMenu.buttonRef}
          type="button"
          className={`cdr-btn ${styleMenu.open ? 'active' : ''}`}
          onClick={styleMenu.toggle}
          title={selectedId ? 'Style the selected drawing' : 'Style for new drawings'}
          aria-label="Line style"
          aria-haspopup="dialog"
          aria-expanded={styleMenu.open}
        >
          <Palette size={14} />
          <span className="cdr-style-dot" style={{ background: style.color }} aria-hidden="true" />
        </button>

        {styleMenu.open && (
          <FloatingMenu
            anchorRef={styleMenu.buttonRef}
            floatRef={styleMenu.floatRef}
            align="left"
            onDismiss={styleMenu.close}
            className="cdr-style-menu"
            role="dialog"
            aria-label="Line style"
          >
            <p className="cdr-menu-head">
              {selectedId ? 'Selected drawing' : 'New drawings'}
              <StylePreview {...style} />
            </p>

            <p className="cmp-group">Colour</p>
            <div className="cdr-swatches">
              {DRAWING_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cdr-swatch ${style.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => onStyleChange({ color: c })}
                  aria-label={`Colour ${c}`}
                  aria-pressed={style.color === c}
                />
              ))}
            </div>

            <p className="cmp-group">Weight</p>
            <div className="cdr-widths">
              {LINE_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`cdr-width ${style.width === w ? 'active' : ''}`}
                  onClick={() => onStyleChange({ width: w })}
                  aria-label={`Line weight ${w}`}
                  aria-pressed={style.width === w}
                >
                  <span style={{ height: `${w}px`, background: style.color }} />
                </button>
              ))}
            </div>

            <p className="cmp-group">Pattern</p>
            {LINE_STYLES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitemradio"
                aria-checked={style.lineStyle === l.id}
                className={`cmp-item ${style.lineStyle === l.id ? 'is-on' : ''}`}
                onClick={() => onStyleChange({ lineStyle: l.id })}
              >
                <Check size={11} className={style.lineStyle === l.id ? '' : 'is-hidden'} />
                <StylePreview color={style.color} width={style.width} lineStyle={l.id} />
                <span>{l.label}</span>
              </button>
            ))}
          </FloatingMenu>
        )}
      </div>

      <span className="cdr-sep" aria-hidden="true" />

      <button
        type="button"
        className="cdr-btn"
        onClick={onDeleteSelected}
        disabled={!selectedId}
        title="Delete selected · Del"
        aria-label="Delete selected drawing"
      >
        <Trash2 size={14} />
      </button>

      <button
        type="button"
        className="cdr-btn"
        onClick={onClearAll}
        disabled={!hasDrawings}
        title="Clear every drawing on this pair"
        aria-label="Clear all drawings"
      >
        <Eraser size={14} />
      </button>

      {/* Studies live at the foot of the rail, below the drawing set. */}
      {children && (
        <>
          <span className="cdr-sep" aria-hidden="true" />
          {children}
        </>
      )}
    </div>
  )
}
