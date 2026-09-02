/**
 * Module registry.
 *
 * The dashboard engine knows nothing about any individual module. It asks this
 * registry what exists, what size a thing wants to be, and which component
 * draws it. Adding a module is therefore three steps that touch no engine file:
 * write the component, describe it, call `registerModule`.
 *
 * Registration happens at import time from `modules/index.js`, which is the one
 * place that imports every module. Nothing else should import that file for
 * side effects.
 */

/** @typedef {import('../types/dashboard.js').DashboardModuleDefinition} DashboardModuleDefinition */

/**
 * Categories, in the order the library lists them.
 *
 * Deliberately finer than the obvious four or five. The library now carries
 * named presets alongside the generic modules, and a single "Market" heading
 * held twenty-three entries in one alphabetical run - price tiles, charts and
 * rankings interleaved, so nothing could be found by scanning. Splitting the
 * headings is what makes that list navigable without adding a second level of
 * chrome to a narrow drawer.
 *
 * A module naming a category that is not here still registers - it is grouped
 * under "Other" rather than dropped, because losing a module from the library
 * is a worse failure than showing it in the wrong section.
 */
export const MODULE_CATEGORIES = [
  { key: 'prices', label: 'Prices & metrics' },
  { key: 'charts', label: 'Charts' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'trading', label: 'Trading' },
  { key: 'pairs', label: 'Pools & pairs' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'hex', label: 'HEX' },
  { key: 'network', label: 'PulseChain' },
  { key: 'personal', label: 'Personal' },
]

/** @type {Map<string, DashboardModuleDefinition>} */
const registry = new Map()

/**
 * Fill in the parts of a definition every module needs but most do not want to
 * restate. Sizes are the important ones: the grid will happily place an item
 * with no minimum and let a user crush it to one cell of unreadable content.
 *
 * @param {DashboardModuleDefinition} def
 * @returns {DashboardModuleDefinition}
 */
function normalise(def) {
  return {
    contextAware: false,
    contextKind: null,
    configSchema: [],
    defaultConfig: {},
    minSize: { w: 2, h: 2 },
    defaultSize: { w: 4, h: 4 },
    /*
     * Whether the module fills the box it is given, or is sized by what is in
     * it.
     *
     * Almost everything here is ordinary flowing content - a table, a few
     * figures - and knows its own height. A chart does not: it draws into a
     * canvas sized to its container, so a container sized to its content would
     * collapse to nothing.
     *
     * The grid gives every module a fixed height either way, so this only
     * matters in the stacked view, where imposing the desktop height on a
     * content-sized module is what left a liquidity panel with 72px of figures
     * in a 546px box.
     */
    fillsHeight: false,
    ...def,
  }
}

/**
 * Register one module.
 *
 * Throws on a missing type or component, because both are programmer errors
 * that would otherwise surface much later as an unrenderable saved dashboard.
 * A duplicate type warns and wins, so hot reload does not accumulate stale
 * definitions.
 *
 * @param {DashboardModuleDefinition} def
 */
export function registerModule(def) {
  if (!def?.type) throw new Error('registerModule: a module needs a `type`')
  if (!def.component) throw new Error(`registerModule: "${def.type}" has no component`)
  if (registry.has(def.type)) {
    console.warn(`registerModule: "${def.type}" was already registered; replacing it`)
  }
  registry.set(def.type, normalise(def))
}

/** @param {DashboardModuleDefinition[]} defs */
export function registerModules(defs) {
  for (const def of defs) registerModule(def)
}

/**
 * Look up a definition.
 *
 * Returns undefined rather than throwing: a saved dashboard can name a module
 * that no longer exists, and that has to render as a removable placeholder
 * rather than take the page down.
 *
 * @param {string} type
 * @returns {DashboardModuleDefinition | undefined}
 */
export function getModuleDefinition(type) {
  return registry.get(type)
}

/** @returns {DashboardModuleDefinition[]} */
export function listModules() {
  return Array.from(registry.values())
}

/** Test seam. Not used by the app. */
export function __clearRegistry() {
  registry.clear()
}
