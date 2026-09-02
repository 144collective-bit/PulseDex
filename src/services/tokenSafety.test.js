import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * What the app is willing to claim about a token contract.
 *
 * This module exists because the panel it replaced asserted, for every token
 * without exception, that the honeypot risk had passed, that buy and sell tax
 * were zero, and that the contract was verified - four hardcoded answers. On a
 * genuine honeypot it told the reader it was safe, which is the one failure
 * mode a screener must not have.
 *
 * So the invariant worth defending is not "does it report the right value"
 * but "does it ever report a value it does not have". Everything below is
 * really one question asked several ways: when the explorer does not answer,
 * does this say unknown, or does it say fine?
 *
 * The distinction that carries it is null versus false. A 404 from the
 * contract endpoint is an answer - the source was never published, so
 * `verified` is genuinely false. A network failure is not an answer, and
 * `verified` has to be null. Collapsing the two would turn every outage into a
 * page full of tokens reported as unverified, or worse, the reverse.
 */

vi.mock('./pulsescan', () => ({ fetchWithRetry: vi.fn() }))

const { fetchWithRetry } = await import('./pulsescan')
const { fetchTokenSafety } = await import('./tokenSafety')

const ADDRESS = '0x1111111111111111111111111111111111111111'

/** The explorer's contract record for a verified token. */
const CONTRACT = {
  is_verified: true,
  is_fully_verified: true,
  is_self_destructed: false,
  compiler_version: 'v0.8.20+commit.a1b79de6',
}

/** The explorer's token record. */
const TOKEN = { type: 'ERC-20', holders: '1234' }

/** An HTTP failure carrying the status, the way fetchWithRetry raises one. */
function httpError(status) {
  const err = new Error(`HTTP ${status}`)
  err.status = status
  return err
}

/**
 * Answer the two reads independently.
 *
 * The module fires both at once through allSettled, so the mock has to route
 * on the URL rather than on call order - otherwise a test that only cares
 * about the token record ends up asserting on whichever request happened to
 * be scheduled first.
 */
function respond({ contract, token }) {
  fetchWithRetry.mockImplementation(async (url) => {
    const which = url.includes('/smart-contracts/') ? contract : token
    if (which instanceof Error) throw which
    return which
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchTokenSafety', () => {
  it('refuses to answer without an address', async () => {
    await expect(fetchTokenSafety(null)).rejects.toThrow('No token address')
    await expect(fetchTokenSafety('')).rejects.toThrow('No token address')
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('reports what the explorer actually returned', async () => {
    respond({ contract: CONTRACT, token: TOKEN })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety).toEqual({
      verified: true,
      fullyVerified: true,
      selfDestructed: false,
      compiler: 'v0.8.20+commit.a1b79de6',
      standard: 'ERC-20',
      holders: 1234,
      isContract: true,
    })
  })

  /* ------------------------------------------------------------------
     The distinction the whole module turns on.
     ------------------------------------------------------------------ */

  it('says NOT verified when the explorer answers 404, because that is an answer', async () => {
    // No published source is the commonest case there is, and it is a fact
    // about the token rather than a gap in what we know.
    respond({ contract: httpError(404), token: TOKEN })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety.verified).toBe(false)
    expect(safety.fullyVerified).toBe(false)
    expect(safety.selfDestructed).toBe(false)
  })

  it('says UNKNOWN when the contract read fails for any other reason', async () => {
    // An outage is not evidence of anything. Reporting false here would tell a
    // reader the source was never published, which we do not know.
    for (const failure of [httpError(500), httpError(429), new Error('network down')]) {
      respond({ contract: failure, token: TOKEN })

      const safety = await fetchTokenSafety(ADDRESS)

      expect(safety.verified).toBeNull()
      expect(safety.fullyVerified).toBeNull()
      expect(safety.selfDestructed).toBeNull()
    }
  })

  it('never reports a token as verified when nothing was read', async () => {
    // The failure mode the module was written to prevent, stated directly.
    respond({ contract: new Error('down'), token: new Error('down') })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety.verified).not.toBe(true)
    expect(safety.fullyVerified).not.toBe(true)
    expect(safety.verified).toBeNull()
  })

  /* ------------------------------------------------------------------
     One read failing must not blank the other.
     ------------------------------------------------------------------ */

  it('keeps the holder count when the contract read fails', async () => {
    respond({ contract: httpError(404), token: TOKEN })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety.holders).toBe(1234)
    expect(safety.standard).toBe('ERC-20')
    expect(safety.isContract).toBe(true)
  })

  it('keeps the verification when the token read fails', async () => {
    respond({ contract: CONTRACT, token: new Error('down') })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety.verified).toBe(true)
    expect(safety.holders).toBeNull()
    expect(safety.standard).toBeNull()
    expect(safety.isContract).toBe(true)
  })

  /* ------------------------------------------------------------------
     Field-level handling.
     ------------------------------------------------------------------ */

  it('reads a self-destructed contract as such', async () => {
    respond({ contract: { ...CONTRACT, is_self_destructed: true }, token: TOKEN })

    expect((await fetchTokenSafety(ADDRESS)).selfDestructed).toBe(true)
  })

  it('treats a partially verified contract as verified but not fully', async () => {
    respond({
      contract: { ...CONTRACT, is_verified: true, is_fully_verified: false },
      token: TOKEN,
    })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety.verified).toBe(true)
    expect(safety.fullyVerified).toBe(false)
  })

  it('coerces the holder count and rejects a nonsense one', async () => {
    respond({ contract: CONTRACT, token: { type: 'ERC-20', holders: 'not a number' } })
    expect((await fetchTokenSafety(ADDRESS)).holders).toBeNull()

    respond({ contract: CONTRACT, token: { type: 'ERC-20' } })
    expect((await fetchTokenSafety(ADDRESS)).holders).toBeNull()

    // Zero is a real holder count, not a missing one.
    respond({ contract: CONTRACT, token: { type: 'ERC-20', holders: '0' } })
    expect((await fetchTokenSafety(ADDRESS)).holders).toBe(0)
  })

  it('reports isContract false when neither endpoint knows the address', async () => {
    // An address with no contract and no token record is a wallet, or nothing.
    respond({ contract: httpError(404), token: httpError(404) })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety.isContract).toBe(false)
  })

  it('asks the explorer for both records, for the address given', async () => {
    respond({ contract: CONTRACT, token: TOKEN })

    await fetchTokenSafety(ADDRESS)

    const urls = fetchWithRetry.mock.calls.map(([url]) => url)
    expect(urls).toHaveLength(2)
    expect(urls.some((u) => u.includes(`/smart-contracts/${ADDRESS}`))).toBe(true)
    expect(urls.some((u) => u.includes(`/tokens/${ADDRESS}`))).toBe(true)
  })

  it('does not invent tax or honeypot findings', async () => {
    /*
     * Establishing either means simulating a buy and a sell against a forked
     * node, which cannot be done in a browser. The shape must therefore not
     * carry these fields at all - a null would still invite a panel to render
     * a row for them, and a row is halfway to an assertion.
     */
    respond({ contract: CONTRACT, token: TOKEN })

    const safety = await fetchTokenSafety(ADDRESS)

    expect(safety).not.toHaveProperty('honeypot')
    expect(safety).not.toHaveProperty('buyTax')
    expect(safety).not.toHaveProperty('sellTax')
  })
})
