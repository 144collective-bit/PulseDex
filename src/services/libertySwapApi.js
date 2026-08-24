import { LIBERTY_API_BASE, isRouterWhitelisted } from '../config/libertySwap'

/**
 * Service to interact with the Liberty Swap API (v1)
 */

/**
 * Fetches a cross-chain quote from the Liberty Swap API
 * @param {Object} params
 * @param {string} params.srcToken Token symbol or identifier (e.g. 'USDC', 'ETH', 'WETH')
 * @param {string} params.dstToken Token symbol or identifier (e.g. 'USDC', 'ETH', 'WETH')
 * @param {string} params.amount Amount in lowest units (wei string)
 * @param {number} params.srcChain Source chain ID (e.g. 1, 369, 8453, 56, 137, 42161)
 * @param {number} params.dstChain Destination chain ID
 * @param {string} params.recipient Connected user address
 * @param {number} [params.recipientType=0] 0 for standard EVM recipient
 * @param {AbortSignal} [signal] Optional abort signal for debouncing
 */
export async function fetchLibertyQuote({
  srcToken,
  dstToken,
  amount,
  srcChain,
  dstChain,
  recipient,
  recipientType = 0,
  signal,
}) {
  if (!srcToken || !dstToken || !amount || !srcChain || !dstChain) {
    throw new Error('Missing required swap parameters for quote')
  }

  const cleanRecipient =
    recipient && recipient.startsWith('0x') && recipient.length === 42
      ? recipient
      : '0x0000000000000000000000000000000000000001'

  const query = new URLSearchParams({
    srcToken: srcToken.toUpperCase(),
    dstToken: dstToken.toUpperCase(),
    amount: amount.toString(),
    srcChain: srcChain.toString(),
    dstChain: dstChain.toString(),
    recipient: cleanRecipient,
    recipientType: recipientType.toString(),
  })

  const url = `${LIBERTY_API_BASE}/v1/quote?${query.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    let errorMsg = `Liberty Swap Quote Error (${response.status})`
    try {
      const errJson = await response.json()
      if (errJson.message) errorMsg = errJson.message
      else if (errJson.error) errorMsg = errJson.error
      else if (errJson.detail) errorMsg = errJson.detail
    } catch {
      // fallback to status text
      if (response.statusText) errorMsg = response.statusText
    }
    throw new Error(errorMsg)
  }

  const data = await response.json()

  // Parse fields robustly
  const routerAddress = data.to || data.routerAddress || data.target || ''
  const isWhitelisted = isRouterWhitelisted(routerAddress)

  return {
    raw: data,
    to: routerAddress,
    isWhitelisted,
    destAmount: data.destAmount || data.destinationAmount || data.amountOut || data.outputAmount || '0',
    destAmountFormatted: data.destAmountFormatted || data.outputAmountFormatted || null,
    srcAmount: data.srcAmount || data.sourceAmount || data.amountIn || amount,
    fee: {
      percentage: data.fee?.percentage || data.feePercentage || data.feePercent || '0.2',
      amount: data.fee?.amount || data.feeAmount || '0',
      token: data.fee?.token || srcToken,
      networkFee: data.fee?.networkFee || data.gasEstimate || null,
    },
    estimatedTime: data.estimatedTime || data.executionTime || '2-5 mins',
    methodParameters: {
      calldata: data.methodParameters?.calldata || data.calldata || data.data || '0x',
      value: data.methodParameters?.value || data.value || '0',
      to: routerAddress,
    },
    priceImpact: data.priceImpact || '0.01%',
    route: data.route || data.path || [],
    rate: data.rate || data.exchangeRate || null,
  }
}
