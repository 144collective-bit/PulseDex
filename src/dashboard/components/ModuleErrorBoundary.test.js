import { describe, it, expect } from 'vitest'
import ModuleErrorBoundary from './ModuleErrorBoundary'

/*
 * The boundary's state machine, tested without React.
 *
 * `getDerivedStateFromProps` is a pure static, so the sequence of renders that
 * broke it can be replayed directly - no DOM, no renderer, no timing.
 *
 * The bug it guards: the reset key was only tracked while an error was already
 * held. Edit a module's settings while it is working and the remembered key
 * stayed at the mount value, so the first crash afterwards was compared
 * against a key that had already moved on and was cleared on the very next
 * render. The module re-rendered, threw again, was cleared again - a crash
 * loop where the error state should have been.
 */

const derive = ModuleErrorBoundary.getDerivedStateFromProps

/** Apply a patch the way React would, returning the next state. */
function step(state, resetKey) {
  const patch = derive({ resetKey }, state)
  return patch ? { ...state, ...patch } : state
}

describe('ModuleErrorBoundary.getDerivedStateFromProps', () => {
  it('remembers the reset key on the first render', () => {
    const next = step({ error: null }, 'a')
    expect(next.resetKey).toBe('a')
    expect(next.error).toBeNull()
  })

  it('tracks the key while no error is held', () => {
    let state = step({ error: null }, 'a')
    state = step(state, 'b')
    expect(state.resetKey).toBe('b')
  })

  it('holds an error that arrives after the configuration changed', () => {
    // The exact sequence that used to loop.
    let state = step({ error: null }, 'a')
    state = step(state, 'b') // user edits settings, no error yet
    state = { ...state, error: new Error('boom') } // module throws
    state = step(state, 'b') // next render

    expect(state.error).toBeInstanceOf(Error)
  })

  it('keeps holding the error across further renders', () => {
    let state = step({ error: null }, 'a')
    state = { ...state, error: new Error('boom') }
    state = step(state, 'a')
    state = step(state, 'a')

    expect(state.error).toBeInstanceOf(Error)
  })

  it('clears the error when the configuration changes again', () => {
    // Reconfiguring is the user's way of saying "try something different",
    // and it must give a crashed module another chance.
    let state = step({ error: null }, 'a')
    state = { ...state, error: new Error('boom') }
    state = step(state, 'c')

    expect(state.error).toBeNull()
    expect(state.resetKey).toBe('c')
  })

  it('returns null when nothing changed, so React skips the update', () => {
    const state = step({ error: null }, 'a')
    expect(derive({ resetKey: 'a' }, state)).toBeNull()
  })
})
