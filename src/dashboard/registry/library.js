import { MODULE_CATEGORIES, getModuleDefinition, listModules } from './moduleRegistry'
import { auditPresets, listPresets } from './presets'

/**
 * What the module library actually shows.
 *
 * Two kinds of thing appear in one list. A *preset* is a named, preconfigured
 * module - "HEX Price" - and a *module* is the generic capability behind it,
 * "Token metric", which has to be configured after adding. Both resolve to the
 * same three arguments the dashboard already accepts, so everything downstream
 * of here treats them identically.
 *
 * Merging them rather than splitting them into tabs is deliberate: a user
 * searching "hex" wants every HEX thing, and does not know or care which side
 * of an internal boundary each result sits on.
 *
 * @typedef {Object} LibraryEntry
 * @property {'preset'|'module'} kind
 * @property {string} key
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {import('react').ComponentType<any>} [icon]
 * @property {import('../types/dashboard.js').DashboardModuleDefinition} definition
 * @property {Record<string, unknown>} [config]  Preset only.
 * @property {{w:number,h:number}} size
 * @property {string} [unavailableReason]
 * @property {string} searchText
 */

const OTHER_CATEGORY = { key: 'other', label: 'Other' }

/**
 * Config keys that name what a module is looking at.
 *
 * A preset that sets one of these has chosen a subject, and its label promises
 * that subject - so it must not also follow the dashboard context, or changing
 * the toolbar silently repoints it while the label stays put.
 */
const SUBJECT_KEYS = ['token', 'pair']

function presetEntry(preset) {
  const definition = getModuleDefinition(preset.type)
  const pinsSubject = SUBJECT_KEYS.some((key) => preset.config?.[key] != null)

  return {
    kind: 'preset',
    key: preset.key,
    name: preset.name,
    description: preset.description,
    category: preset.category ?? definition.category,
    // Presets borrow the icon of the module they build on, so a price tile
    // looks like a price tile however it was added.
    icon: definition.icon,
    definition,
    config: preset.config,
    // Explicit only when the preset pins a subject; otherwise the module's own
    // default applies, so a preset like "My Portfolio" is unaffected.
    contextMode: preset.contextMode ?? (pinsSubject ? 'local' : undefined),
    size: definition.defaultSize,
    unavailableReason: definition.unavailableReason,
    searchText: [preset.name, preset.description, ...(preset.keywords ?? []), definition.name]
      .join(' ')
      .toLowerCase(),
  }
}

function moduleEntry(definition) {
  return {
    kind: 'module',
    key: `module:${definition.type}`,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    icon: definition.icon,
    definition,
    config: undefined,
    contextMode: undefined,
    size: definition.defaultSize,
    unavailableReason: definition.unavailableReason,
    searchText: [definition.name, definition.description, definition.type].join(' ').toLowerCase(),
  }
}

/**
 * Every entry, grouped for display.
 *
 * Presets come first within a category, then the generic modules. That ordering
 * is the whole point of the feature: the concrete thing someone is looking for
 * should be above the abstract capability they would otherwise have to
 * configure by hand, while the capability stays reachable for any token the
 * catalogue does not cover.
 *
 * @param {string} [query]
 * @returns {{key:string,label:string,entries:LibraryEntry[]}[]}
 */
export function listLibraryEntries(query = '') {
  const q = query.trim().toLowerCase()
  const matches = (entry) => !q || entry.searchText.includes(q)

  const entries = [...listPresets().map(presetEntry), ...listModules().map(moduleEntry)]

  const known = new Set(MODULE_CATEGORIES.map((c) => c.key))
  const buckets = [...MODULE_CATEGORIES, OTHER_CATEGORY].map((c) => ({ ...c, entries: [] }))
  const byKey = new Map(buckets.map((b) => [b.key, b]))

  for (const entry of entries) {
    if (!matches(entry)) continue
    const key = known.has(entry.category) ? entry.category : OTHER_CATEGORY.key
    byKey.get(key).entries.push(entry)
  }

  for (const bucket of buckets) {
    bucket.entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'preset' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return buckets.filter((b) => b.entries.length > 0)
}

/** Total shown when nothing is being searched for - used to sanity-check length. */
export function libraryEntryCount() {
  return listPresets().length + listModules().length
}

/*
 * The catalogue is maintained by hand against modules that change on their own
 * schedule, so it is checked once at import time in development. Nothing is
 * thrown: a mismatched preset should be visible to whoever is working on it,
 * not take the dashboard down for a user.
 */
if (import.meta.env?.DEV) {
  const problems = auditPresets()
  if (problems.length > 0) {
    console.warn(`Module preset catalogue has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
  }
}
