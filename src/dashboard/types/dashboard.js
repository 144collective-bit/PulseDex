/**
 * Dashboard type model.
 *
 * PulseDEX is a JavaScript codebase, so these are JSDoc typedefs rather than
 * TypeScript declarations - the same approach the services already use. They
 * are the single source of truth for the shapes the dashboard serialises to
 * storage, so changing one here means changing the migration in
 * `state/dashboardStorage.js` too.
 */

/**
 * What a module *is*. Registered once, at import time, and never mutated.
 *
 * @typedef {Object} DashboardModuleDefinition
 * @property {string} type            Stable id. Persisted, so renaming one orphans saved instances.
 * @property {string} name            Human label, shown in the library and the module header.
 * @property {string} description     One line, shown in the library card.
 * @property {string} category        Key from MODULE_CATEGORIES.
 * @property {React.ComponentType<any>} component  Renders the module body only - never its chrome.
 * @property {import('react').ComponentType<any>} [icon]  A lucide-react icon component.
 * @property {{w:number,h:number}} defaultSize
 * @property {{w:number,h:number}} minSize
 * @property {{w:number,h:number}} [maxSize]
 * @property {Record<string, unknown>} [defaultConfig]
 * @property {ConfigField[]} [configSchema]  Drives the generic configurator. Empty means not configurable.
 * @property {boolean} [contextAware]  Can follow the dashboard's global asset/pair.
 * @property {'asset'|'pair'|'wallet'|null} [contextKind]  Which slice of global context it reads.
 * @property {string} [unavailableReason]  Set when the module has no real data source yet.
 */

/**
 * One field in a module's configuration panel.
 *
 * The configurator renders from this rather than each module shipping its own
 * form, which is what keeps "add a module" from meaning "write another form".
 *
 * @typedef {Object} ConfigField
 * @property {string} key
 * @property {string} label
 * @property {'token'|'pair'|'select'|'number'|'toggle'|'text'} type
 * @property {{value:string|number,label:string}[]} [options]  For 'select'.
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [help]
 */

/**
 * How a user has configured one placement of a module.
 *
 * @typedef {Object} DashboardModuleInstance
 * @property {string} id              Unique within a dashboard. Also the grid item key.
 * @property {string} type            Key into the registry.
 * @property {{x:number,y:number,w:number,h:number}} layout
 * @property {Record<string, unknown>} config
 * @property {'global'|'local'} contextMode
 * @property {boolean} [locked]       Pinned in place; cannot be dragged or resized.
 * @property {boolean} [hidden]       Kept in the dashboard but not rendered.
 */

/**
 * The shared asset/pair/wallet selection that context-following modules read.
 *
 * @typedef {Object} DashboardContextValue
 * @property {TokenRef} [asset]
 * @property {PairRef} [pair]
 * @property {string} [wallet]
 */

/**
 * A token, in the shape the rest of PulseDEX already passes around.
 *
 * @typedef {Object} TokenRef
 * @property {string} address   Contract address, or the 'PLS' native sentinel.
 * @property {string} symbol
 * @property {string} [name]
 * @property {number} [decimals]
 * @property {string} [logo]
 * @property {boolean} [verified]
 */

/**
 * Two assets. Deliberately *not* a trade route - a pair is what is being
 * looked at, a route is how a swap would be executed between two assets.
 *
 * @typedef {Object} PairRef
 * @property {string} [pairAddress]  Pool address when a direct pool is known.
 * @property {TokenRef} base
 * @property {TokenRef} quote
 * @property {string} [label]        e.g. "HEX / WPLS"
 */

/**
 * @typedef {Object} Dashboard
 * @property {string} id
 * @property {string} name
 * @property {string} [preset]        Preset key this was created from, if any.
 * @property {DashboardModuleInstance[]} modules
 * @property {DashboardContextValue} globalContext
 * @property {number} [updatedAt]
 */

/**
 * The whole persisted blob for one account.
 *
 * `dashboards` is an array from the very first version even though the UI
 * ships with a single active dashboard - adding the second one later must not
 * require migrating everyone's saved data.
 *
 * @typedef {Object} DashboardState
 * @property {number} version
 * @property {Dashboard[]} dashboards
 * @property {string} activeId
 */

export {}
