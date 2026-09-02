import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Responsive, useContainerWidth } from 'react-grid-layout'
import { noGravityCompactor } from '../state/compactor'
import { getModuleDefinition } from '../registry/moduleRegistry'
import { useDashboardActions, useDashboardState } from '../state/DashboardProvider'
import {
  BREAKPOINTS,
  COLS,
  GRID_MARGIN,
  ROW_HEIGHT,
  STACKED_BREAKPOINT,
} from '../state/gridConfig'
import { findEmptySlots, pixelsToCell, slotToPixels } from '../state/gridSlots'
import { bestFrame, planFrameMove } from '../state/frameSnap'
import ModuleRenderer from './ModuleRenderer'
import EmptySlots from './EmptySlots'

/**
 * The canvas.
 *
 * Sizes and constraints come from each module's registry entry rather than
 * from anything written here, so the grid never learns what a "chart" is - it
 * only knows that item 4 refuses to be narrower than three columns.
 *
 * Nothing compacts. The stored layout is exactly what is drawn, so a module
 * removed from the middle of the board leaves the hole it was occupying instead
 * of everything below sliding up to swallow it. That is what makes the space
 * placeable - and it also means the arrangement someone builds is the
 * arrangement they get back, rather than one the engine has tidied on their
 * behalf.
 */

/** The id the engine gives the item under the cursor during an external drag. */
const DROPPING_ID = '__dropping-elem__'

