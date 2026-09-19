import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dbError, GENERIC_DB_MESSAGE } from './dbError'

let spy
beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => spy.mockRestore())

describe('dbError', () => {
  it('never puts the database\'s own words on the page', () => {
    const leaky = {
      code: '42501',
      message: 'new row violates row-level security policy for table "profiles"',
    }
    const err = dbError(leaky, 'save profile')
    expect(err.message).toBe('You are not allowed to do that.')
    expect(err.message).not.toContain('profiles')
    expect(err.message).not.toContain('row-level security')
  })

  it('falls back to the generic sentence for a code it does not know', () => {
    expect(dbError({ code: 'XX000', message: 'internal error: page 3 of relation' }).message).toBe(
      GENERIC_DB_MESSAGE
    )
  })

  it('falls back when there is no code at all', () => {
    expect(dbError({ message: 'nope' }).message).toBe(GENERIC_DB_MESSAGE)
    expect(dbError(null).message).toBe(GENERIC_DB_MESSAGE)
    expect(dbError(undefined).message).toBe(GENERIC_DB_MESSAGE)
  })

  it('names the failures that mean something different to do', () => {
    expect(dbError({ code: '42P01' }).message).toMatch(/not set up/)
    expect(dbError({ code: '23505' }).message).toMatch(/already taken/)
    expect(dbError({ code: 'PGRST116' }).message).toMatch(/could not be found/)
  })

  it('keeps the original for anything that needs to inspect it', () => {
    const original = { code: '23505', message: 'duplicate key value' }
    const err = dbError(original)
    expect(err.cause).toBe(original)
    expect(err.code).toBe('23505')
  })

  it('logs the detail where a developer will see it, with the context', () => {
    dbError({ code: '42P01', message: 'relation "public.posts" does not exist' }, 'load feed')
    expect(spy).toHaveBeenCalledWith(
      'load feed failed:',
      '42P01',
      'relation "public.posts" does not exist'
    )
  })

  it('is a real Error, so existing catch blocks keep working', () => {
    const err = dbError({ code: '42501' })
    expect(err).toBeInstanceOf(Error)
    expect(typeof err.message).toBe('string')
  })
})
