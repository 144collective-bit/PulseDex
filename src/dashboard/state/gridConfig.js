/**
 * Grid geometry.
 *
 * Everything from tablet up keeps twelve columns and simply gets narrower
 * cells, which means a layout edited on a laptop is the same layout on a
 * desktop - no per-breakpoint copies to keep in step, and no chance of a
 * narrow-screen drag quietly rewriting the wide-screen arrangement.
 *
 * Below 768 the grid drops to a single column and stacks. That is a genuine
 * change of shape rather than a shrink: a four-column chart squeezed onto a
 * phone is not a smaller chart, it is an unreadable one.
 *
 * Kept out of the component file so the grid module exports only a component,
 * which is what React Fast Refresh needs to hot-reload it.
 */

export const BREAKPOINTS = { lg: 1200, md: 768, xs: 0 }
export const COLS = { lg: 12, md: 12, xs: 1 }

/** The stacked breakpoint, where positions are derived rather than authored. */
export const STACKED_BREAKPOINT = 'xs'

export const ROW_HEIGHT = 54
export const GRID_MARGIN = [12, 12]
