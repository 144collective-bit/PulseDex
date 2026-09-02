import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseUnits } from 'viem'

/*
 * Reading a balance, in raw units.
 *
 * The portfolio service already reads balances, but it returns floats for
 * display. This exists because a float is not something to compare an amount
 * against when the comparison decides whether a transaction is offered - an
 * 18-decimal balance can need more significant digits than a double holds, and
 * the failure would be telling someone they can afford what they cannot.
 */

vi.mock('./rpc', () => ({
  publicClient: { getBalance: vi.fn(), readContract: vi.fn(), getGasPrice: vi.fn() },
}))

const { publicClient } = await import('./rpc')
const { readBalance, readGasPrice } = await import('./balance')
const { NATIVE_PLS } = await import('../config/dex')

const TOKEN = { address: '0x1111111111111111111111111111111111111111', decimals: 18, symbol: 'AAA' }
const PLS = { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' }
const OWNER = '0x9999999999999999999999999999999999999999'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readBalance', () => {
  it('asks the chain directly for native PLS, which has no contract', async () => {
    publicClient.getBalance = vi.fn(async () => parseUnits('42', 18))

    await expect(readBalance({ token: PLS, owner: OWNER })).resolves.toBe(parseUnits('42', 18))
    expect(publicClient.getBalance).toHaveBeenCalledWith({ address: OWNER })
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('asks the token contract for anything else', async () => {
    publicClient.readContract = vi.fn(async () => parseUnits('7', 18))

    await expect(readBalance({ token: TOKEN, owner: OWNER })).resolves.toBe(parseUnits('7', 18))

    const call = publicClient.readContract.mock.calls[0][0]
    expect(call.address).toBe(TOKEN.address)
    expect(call.functionName).toBe('balanceOf')
    expect(call.args).toEqual([OWNER])
  })

  it('returns the figure untouched, at full precision', async () => {
    // Anything that rounds here changes what an affordability check compares.
    const huge = 123_456_789_012_345_678_901_234_567_890n
    publicClient.readContract = vi.fn(async () => huge)

    await expect(readBalance({ token: TOKEN, owner: OWNER })).resolves.toBe(huge)
  })

  it('has nothing to read without a token or an owner', async () => {
    await expect(readBalance({ token: null, owner: OWNER })).resolves.toBeNull()
    await expect(readBalance({ token: TOKEN, owner: null })).resolves.toBeNull()
    expect(publicClient.readContract).not.toHaveBeenCalled()
    expect(publicClient.getBalance).not.toHaveBeenCalled()
  })

  it('lets a failed read reject rather than reporting zero', async () => {
    // Zero would read as an empty wallet and block a trade the user can afford.
    publicClient.readContract = vi.fn(async () => {
      throw new Error('rpc down')
    })

    await expect(readBalance({ token: TOKEN, owner: OWNER })).rejects.toThrow('rpc down')
  })
})

describe('readGasPrice', () => {
  it('returns the live price, which the reserve is derived from', async () => {
    publicClient.getGasPrice = vi.fn(async () => 1_234_567n)

    await expect(readGasPrice()).resolves.toBe(1_234_567n)
  })
})
