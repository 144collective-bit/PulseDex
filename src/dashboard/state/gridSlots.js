/**
 * Finding the empty space on a dashboard.
 *
 * Once the grid stops compacting, removing a module leaves a real hole rather
 * than closing the gap behind it. That hole is the thing a user then wants to
 * fill, so it has to be found and turned into a target - otherwise "empty
 * space" just means "a gap you cannot do anything with".
 *
 * Pure and free of React on purpose: this is the one piece of the placement
 * feature with a right and a wrong answer, and keeping it a function of
 * (modules, cols) makes it something that can be reasoned about and tested
 * without a browser.
 */

/**
 * How far below the lowest module to keep offering space.
 *
 * Without this, a dashboard whose modules exactly fill their rows would offer
 * nowhere at all to put the next one - the canvas would look finished and be
 * unusable. Four rows is about one short module's worth.
 */
const TRAILING_ROWS = 4

/**
 * Rectangles smaller than this are not offered.
 *
 * A one-by-one gap between two modules is not somewhere anything can usefully
 * go - the narrowest module in the registry is two columns - and peppering the
 * canvas with unusable single cells makes the real gaps harder to see.
 */
const MIN_SLOT = { w: 2, h: 2 }

/** The first row below every module. */
export function contentRows(modules) {
  return modules.reduce((max, m) => Math.max(max, (m.layout?.y ?? 0) + (m.layout?.h ?? 0)), 0)
}

/**
 * Break the unoccupied area into a small set of rectangles.
 *
 * Greedy rather than optimal: scan top-left to bottom-right, and on the first
 * free cell take the widest run available, then extend it down for as long as
 * that full width stays free. This is not the minimum number of rectangles, but
 * it is stable, it never overlaps, and it produces the large obvious blocks a
 * person would point at - which matters more here than optimality, because the
 * output is a set of click targets rather than a packing.
 *
 * @param {{layout:{x:number,y:number,w:number,h:number}}[]} modules
 * @param {number} cols
 * @param {{minW?:number, minH?:number, trailingRows?:number}} [options]
 * @returns {{x:number,y:number,w:number,h:number}[]}
 */
export function findEmptySlots(modules = [], cols = 12, options = {}) {
  const minW = options.minW ?? MIN_SLOT.w
  const minH = options.minH ?? MIN_SLOT.h
  const trailing = options.trailingRows ?? TRAILING_ROWS

  const rows = contentRows(modules) + trailing
  if (rows <= 0 || cols <= 0) return []

  // occupied[y][x]. Cells outside the grid are simply never visited.
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false))

  for (const m of modules) {
    const { x = 0, y = 0, w = 0, h = 0 } = m.layout ?? {}
    for (let row = y; row < Math.min(y + h, rows); row += 1) {
      for (let col = x; col < Math.min(x + w, cols); col += 1) {
        if (row >= 0 && col >= 0) occupied[row][col] = true
      }
    }
  }

  const claimed = Array.from({ length: rows }, () => new Array(cols).fill(false))
  const free = (row, col) => !occupied[row][col] && !claimed[row][col]

  const slots = []

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!free(y, x)) continue

      // Widest run starting here.
      let w = 0
      while (x + w < cols && free(y, x + w)) w += 1

      // Then as far down as that whole width stays free.
      let h = 1
      while (y + h < rows) {
        let rowIsFree = true
        for (let col = x; col < x + w; col += 1) {
          if (!free(y + h, col)) {
            rowIsFree = false
            break
          }
        }
        if (!rowIsFree) break
        h += 1
      }

      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) claimed[row][col] = true
      }

      if (w >= minW && h >= minH) slots.push({ x, y, w, h })
    }
  }

  return slots
}

/**
 * Squeeze out dead bands for the reading view.
 *
 * Gaps are deliberate - they are where the next module goes - but there is a
 * difference between a hole in a row and a stretch of canvas with nothing in it
 * at all. Delete a chart and the panel beside it and the dashboard is left with
 * eight rows of nothing, roughly half a screen, which in the reading view has
 * no affordance on it and simply looks broken.
 *
 * So rows that no module occupies at all are collapsed down to a single row of
 * breathing space. A gap *within* a row is untouched, because that reads as
 * intentional and is exactly the case someone is about to fill.
 *
 * This is a view transform and nothing more: the stored layout keeps its true
 * coordinates, customise mode shows them, and nothing here is ever persisted.
 *
 * @param {{i:string,x:number,y:number,w:number,h:number}[]} layout
 * @param {number} keep How many empty rows a run is allowed to keep.
 */
export function collapseEmptyRows(layout, keep = 1) {
  if (!layout?.length) return layout

  const lastRow = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)

  const occupied = new Array(lastRow).fill(false)
  for (const l of layout) {
    for (let row = Math.max(0, l.y); row < Math.min(l.y + l.h, lastRow); row += 1) {
      occupied[row] = true
    }
  }

  /*
   * Walk down once, building a map from real row to displayed row. An empty
   * row still advances the output until the run exceeds `keep`, after which it
   * costs nothing - so a one-row gap survives and a ten-row void does not.
   */
  const shifted = new Array(lastRow + 1)
  let out = 0
  let run = 0

  for (let row = 0; row < lastRow; row += 1) {
    shifted[row] = out
    if (occupied[row]) {
      run = 0
      out += 1
    } else {
      run += 1
      if (run <= keep) out += 1
    }
  }
  shifted[lastRow] = out

  // Untouched if there was nothing to collapse, so the common case does not
  // hand the grid a new array on every render.
  if (out === lastRow) return layout

  return layout.map((l) => (shifted[l.y] === l.y ? l : { ...l, y: shifted[l.y] }))
}