export default function DashboardGrid({ onConfigure, draggingEntry }) {
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

  /*
   * Both views draw the true grid.
   *
   * Empty bands used to be squeezed out for reading, because a stretch of blank
   * canvas with no affordance on it looks like a failure to render. That is no
   * longer what an empty band is: it is drawn as a bay with an add button, so
   * the reason to hide it has gone.
   *
   * Keeping the collapse would now be actively wrong. The bays are measured
   * from what is displayed, so under a collapsed layout a bay would report the
   * row it appears on rather than the row it occupies, and a module added from
   * it would be stored somewhere other than where it was put.
   */
  const displayed = layout

  const layouts = useMemo(() => ({ lg: displayed, md: displayed }), [displayed])

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
  const stackedHeight = useCallback((h) => {
    const rows = Math.max(Math.ceil(h * 1.5), 4)
    return rows * ROW_HEIGHT + (rows - 1) * GRID_MARGIN[1]
  }, [])

  /**
   * How tall a module should be in the stacked view.
   *
   * Content-sized by default, which is the whole correction here. Carrying the
   * desktop row count over meant every module got a box scaled for a
   * twelve-column layout and then sat in it: a liquidity panel with four
   * figures in it was handed 546 pixels and used 72 of them. Down a single
   * column there is no grid to keep aligned to and no reason to reserve space
   * nothing is going to fill.
   *
   * Modules that draw rather than flow still need a real number, and say so in
   * the registry.
   */
  const stackedStyle = useCallback(
    (instance) => {
      const def = getModuleDefinition(instance.type)
      if (def?.fillsHeight) return { height: stackedHeight(instance.layout.h) }
      // A floor rather than a height: enough that a one-line module still reads
      // as a panel, with nothing stopping a longer one from growing.
      return { minHeight: 120 }
    },
    [stackedHeight],
  )

  /**
   * Persist a layout change - but never from the stacked breakpoint.
   *
   * At one column the engine reports every item as x:0, w:1. Writing that back
   * would flatten the desktop arrangement into a single stripe the first time
   * someone opened the dashboard on a phone. Reordering on small screens goes
   * through the module menu instead, which swaps real slots.
   */
  /*
   * Latest committed layout and bay list, for the drop handler.
   *
   * `handleDragStop` needs both, and both are computed further down this
   * component - a dependency array naming them directly would be evaluated
   * before they exist. Refs also make the drop read the layout as it was
   * before the drag, which is exactly what a frame move has to be resolved
   * against.
   */
  const draggingIdRef = useRef(null)
  const committedRef = useRef([])
  const baysRef = useRef([])

  /** The frame a drop would land in, or null when it would be refused. */
  const [dropFrame, setDropFrame] = useState(null)

  /*
   * The engine is told nothing about layout, on purpose.
   *
   * It used to write back whatever it reported, which was right when it was the
   * thing deciding where modules went. It no longer is: a move is a frame swap
   * resolved here, resizing is off, and a module dragged in from the library
   * arrives through `onDrop`. Nothing is left that the engine knows about the
   * layout which this component did not tell it first.
   *
   * Listening anyway was actively harmful. `onLayoutChange` fires whenever the
   * layout prop changes - including after an undo - carrying the engine's own
   * internal idea of the board, which at that moment is still the arrangement
   * being undone. Committing that re-applied the move a user had just taken
   * back, so undo appeared to do nothing for anything positional. It survived
   * for adds and removes only because a layout echo cannot conjure a module
   * back into existence.
   *
   * So the engine draws the board and reports nothing, and every write has one
   * origin.
   */

  /**
   * A move is a change of frame, not a change of position.
   *
   * The engine is left to do the dragging, because the feel of it - the lift,
   * the shadow, the preview - is worth keeping. Only the commit differs: where
   * it would write down wherever the module was let go, the drop is resolved
   * against the frames the board already has, and the module takes one of them
   * whole. So the holder grid keeps its shape no matter how much is shuffled
   * through it, and a module arrives sized to its new home.
   *
   * Dropping on nothing, or on a frame too small to hold it, is declined - the
   * module returns to its own frame, which is the honest answer when the
   * alternative is silently reshaping the rack.
   */
  /*
   * Which cell the pointer is over.
   *
   * The cursor decides the drop, not the body of the module. A wide module laid
   * over a rack of narrow frames overlaps three or four of them at once, so
   * "the frame it covers most" is a lottery between neighbours - while the
   * frame someone is pointing at is never in doubt. It is also what makes the
   * preview legible: the lit frame follows the cursor rather than lagging
   * behind the bulk of what is being carried.
   *
   * Read from the event rather than from what the engine reports, because the
   * layout it is given deliberately does not change while a drag is in flight -
   * the cell it hands back on release is the cell the drag began in.
   */
  const cellUnderPointer = useCallback(
    (event) => {
      const wrap = containerRef.current
      const x = event?.clientX
      const y = event?.clientY
      if (!wrap || typeof x !== 'number' || typeof y !== 'number') return null

      const box = wrap.getBoundingClientRect()
      const cell = pixelsToCell(
        { left: x - box.left, top: y - box.top },
        { containerWidth: width, cols: COLS.lg, rowHeight: ROW_HEIGHT, margin: GRID_MARGIN },
        'floor',
      )

      // A single cell: "the frame under this point", asked as a rectangle.
      return { ...cell, w: 1, h: 1 }
    },
    [containerRef, width],
  )

  /** Every rectangle the board has, minus the one being carried. */
  const framesExcept = useCallback(
    (movedId) => [
      ...committedRef.current.filter((l) => l.i !== movedId).map(({ x, y, w, h }) => ({ x, y, w, h })),
      ...baysRef.current,
    ],
    [],
  )

  const handleDragStart = useCallback((_layout, item) => {
    draggingIdRef.current = item?.i ?? null
  }, [])

  /*
   * What a drop at this cell would do - asked by the preview and by the commit,
   * so the lit frame can never promise something the drop then refuses.
   */
  const planAt = useCallback(
    (movedId, at) =>
      planFrameMove({
        movedId,
        movedTo: at,
        layout: committedRef.current,
        bays: baysRef.current,
        limitsOf: (id) => {
          const instance = modules.find((m) => m.id === id)
          const def = getModuleDefinition(instance?.type)
          return { min: def?.minSize ?? { w: 2, h: 2 }, max: def?.maxSize }
        },
      }),
    [modules],
  )

  /*
   * The frame the drop would land in, shown while the drag is still in the air.
   *
   * The engine's own placeholder cannot say this: it draws where a free layout
   * would put the module, and this board does not do free layouts. So it is
   * turned off in CSS and the destination frame is lit instead - which is the
   * question a user actually has mid-drag, and the answer is a rectangle that
   * already exists.
   */
  const handleDrag = useCallback(
    (_layout, _oldItem, _newItem, _placeholder, event) => {
      const movedId = draggingIdRef.current
      if (!movedId) return

      const at = cellUnderPointer(event)
      if (!at) return

      const frame = bestFrame(at, framesExcept(movedId))
      // A frame the module cannot fit is still worth lighting - saying nothing
      // reads as the drag having broken. It is lit as a refusal instead.
      const ok = Boolean(frame) && planAt(movedId, at) !== null

      /*
       * A swap moves two modules, so it is shown as two frames. Lighting only
       * the destination told half the story: the module already sitting there
       * does not vanish, it comes back to the frame being vacated, and a user
       * who cannot see that has to drop it to find out.
       */
      const home = committedRef.current.find((l) => l.i === movedId)
      const occupied =
        ok &&
        frame &&
        committedRef.current.some(
          (l) => l.i !== movedId && l.x === frame.x && l.y === frame.y && l.w === frame.w && l.h === frame.h,
        )
      const partner = occupied && home ? { x: home.x, y: home.y, w: home.w, h: home.h } : null

      setDropFrame((prev) => {
        if (!frame) return null
        const next = { ...frame, ok, partner }
        if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev
        return next
      })
    },
    [cellUnderPointer, framesExcept, planAt],
  )

  const handleDragStop = useCallback(
    (_layout, _oldItem, _newItem, _placeholder, event) => {
      const movedId = draggingIdRef.current
      draggingIdRef.current = null
      setDropFrame(null)
      if (!movedId) return

      const at = cellUnderPointer(event)

      const planned = at ? planAt(movedId, at) : null

      /*
       * Re-apply the committed layout even when the move is refused. The engine
       * has already painted the module at the free position it was released
       * over, and without a write it would sit there until something else
       * caused a render.
       */
      actions.applyLayout(planned ?? committedRef.current.map((l) => ({ ...l })))
    },
    [actions, cellUnderPointer, planAt],
  )

  /**
   * Where a module dragged in from the library actually lands.
   *
   * The engine has already worked out the grid cell under the cursor, so the
   * drop is placed exactly where it was let go - including on top of an
   * existing module, which then gets pushed aside like any other collision.
   */
  const handleDrop = useCallback(
    (_layout, item) => {
      if (!draggingEntry || !item) return
      // A preset brings its configuration with it; a plain module has none and
      // is configured after it lands.
      actions.addModule(draggingEntry.definition, {
        config: draggingEntry.config,
        contextMode: draggingEntry.contextMode,
        layout: {
          x: item.x,
          y: item.y,
          w: draggingEntry.size.w,
          h: draggingEntry.size.h,
        },
      })
    },
    [draggingEntry, actions],
  )

  /**
   * The free rectangles, and the geometry to draw them with.
   *
   * Shown in both views. They used to be customise-only, on the reasoning that
   * a finished dashboard should not look unfinished - but that held while a gap
   * was drawn as a dashed outline. Drawn as a designed, empty bay it reads as
   * part of the unit rather than as something missing, and the board is only
   * honest about being modular if the places a module can go are visible
   * without first entering an editing mode.
   *
   * Measured from the same layout that is rendered, never from the stored
   * modules separately. A bay reports its own coordinates when a module is
   * added from it, so the moment the two could disagree is the moment a module
   * lands somewhere other than where it was put.
   */
  const slots = useMemo(
    () => (stacked ? [] : findEmptySlots(displayed.map((l) => ({ layout: l })), COLS.lg)),
    [stacked, displayed],
  )

  /*
   * Kept current in an effect rather than written during render, which React
   * rightly objects to. Safe to be a render behind in principle and never is in
   * practice: a drag changes nothing in the store until it is dropped, so no
   * render happens between picking a module up and putting it down.
   */
  useEffect(() => {
    committedRef.current = layout
    baysRef.current = slots
  }, [layout, slots])

  const slotGeometry = useMemo(
    () => ({ containerWidth: width, cols: COLS.lg, rowHeight: ROW_HEIGHT, margin: GRID_MARGIN }),
    [width],
  )

  /*
   * Both memoised because the engine holds them in effect dependencies. Fresh
   * object literals on every render would tear down and rebuild the drop
   * placeholder mid-drag, which shows up as a preview that flickers or refuses
   * to follow the cursor.
   */
  const dropSize = useMemo(
    () => ({
      w: draggingEntry?.size?.w ?? 4,
      h: draggingEntry?.size?.h ?? 4,
    }),
    [draggingEntry],
  )

  const dropConfig = useMemo(
    () => ({ enabled: customizing && !stacked, defaultItem: dropSize }),
    [customizing, stacked, dropSize],
  )

  // Sized to whatever is being dragged, so the preview under the cursor is the
  // shape of the thing that will land there.
  const droppingItem = useMemo(
    () => ({ i: DROPPING_ID, x: 0, y: 0, ...dropSize }),
    [dropSize],
  )

  if (!dashboard) return null

  if (stacked) {
    return (
      <div className="dash-grid-wrap" ref={containerRef}>
        <div className="dash-stack">
          {modules.map((instance) => (
            <div key={instance.id} className="dash-stack-item" style={stackedStyle(instance)}>
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
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragStop={handleDragStop}
          // Gaps are the point, but overlaps are not. See compactor.js.
          compactor={noGravityCompactor}
          onDrop={handleDrop}
          dropConfig={dropConfig}
          droppingItem={droppingItem}
          dragConfig={{
            // The whole header is the grip, so there is a large, obvious
            // target - but not the buttons inside it, or opening the menu
            // would start a drag instead.
            enabled: customizing && !stacked,
            handle: '.dash-module-header',
            cancel: '.dash-module-actions',
          }}
          /*
           * Off. A module is sized by the frame it sits in, so a handle that
           * changed one module's size would change the shape of the rack - the
           * one thing moving things around is supposed to leave alone. Modules
           * resize when they move, by taking the frame they land in whole.
           */
          resizeConfig={{ enabled: false }}
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

      {mounted && dropFrame?.partner ? (
        <div
          className="dash-drop-frame is-partner"
          aria-hidden="true"
          style={(() => {
            const box = slotToPixels(dropFrame.partner, slotGeometry)
            return {
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }
          })()}
        />
      ) : null}

      {mounted && dropFrame ? (
        <div
          className={`dash-drop-frame ${dropFrame.ok ? '' : 'is-refused'}`}
          aria-hidden="true"
          style={(() => {
            const box = slotToPixels(dropFrame, slotGeometry)
            return {
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }
          })()}
        />
      ) : null}

      {mounted ? (
        <EmptySlots
          slots={slots}
          geometry={slotGeometry}
          dragging={Boolean(draggingEntry)}
        />
      ) : null}
    </div>
  )
}
