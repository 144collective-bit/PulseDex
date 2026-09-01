/**
 * PulseScan v2 REST API Client (Blockscout-based)
 * Base URL: https://api.scan.pulsechain.com/api/v2
 * 
 * Provides robust token listing, cursor pagination, exponential backoff for 429s,
 * global token search, and holder distribution analysis for PulseChain PRC-20s.
 */

const PULSESCAN_BASE_URL = 'https://api.scan.pulsechain.com/api/v2'

/**
 * @typedef {Object} NextPageParams
 * @property {string} [contract_address_hash]
 * @property {number} [holder_count]
 * @property {boolean} [is_name_null]
 * @property {number} [items_count]
 * @property {string} [name]
 * @property {string} [market_cap]
 * @property {string} [fiat_value]
 * @property {string} [value]
 * @property {string} [token_name]
 * @property {string} [token_type]
 */

/**
 * @typedef {Object} Token
 * @property {string} address - Contract address (0x...)
 * @property {string} name - Token name
 * @property {string} symbol - Token ticker symbol
 * @property {string} decimals - Decimal places (string format from API)
 * @property {string} holders - Total unique holder count
 * @property {string} total_supply - Raw total supply
 * @property {string|null} icon_url - Token logo url if indexed
 * @property {string|null} exchange_rate - Price in USD/Fiat from indexer
 * @property {string|null} circulating_market_cap - Market cap from indexer
 * @property {string} type - Token standard (e.g., "ERC-20")
 */

/**
 * @typedef {Object} TokenHolderAddress
 * @property {string} hash - Holder wallet or contract address
 * @property {boolean} is_contract - Whether holder is a smart contract
 * @property {string|null} name - Name tag if known
 * @property {string|null} implementation_name - Implementation name if proxy
 * @property {string[]} [public_tags]
 */

/**
 * @typedef {Object} TokenHolder
 * @property {TokenHolderAddress} address - Holder address details
 * @property {string} value - Raw balance held
 * @property {Token} token - Token metadata snapshot
 * @property {string|null} token_id - For NFTs, null for ERC-20
 */

/**
 * @typedef {Object} SearchItem
 * @property {string} address - Target contract/account address
 * @property {string} name - Search display name
 * @property {string} symbol - Token symbol
 * @property {string} type - Item category (e.g., "token", "address")
 * @property {string} token_type - Standard (e.g., "ERC-20")
 * @property {string} total_supply - Total supply
 * @property {string|null} icon_url - Icon URL
 * @property {string|null} exchange_rate - Exchange rate
 * @property {boolean} is_smart_contract_verified - Source code verification status
 */

/**
 * @typedef {Object} TokenListResponse
 * @property {Token[]} items - Array of tokens
 * @property {NextPageParams|null} next_page_params - Cursor object for next page
 */

/**
 * @typedef {Object} TokenHoldersResponse
 * @property {TokenHolder[]} items - Array of top holders
 * @property {NextPageParams|null} next_page_params - Cursor object for next page
 */

/**
 * Sleep helper for backoff delays
 * @param {number} ms 
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Robust fetch wrapper with exponential backoff for HTTP 429 and transient network errors
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @param {number} [maxRetries=4] 
 * @param {number} [baseDelayMs=1000] 
 * @returns {Promise<any>}
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 4, baseDelayMs = 1000) {
  let attempt = 0
  
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...options.headers,
        },
      })

      if (response.status === 429) {
        // Rate limited - parse Retry-After if provided or use exponential backoff with jitter
        const retryAfterHeader = response.headers.get('Retry-After')
        let delay = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : baseDelayMs * Math.pow(2, attempt) + Math.random() * 500

        console.warn(`[PulseScan API] 429 Rate Limited on ${url}. Retrying in ${Math.round(delay)}ms (Attempt ${attempt + 1}/${maxRetries})...`)
        await sleep(delay)
        attempt++
        continue
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        const error = new Error(
          `HTTP ${response.status} (${response.statusText}): ${errorText.slice(0, 200)}`,
        )
        // Carried so callers can tell "this does not exist" from "this failed".
        // An unverified contract answers 404, which is an answer.
        error.status = response.status
        throw error
      }

      return await response.json()
    } catch (err) {
      /*
       * A 4xx other than 429 is the server's final answer, so asking again four
       * more times only delays it. Unverified contracts answer 404 and are the
       * commonest case there is: retrying cost five requests and about fifteen
       * seconds of backoff to arrive at the same reply.
       */
      if (err?.status >= 400 && err.status < 500 && err.status !== 429) throw err

      if (attempt >= maxRetries) {
        console.error(`[PulseScan API] Fatal request failure after ${maxRetries} retries:`, err)
        throw err
      }

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500
      console.warn(`[PulseScan API] Network or server error (${err.message}). Retrying in ${Math.round(delay)}ms...`)
      await sleep(delay)
      attempt++
    }
  }
}

