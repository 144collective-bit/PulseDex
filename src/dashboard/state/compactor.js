import { bottom, cloneLayoutItem, getFirstCollision, sortLayoutItemsByRowCol } from 'react-grid-layout'

/**
 * A compactor with no gravity, but no overlaps either.
 *
 * The engine ships three: vertical and horizontal both close gaps, which is
 * exactly what a placeable dashboard must not do - remove a module from the
 * middle of the board and everything below slides up to swallow the hole.
 * `noCompactor` keeps the hole, but it is a pure passthrough: it returns the
 * layout untouched, so an item displaced by a drag is simply left sitting on
 * top of its neighbour. Both stored positions then say the same cell, and the
 * two modules render over each other.
 *
 * This is the missing third behaviour. Items are never pulled toward the top,
 * so gaps survive exactly as the user left them; but an item that lands on an
 * occupied cell is pushed straight down until it is clear, so the layout is
 * always physically possible.
 *
 * Processing in row-then-column order is what makes that stable: an item is
 * only ever tested against items that were already placed above or to the left
 * of it, so a single pass settles the whole board and the result does not
 * depend on the order the modules happen to sit in the array.
 */
export const noGravityCompactor = {
  type: null,
  allowOverlap: false,

  compact(layout, cols) {
    const sorted = sortLayoutItemsByRowCol(layout)
    const index = new Map(layout.map((item, i) => [item.i, i]))
    const out = new Array(layout.length)

    /*
     * Statics are obstacles from the start rather than participants.
     *
     * A locked module - and every module outside customise mode - must not be
     * moved by someone else's drag, so they are all in the collision set before
     * the first movable item is placed.
     */
    const placed = layout.filter((item) => item.static).map(cloneLayoutItem)
    const maxRows = bottom(layout) + layout.length

    for (const item of sorted) {
      if (!item) continue

      const l = cloneLayoutItem(item)

      if (!l.static) {
        // Keep it on the board before resolving collisions, or an item dragged
        // past the right edge would be pushed down forever instead of back in.
        l.x = Math.max(0, Math.min(l.x, cols - l.w))
        l.y = Math.max(0, l.y)

        // `maxRows` is a stop, not a limit anyone should reach: it only exists
        // so a malformed layout cannot spin here.
        while (getFirstCollision(placed, l) && l.y < maxRows) l.y += 1
      }

      placed.push(l)
      out[index.get(item.i)] = l
    }

    // An item the sort dropped (a duplicate id, say) would leave a hole in the
    // output array, and the engine would then render undefined.
    for (let i = 0; i < out.length; i += 1) {
      if (!out[i]) out[i] = cloneLayoutItem(layout[i])
    }

    return out
  },
}

export default noGravityCompactor

/**
 * Make a stored set of module instances physically valid.
 *
 * Saved layouts are not guaranteed sane. They survive across deploys, they are
 * editable in devtools, and any bug in a past version is preserved in them
 * forever - overlapping modules render on top of each other and there is no
 * obvious way for a user to discover why, or to fix it.
 *
 * So the same rules the live grid enforces are applied once on load. Nothing
 * moves upward, so a layout that is already valid comes back untouched and a
 * user's gaps are left alone; only genuine overlaps are pushed apart.
 *
 * @param {import('../types/dashboard.js').DashboardModuleInstance[]} modules
 * @param {number} cols
 */
export function repairModuleLayouts(modules, cols = 12) {
  if (!Array.isArray(modules) || modules.length === 0) return modules

  const items = modules.map((m, i) => ({
    // The grid keys on `i`; a module with a missing id would collide with the
    // next one and quietly vanish from the result.
    i: m.id ?? `module-${i}`,
    x: Number(m.layout?.x ?? 0),
    y: Number(m.layout?.y ?? 0),
    w: Number(m.layout?.w ?? 2),
    h: Number(m.layout?.h ?? 2),
  }))

  const fixed = noGravityCompactor.compact(items, cols)

  return modules.map((m, i) => {
    const next = fixed[i]
    if (!next) return m
    const same =
      m.layout?.x === next.x &&
      m.layout?.y === next.y &&
      m.layout?.w === next.w &&
      m.layout?.h === next.h
    return same ? m : { ...m, layout: { x: next.x, y: next.y, w: next.w, h: next.h } }
  })
}