/**
 * Pixel geometry for one grid rectangle.
 *
 * The empty slots are drawn as an overlay rather than as grid children, so they
 * have to be positioned with the same arithmetic the engine uses internally -
 * n columns wide means n column widths plus the (n-1) margins between them.
 * Getting this subtly wrong shows up as placeholders that drift further out of
 * alignment the further right they sit.
 *
 * @param {{x:number,y:number,w:number,h:number}} slot
 * @param {{containerWidth:number, cols:number, rowHeight:number, margin:[number,number]}} grid
 */
export function slotToPixels(slot, { containerWidth, cols, rowHeight, margin }) {
  const [marginX, marginY] = margin
  const colWidth = (containerWidth - marginX * (cols - 1)) / cols

  return {
    left: slot.x * (colWidth + marginX),
    top: slot.y * (rowHeight + marginY),
    width: slot.w * colWidth + (slot.w - 1) * marginX,
    height: slot.h * rowHeight + (slot.h - 1) * marginY,
  }
}

/**
 * Fit a module's preferred size into a slot the user picked.
 *
 * A slot is an offer of space, not a demand: a two-column gap should still
 * accept an eight-column chart, which then pushes its neighbours aside the way
 * any other oversized drop does. So the width is only trimmed down to the slot
 * when the module can live at that size, and never below its own minimum.
 *
 * @param {import('../types/dashboard.js').DashboardModuleDefinition} definition
 * @param {{x:number,y:number,w:number,h:number}} slot
 * @param {number} cols
 */
export function fitToSlot(definition, slot, cols = 12) {
  const minW = definition.minSize?.w ?? 2
  const minH = definition.minSize?.h ?? 2

  const w = Math.min(Math.max(Math.min(definition.defaultSize.w, slot.w), minW), cols)
  const h = Math.max(Math.min(definition.defaultSize.h, slot.h), minH)

  return {
    // Keep the module on the grid even when it is wider than the gap it was
    // dropped into.
    x: Math.min(slot.x, Math.max(cols - w, 0)),
    y: slot.y,
    w,
    h,
  }
}

/**
 * Where a pixel offset sits on the grid.
 *
 * The inverse of `slotToPixels`, and it exists because a drop has to be
 * resolved from where the module physically is rather than from what the grid
 * engine believes. The engine is fed a layout that deliberately does not change
 * while a drag is in flight - so that nothing half-dragged is ever written down
 * - which means the cell it reports on release is the cell the module started
 * in. The pixels are the honest account.
 *
 * Two ways to land on a cell, and the choice depends on what the pixels are.
 * A module's top-left corner rounds: dragged a little past halfway into the
 * next column it belongs to that column, which is what the eye reports too. A
 * pointer floors, because there the question is not "which cell is it nearest"
 * but "which cell is it in", and rounding would put a cursor an inch inside one
 * frame into its neighbour.
 *
 * @param {{left:number, top:number}} px Offset from the grid's top-left.
 * @param {{containerWidth:number, cols:number, rowHeight:number, margin:[number,number]}} geometry
 * @param {'round'|'floor'} [snap]
 */
export function pixelsToCell(px, { containerWidth, cols, rowHeight, margin }, snap = 'round') {
  const [marginX, marginY] = margin
  const colWidth = (containerWidth - marginX * (cols - 1)) / cols
  const to = snap === 'floor' ? Math.floor : Math.round

  const x = to(px.left / (colWidth + marginX))
  const y = to(px.top / (rowHeight + marginY))

  return {
    // A drag can be released past either edge; the board has no cells there.
    x: Math.max(0, Math.min(x, cols - 1)),
    y: Math.max(0, y),
  }
}

/**
 * The size a module should be when it is put into a frame.
 *
 * A frame is taken whole. That is what keeps the rack's shape stable: a module
 * dropped into a bay leaves no sliver of it behind, so the board a user
 * arranged is the board they keep. It is the same rule a move follows, and it
 * has to be, or adding and moving would disagree about what a holder is for.
 *
 * The module's own limits still win. Below its minimum it would be unusable,
 * and above its maximum the grid engine - which is handed the same numbers -
 * would clamp it back and leave the stored layout describing a size the board
 * is not drawing. Either clamp leaves a remainder, which simply becomes the
 * next bay.
 *
 * @param {import('../types/dashboard.js').DashboardModuleDefinition} definition
 * @param {{x:number,y:number,w:number,h:number}} frame
 */
export function fitToFrame(definition, frame) {
  const min = definition?.minSize ?? { w: 2, h: 2 }
  const max = definition?.maxSize

  const clamp = (span, low, high) =>
    Math.max(low ?? 1, high == null ? span : Math.min(span, high))

  return {
    x: frame.x,
    y: frame.y,
    w: clamp(frame.w, min.w, max?.w),
    h: clamp(frame.h, min.h, max?.h),
  }
}

/** Whether a module can go in this frame at all - its minimum has to sit inside it. */
export function canFitFrame(definition, frame) {
  const min = definition?.minSize ?? { w: 2, h: 2 }
  return frame.w >= (min.w ?? 1) && frame.h >= (min.h ?? 1)
}
