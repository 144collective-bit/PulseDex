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
 * A module naming a category that is not here still registers - it is grouped
 * under "Other" rather than dropped, because losing a module from the library
 * is a worse failure than showing it in the wrong section.
 */
export const MODULE_CATEGORIES = [
  { key: 'market', label: 'Market' },
  { key: 'trading', label: 'Trading' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'pair', label: 'Pair' },
  { key: 'hex', label: 'HEX' },
  { key: 'pulsechain', label: 'PulseChain' },
  { key: 'personal', label: 'Personal' },
]

const OTHER_CATEGORY = { key: 'other', label: 'Other' }

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

/**
 * Every registered module grouped for the library, in category order, with
 * empty categories dropped.
 *
 * @param {string} [query] Case-insensitive filter over name and description.
 * @returns {{key:string,label:string,modules:DashboardModuleDefinition[]}[]}
 */
export function listModulesByCategory(query = '') {
  const q = query.trim().toLowerCase()
  const matches = (m) =>
    !q ||
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.type.includes(q)

  const known = new Set(MODULE_CATEGORIES.map((c) => c.key))
  const buckets = [...MODULE_CATEGORIES, OTHER_CATEGORY].map((c) => ({ ...c, modules: [] }))
  const byKey = new Map(buckets.map((b) => [b.key, b]))

  for (const mod of registry.values()) {
    if (!matches(mod)) continue
    const key = known.has(mod.category) ? mod.category : OTHER_CATEGORY.key
    byKey.get(key).modules.push(mod)
  }

  for (const bucket of buckets) {
    bucket.modules.sort((a, b) => a.name.localeCompare(b.name))
  }

  return buckets.filter((b) => b.modules.length > 0)
}

/** Test seam. Not used by the app. */
export function __clearRegistry() {
  registry.clear()
}
