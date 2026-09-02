import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseUnits } from 'viem'

/*
 * Reading an allowance.
 *
 * Thin on purpose - the call itself is built and tested in swap.js. What is
 * worth pinning here is that native PLS never reaches the network at all (it
 * has no contract to ask) and that the bigint comes back untouched, since
 * anything that rounds it would quietly change what the swap is compared
 * against.
 */

vi.mock('./rpc', () => ({ publicClient: { readContract: vi.fn() } }))

const { publicClient } = await import('./rpc')
const { readAllowance } = await import('./allowance')
const { NATIVE_PLS, PULSEX_ROUTER_V2 } = await import('../config/dex')

const TOKEN = { address: '0x1111111111111111111111111111111111111111', decimals: 18, symbol: 'AAA' }
const PLS = { address: NATIVE_PLS, decimals: 18, symbol: 'PLS' }
const OWNER = '0x9999999999999999999999999999999999999999'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readAllowance', () => {
  it('returns the allowance exactly as the chain reported it', () => {
    const allowance = parseUnits('123.456', 18)
    publicClient.readContract = vi.fn(async () => allowance)

    return expect(
      readAllowance({ token: TOKEN, owner: OWNER, spender: PULSEX_ROUTER_V2 })
    ).resolves.toBe(allowance)
  })

  it('asks the token about the owner and the spender', async () => {
    publicClient.readContract = vi.fn(async () => 0n)

    await readAllowance({ token: TOKEN, owner: OWNER, spender: PULSEX_ROUTER_V2 })

    const call = publicClient.readContract.mock.calls[0][0]
    expect(call.address).toBe(TOKEN.address)
    expect(call.functionName).toBe('allowance')
    expect(call.args).toEqual([OWNER, PULSEX_ROUTER_V2])
  })

  it('never goes to the network for native PLS', async () => {
    // There is no contract to ask, so a request would be a guaranteed failure.
    await expect(
      readAllowance({ token: PLS, owner: OWNER, spender: PULSEX_ROUTER_V2 })
    ).resolves.toBeNull()

    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('has nothing to read without an owner or a spender', async () => {
    publicClient.readContract = vi.fn(async () => 0n)

    await expect(readAllowance({ token: TOKEN, owner: null, spender: PULSEX_ROUTER_V2 })).resolves.toBeNull()
    await expect(readAllowance({ token: TOKEN, owner: OWNER, spender: null })).resolves.toBeNull()
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('lets a failed read reject rather than reporting zero', async () => {
    // Zero would read as "not approved" and send the user to sign an approval
    // they may not need. An outage is not an allowance of nothing.
    publicClient.readContract = vi.fn(async () => {
      throw new Error('rpc down')
    })

    await expect(
      readAllowance({ token: TOKEN, owner: OWNER, spender: PULSEX_ROUTER_V2 })
    ).rejects.toThrow('rpc down')
  })
})
