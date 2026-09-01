import { describe, it, expect } from 'vitest'
import { dashboardReducer, initHistory, getActiveDashboard } from './dashboardReducer'

/*
 * Every change to a dashboard goes through this reducer, which is what makes
 * undo cheap: it is pure, so history is a stack of previous states. That also
 * makes it the one part of the dashboard that can be tested exhaustively
 * without a browser.
 */

const definition = {
  type: 'price-card',
  name: 'Token metric',
  defaultSize: { w: 3, h: 3 },
  defaultConfig: { metric: 'price' },
  contextAware: true,
}

/** Apply a list of actions in order, returning the final history. */
function run(actions, history = initHistory()) {
  return actions.reduce((h, action) => dashboardReducer(h, action), history)
}

const modulesOf = (history) => getActiveDashboard(history.present).modules

describe('adding and removing modules', () => {
  it('adds a module with the definition defaults applied', () => {
    const h = run([{ type: 'addModule', definition }])
    const added = modulesOf(h).at(-1)

    expect(added.type).toBe('price-card')
    expect(added.config).toEqual({ metric: 'price' })
    expect(added.layout.w).toBe(3)
  })

  it('places a new module below the others rather than at the top', () => {
    // Dropping one into 0,0 would shove the whole layout down the page every
    // time something was added, which reads as the dashboard rearranging itself.
    const h = run([{ type: 'addModule', definition }])
    const before = modulesOf(h).slice(0, -1)
    const added = modulesOf(h).at(-1)
    const lowest = Math.max(...before.map((m) => m.layout.y + m.layout.h))

    expect(added.layout.y).toBeGreaterThanOrEqual(lowest)
  })

  it('gives every instance its own id', () => {
    const h = run([
      { type: 'addModule', definition },
      { type: 'addModule', definition },
    ])
    const ids = modulesOf(h).map((m) => m.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('removes only the module asked for', () => {
    const h1 = run([{ type: 'addModule', definition }])
    const target = modulesOf(h1).at(-1).id
    const h2 = dashboardReducer(h1, { type: 'removeModule', id: target })

    expect(modulesOf(h2).some((m) => m.id === target)).toBe(false)
    expect(modulesOf(h2)).toHaveLength(modulesOf(h1).length - 1)
  })

  it('duplicates a module without reusing its id', () => {
    const h1 = run([{ type: 'addModule', definition }])
    const source = modulesOf(h1).at(-1)
    const h2 = dashboardReducer(h1, { type: 'duplicateModule', id: source.id })
    const copy = modulesOf(h2).at(-1)

    expect(copy.id).not.toBe(source.id)
    expect(copy.type).toBe(source.type)
    expect(copy.config).toEqual(source.config)
  })
})

describe('module state', () => {
  it('merges a config patch instead of replacing the whole object', () => {
    const h1 = run([{ type: 'addModule', definition }])
    const id = modulesOf(h1).at(-1).id
    const h2 = dashboardReducer(h1, { type: 'updateModuleConfig', id, patch: { window: 'h1' } })

    expect(modulesOf(h2).at(-1).config).toEqual({ metric: 'price', window: 'h1' })
  })

  it('locks and unlocks a module', () => {
    const h1 = run([{ type: 'addModule', definition }])
    const id = modulesOf(h1).at(-1).id
    const locked = dashboardReducer(h1, { type: 'setModuleLocked', id, locked: true })
    expect(modulesOf(locked).at(-1).locked).toBe(true)

    const unlocked = dashboardReducer(locked, { type: 'setModuleLocked', id, locked: false })
    expect(modulesOf(unlocked).at(-1).locked).toBe(false)
  })

  it('hides a module without removing it, which is what makes Hide different from Remove', () => {
    const h1 = run([{ type: 'addModule', definition }])
    const id = modulesOf(h1).at(-1).id
    const h2 = dashboardReducer(h1, { type: 'setModuleHidden', id, hidden: true })

    expect(modulesOf(h2).find((m) => m.id === id).hidden).toBe(true)
    expect(modulesOf(h2)).toHaveLength(modulesOf(h1).length)
  })
})

describe('undo and redo', () => {
  it('walks back an edit', () => {
    const before = initHistory()
    const added = dashboardReducer(before, { type: 'addModule', definition })
    const undone = dashboardReducer(added, { type: 'undo' })

    expect(modulesOf(undone)).toHaveLength(modulesOf(before).length)
  })

  it('walks it forward again', () => {
    const added = dashboardReducer(initHistory(), { type: 'addModule', definition })
    const undone = dashboardReducer(added, { type: 'undo' })
    const redone = dashboardReducer(undone, { type: 'redo' })

    expect(modulesOf(redone)).toHaveLength(modulesOf(added).length)
  })

  it('does nothing when there is nothing to undo', () => {
    const h = initHistory()
    expect(dashboardReducer(h, { type: 'undo' })).toBe(h)
  })

  it('drops the redo stack once a new edit is made', () => {
    // Otherwise redo would jump to a future that no longer follows from here.
    const added = dashboardReducer(initHistory(), { type: 'addModule', definition })
    const undone = dashboardReducer(added, { type: 'undo' })
    const diverged = dashboardReducer(undone, { type: 'addModule', definition })

    expect(diverged.future).toHaveLength(0)
  })

  it('does not record hydrating from storage as an editing step', () => {
    // Undo should walk back through layout edits, not undo the act of loading
    // the page.
    const h = dashboardReducer(initHistory(), {
      type: 'hydrate',
      state: initHistory().present,
    })

    expect(h.past).toHaveLength(0)
  })

  it('does not record changing the shared pair as an editing step', () => {
    const h = dashboardReducer(initHistory(), {
      type: 'setGlobalContext',
      patch: { asset: { address: '0xabc', symbol: 'X' } },
    })

    expect(h.past).toHaveLength(0)
    expect(getActiveDashboard(h.present).globalContext.asset.symbol).toBe('X')
  })
})

describe('several dashboards', () => {
  it('numbers a name that is already taken', () => {
    // Three boards all called "New dashboard" left the picker listing the same
    // label three times with nothing to choose between them.
    const h = run([
      { type: 'createDashboard', name: 'Dashboard' },
      { type: 'createDashboard', name: 'Dashboard' },
      { type: 'createDashboard', name: 'Dashboard' },
    ])
    const names = h.present.dashboards.map((d) => d.name)

    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Dashboard 2')
  })

  it('leaves the first use of a name alone', () => {
    const h = run([{ type: 'createDashboard', name: 'Scalping' }])
    expect(h.present.dashboards.map((d) => d.name)).toContain('Scalping')
  })

  it('makes a new dashboard the active one', () => {
    const h = run([{ type: 'createDashboard', name: 'Scalping' }])
    expect(getActiveDashboard(h.present).name).toBe('Scalping')
  })

  it('renames the active dashboard', () => {
    const h1 = run([{ type: 'createDashboard', name: 'Scalping' }])
    const h2 = dashboardReducer(h1, { type: 'renameDashboard', name: 'Swing' })

    expect(getActiveDashboard(h2.present).name).toBe('Swing')
  })

  it('ignores a blank rename rather than leaving an unlabelled entry', () => {
    const h1 = run([{ type: 'createDashboard', name: 'Scalping' }])
    const h2 = dashboardReducer(h1, { type: 'renameDashboard', name: '   ' })

    expect(getActiveDashboard(h2.present).name).toBe('Scalping')
  })

  it('refuses to delete the last dashboard', () => {
    // An account with none would have nothing to render and no control to get
    // back from it.
    const h = initHistory()
    const only = h.present.dashboards[0].id
    const after = dashboardReducer(h, { type: 'deleteDashboard', id: only })

    expect(after.present.dashboards).toHaveLength(1)
  })

  it('moves to a surviving dashboard when the active one is deleted', () => {
    const h1 = run([{ type: 'createDashboard', name: 'Scalping' }])
    const active = h1.present.activeId
    const h2 = dashboardReducer(h1, { type: 'deleteDashboard', id: active })

    expect(h2.present.activeId).not.toBe(active)
    expect(getActiveDashboard(h2.present)).toBeTruthy()
  })
})
