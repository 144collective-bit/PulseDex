import { useCallback, useMemo } from 'react'
import { Responsive, useContainerWidth } from 'react-grid-layout'
import { getModuleDefinition } from '../registry/moduleRegistry'
import { useDashboardActions, useDashboardState } from '../state/DashboardProvider'
import {
  BREAKPOINTS,
  COLS,
  GRID_MARGIN,
  ROW_HEIGHT,
  STACKED_BREAKPOINT,
} from '../state/gridConfig'
import ModuleRenderer from './ModuleRenderer'

/**
 * The canvas.
 *
 * Sizes and constraints come from each module's registry entry rather than
 * from anything written here, so the grid never learns what a "chart" is - it
 * only knows that item 4 refuses to be narrower than three columns.
 */

export default function DashboardGrid({ onConfigure }) {
  const { dashboard, customizing } = useDashboardState()
  const actions = useDashboardActions()
  const { width, containerRef, mounted } = useContainerWidth()

  const modules = useMemo(
    () => (dashboard?.modules ?? []).filter((m) => !m.hidden),
    [dashboard?.modules],
  )

  const breakpoint =
    width >= BREAKPOINTS.lg ? 'lg' : width >= BREAKPOINTS.md ? 'md' : STACKED_BREAKPOINT
  const stacked = breakpoint === STACKED_BREAKPOINT

  /**
   * Grid items, with each module's own size constraints attached.
   *
   * `static` carries locking through to the engine: a locked item cannot be
   * dragged or resized, and other items compact around it rather than through
   * it. Outside customise mode everything is static, which is what makes the
   * normal view a clean dashboard rather than a page that slides under the
   * cursor.
   */
  const layout = useMemo(
    () =>
      modules.map((m) => {
        const def = getModuleDefinition(m.type)
        return {
          i: m.id,
          x: m.layout.x,
          y: m.layout.y,
          w: m.layout.w,
          h: m.layout.h,
          minW: def?.minSize?.w ?? 2,
          minH: def?.minSize?.h ?? 2,
          maxW: def?.maxSize?.w,
          maxH: def?.maxSize?.h,
          static: !customizing || Boolean(m.locked),
        }
      }),
    [modules, customizing],
  )

  const layouts = useMemo(() => ({ lg: layout, md: layout }), [layout])

  /**
   * The stacked view, as plain boxes in a column.
   *
   * The grid engine is not involved below the stacking breakpoint, and that is
   * deliberate rather than a shortcut. Handed a one-column layout it normalises
   * every item - clamping widths, recompacting the column - hands the result
   * back through `onLayoutChange`, stores it, and then finds it disagrees with
   * the layout it was given; the two never settle, and React eventually stops
   * the page with a maximum-update-depth error. There is also nothing for it to
   * do at one column: no dragging, no resizing, no placement to solve.
   *
   * Heights still come from the stored layout, at half again the desktop value.
   * A panel that was three rows tall beside two others needs more than that
   * once its content reflows into one narrow column, and the desktop height
   * would leave an inner scrollbar inside an already-scrolling page. Nothing
   * here is persisted, which is what lets a phone visit leave the desktop
   * arrangement untouched.
   */
  const stackedHeight = useCallback(
    (h) => {
      const rows = Math.max(Math.ceil(h * 1.5), 4)
      return rows * ROW_HEIGHT + (rows - 1) * GRID_MARGIN[1]
    },
    [],
  )

  /**
   * Persist a layout change - but never from the stacked breakpoint.
   *
   * At one column the engine reports every item as x:0, w:1. Writing that back
   * would flatten the desktop arrangement into a single stripe the first time
   * someone opened the dashboard on a phone. Reordering on small screens goes
   * through the module menu instead, which swaps real slots.
   */
  const handleLayoutChange = useCallback(
    (next) => {
      if (stacked || !customizing) return
      actions.applyLayout(next)
    },
    [stacked, customizing, actions],
  )

  if (!dashboard) return null

  if (stacked) {
    return (
      <div className="dash-grid-wrap" ref={containerRef}>
        <div className="dash-stack">
          {modules.map((instance) => (
            <div
              key={instance.id}
              className="dash-stack-item"
              style={{ height: stackedHeight(instance.layout.h) }}
            >
              <ModuleRenderer
                instance={instance}
                customizing={customizing}
                onConfigure={onConfigure}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="dash-grid-wrap" ref={containerRef}>
      {mounted ? (
        <Responsive
          width={width}
          breakpoint={breakpoint}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={[0, 0]}
          onLayoutChange={handleLayoutChange}
          dragConfig={{
            // The whole header is the grip, so there is a large, obvious
            // target - but not the buttons inside it, or opening the menu
            // would start a drag instead.
            enabled: customizing && !stacked,
            handle: '.dash-module-header',
            cancel: '.dash-module-actions',
          }}
          resizeConfig={{
            enabled: customizing && !stacked,
            handles: ['se', 'e', 's'],
          }}
          className={`dash-grid ${customizing ? 'is-customizing' : ''}`}
        >
          {modules.map((instance) => (
            <div key={instance.id} className="dash-grid-item">
              <ModuleRenderer
                instance={instance}
                customizing={customizing}
                onConfigure={onConfigure}
              />
            </div>
          ))}
        </Responsive>
      ) : null}
    </div>
  )
}
