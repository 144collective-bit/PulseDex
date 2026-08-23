// Verified PulseChain & EVM Token Logo Map with local assets & verified CDNs
export const TOKEN_LOGO_MAP = {
  // WPLS / PLS
  'PLS': '/tokens/pls.png',
  'WPLS': '/tokens/wpls.png',
  '0xa1077a294dde1b09bb078844df40758a5d0f9a27': '/tokens/wpls.png',

  // PLSX (PulseX)
  'PLSX': '/tokens/plsx.png',
  '0x8a810ea8b121d08342e9e7696f4a9915cbe494b7': '/tokens/plsx.png',
  '0x95b303987a60c71504d99aa1b13b4da07b0790ab': '/tokens/plsx.png',

  // HEX (PulseChain native)
  'HEX': '/tokens/hex.png',
  '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39': '/tokens/hex.png',

  // eHEX / HEX from Ethereum
  'EHEX': '/tokens/ehex.png',
  '0x57fde0a71132198bbec939b98976993d8d89d225': '/tokens/ehex.png',

  // INC (Incentive Token)
  'INC': '/tokens/inc.png',
  '0x2fa807748803010e623e789542345de171cac391': '/tokens/inc.png',

  // HDRN (Hedron)
  'HDRN': '/tokens/hdrn.svg',
  'HEDRON': '/tokens/hdrn.svg',
  '0x3819f64f282bf135d62168c1e513280daf905e06': '/tokens/hdrn.svg',

  // DAI (from Ethereum & native)
  'DAI': '/tokens/dai.png',
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': '/tokens/dai.png',
  '0x6b175474e89094c44da98b954eedeac495271d0f': '/tokens/dai.png',

  // USDC (from Ethereum & bridged)
  'USDC': '/tokens/usdc.png',
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': '/tokens/usdc.png',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '/tokens/usdc.png',

  // USDT (Tether)
  'USDT': '/tokens/usdt.png',
  '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f': '/tokens/usdt.png',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': '/tokens/usdt.png',

  // WETH / ETH
  'WETH': '/tokens/weth.png',
  'ETH': '/tokens/weth.png',
  '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c': '/tokens/weth.png',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '/tokens/weth.png',

  // WBTC / BTC
  'WBTC': '/tokens/wbtc.png',
  'BTC': '/tokens/wbtc.png',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': '/tokens/wbtc.png',
  '0xb2ac3c79a96a1f24e23b1b50394269d4d2831556': '/tokens/wbtc.png',

  // MAXI
  'MAXI': '/tokens/maxi.svg',
  '0x0d86eb9f43c57f6ff3bc9e23d86e923b96fe30ac': '/tokens/maxi.svg',

  // TEXAN
  'TEXAN': '/tokens/texan.svg',
  '0x5e5c86d4e8c1f30f6d4ef74ce476cfb48d2a1f67': '/tokens/texan.svg',

  // LINK
  'LINK': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',

  // PEPE
  'PEPE': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png',

  // SHIB
  'SHIB': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png',

  // 9MM
  '9MM': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x1539c6dd634f44d1611263aa2388edc392f322f4.png',
  '0x1539c6dd634f44d1611263aa2388edc392f322f4': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x1539c6dd634f44d1611263aa2388edc392f322f4.png',

  // 9INCH
  '9INCH': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x1406437d2f9547d25e8fd848ccbdc31c81ef40d4.png',
  '0x1406437d2f9547d25e8fd848ccbdc31c81ef40d4': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x1406437d2f9547d25e8fd848ccbdc31c81ef40d4.png',

  // ATROPA
  'ATROPA': '/tokens/atropa.png',
  '0xcc78a0acdf847a2c1714d2a925bb4477df5d48a6': '/tokens/atropa.png',

  // CST / Coast USD
  'CST': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x45a90e3eb4c0b62e49c71987ba42a49f50f4439c.png',

  // LOAN
  'LOAN': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x9180766d4be89f1da6b7b72f8354a0b21a8d0fd7.png',

  // TONI
  'TONI': 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0x2c4e61625f231f496152a514dffbb7d00fca8fb4.png',
}

/**
 * Resolves the primary logo URL for any token on PulseChain with intelligent multi-source fallback
 */
export function getTokenLogoUrl(symbol = '', address = '', customUrl = null) {
  const cleanSym = (symbol || '').toUpperCase().trim()
  const cleanAddr = (address || '').toLowerCase().trim()

  // 1. If customUrl is provided and is a valid HTTP URL, use it (custom pair artwork from DexScreener)
  if (customUrl && typeof customUrl === 'string' && (customUrl.startsWith('http://') || customUrl.startsWith('https://'))) {
    return customUrl
  }

  // 2. Check local / curated verified asset map by contract address
  if (cleanAddr && TOKEN_LOGO_MAP[cleanAddr]) {
    return TOKEN_LOGO_MAP[cleanAddr]
  }

  // 3. Check local / curated verified asset map by symbol
  if (cleanSym && TOKEN_LOGO_MAP[cleanSym]) {
    return TOKEN_LOGO_MAP[cleanSym]
  }

  // 4. Fallback to DexScreener token CDN by contract address
  if (cleanAddr && cleanAddr.startsWith('0x') && cleanAddr.length === 42) {
    return `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${cleanAddr}.png`
  }

  return null
}