/**
 * 1. Fetch paginated list of ERC-20 / PRC-20 tokens from PulseChain
 * @param {NextPageParams|null} [nextPageParams=null] - Cursor params from previous page
 * @param {string} [type='ERC-20'] - Token standard filter
 * @returns {Promise<TokenListResponse>}
 */
export async function fetchPulseTokens(nextPageParams = null, type = 'ERC-20') {
  const url = new URL(`${PULSESCAN_BASE_URL}/tokens`)
  url.searchParams.set('type', type)

  if (nextPageParams && typeof nextPageParams === 'object') {
    Object.entries(nextPageParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  const data = await fetchWithRetry(url.toString())
  return {
    items: data.items || [],
    next_page_params: data.next_page_params || null,
  }
}

/**
 * Async Generator to easily iterate through all PulseChain tokens page by page
 * @param {string} [type='ERC-20']
 * @param {number} [maxPages=10]
 * @yields {Token[]}
 */
export async function* createTokenPaginator(type = 'ERC-20', maxPages = 10) {
  let nextParams = null
  let pageCount = 0

  do {
    const result = await fetchPulseTokens(nextParams, type)
    yield result.items
    nextParams = result.next_page_params
    pageCount++
  } while (nextParams && pageCount < maxPages)
}

/**
 * 2. Search for tokens on PulseChain by contract address, symbol, or name
 * @param {string} query - Symbol (e.g. "HEX"), Name, or 0x contract address
 * @returns {Promise<SearchItem[]>} - Array of token matches
 */
export async function searchPulseScan(query) {
  if (!query || query.trim() === '') return []

  const cleanQuery = query.trim()
  const url = `${PULSESCAN_BASE_URL}/search?q=${encodeURIComponent(cleanQuery)}`

  try {
    const data = await fetchWithRetry(url)
    if (!data || !Array.isArray(data.items)) return []

    // Filter strictly for token results
    return data.items.filter((item) => item.type === 'token')
  } catch (err) {
    console.error(`[PulseScan Search] Error searching for "${cleanQuery}":`, err)
    return []
  }
}

/**
 * 3. Fetch full individual token metadata, total supply, decimals, and holder count
 * @param {string} tokenAddress - 0x token contract address
 * @returns {Promise<Token|null>}
 */
export async function fetchTokenDetails(tokenAddress) {
  if (!tokenAddress) return null

  const cleanAddr = tokenAddress.trim()
  const url = `${PULSESCAN_BASE_URL}/tokens/${cleanAddr}`

  try {
    const data = await fetchWithRetry(url)
    return data || null
  } catch (err) {
    console.error(`[PulseScan Token Details] Failed for ${cleanAddr}:`, err)
    return null
  }
}

/**
 * 4. Fetch top holders distribution for a given token contract
 * @param {string} tokenAddress - 0x token contract address
 * @param {NextPageParams|null} [nextPageParams=null]
 * @returns {Promise<TokenHoldersResponse>}
 */
export async function fetchTokenHolders(tokenAddress, nextPageParams = null) {
  if (!tokenAddress) return { items: [], next_page_params: null }

  const cleanAddr = tokenAddress.trim()
  const url = new URL(`${PULSESCAN_BASE_URL}/tokens/${cleanAddr}/holders`)

  if (nextPageParams && typeof nextPageParams === 'object') {
    Object.entries(nextPageParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  try {
    const data = await fetchWithRetry(url.toString())
    return {
      items: data.items || [],
      next_page_params: data.next_page_params || null,
    }
  } catch (err) {
    console.error(`[PulseScan Token Holders] Failed for ${cleanAddr}:`, err)
    return { items: [], next_page_params: null }
  }
}

/**
 * Format raw token balances using their decimal value
 * @param {string|number} rawValue 
 * @param {string|number} decimals 
 * @returns {number}
 */
export function formatTokenSupply(rawValue, decimals = 18) {
  if (!rawValue) return 0
  const dec = Number(decimals || 18)
  const strVal = String(rawValue).split('.')[0] // sanitize
  
  if (strVal.length <= dec) {
    const padded = strVal.padStart(dec, '0')
    return parseFloat(`0.${padded}`)
  }
  
  const whole = strVal.slice(0, strVal.length - dec)
  const frac = strVal.slice(strVal.length - dec, strVal.length - dec + 4)
  return parseFloat(`${whole}.${frac}`)
}
