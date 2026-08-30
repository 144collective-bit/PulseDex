import { useState, useEffect } from 'react'
import { getTokenLogoUrl, TOKEN_LOGO_MAP } from '../utils/tokenLogos'
import { plsfolioLogoUrl } from '../utils/plsfolioLogos'

export default function TokenLogo({
  symbol = 'PLS',
  address = '',
  customUrl = null,
  size = 24,
  className = '',
}) {
  const [attemptIndex, setAttemptIndex] = useState(0)
  const [sources, setSources] = useState([])
  const [hasError, setHasError] = useState(false)

  // Build ordered candidate sources list whenever inputs change
  useEffect(() => {
    const cleanSym = (symbol || 'PLS').toUpperCase().trim()
    const cleanAddr = (address || '').toLowerCase().trim()
    const candidates = []

    // 1. Custom URL (DexScreener pair image)
    if (customUrl && typeof customUrl === 'string' && (customUrl.startsWith('http://') || customUrl.startsWith('https://'))) {
      candidates.push(customUrl)
    }

    // 2. Verified Local / Curated asset by address
    if (cleanAddr && TOKEN_LOGO_MAP[cleanAddr] && !candidates.includes(TOKEN_LOGO_MAP[cleanAddr])) {
      candidates.push(TOKEN_LOGO_MAP[cleanAddr])
    }

    // 3. Verified Local / Curated asset by symbol
    if (cleanSym && TOKEN_LOGO_MAP[cleanSym] && !candidates.includes(TOKEN_LOGO_MAP[cleanSym])) {
      candidates.push(TOKEN_LOGO_MAP[cleanSym])
    }

    // 4. DexScreener PulseChain token CDN
    if (cleanAddr && cleanAddr.startsWith('0x') && cleanAddr.length === 42) {
      const dsUrl = `https://dd.dexscreener.com/ds-data/tokens/pulsechain/${cleanAddr}.png`
      if (!candidates.includes(dsUrl)) candidates.push(dsUrl)
    }

    // 5. Curated PulseChain artwork, by address.
    //
    //    Sits after DexScreener so tokens that already show correctly are left
    //    alone, and before TrustWallet, which only knows bridged Ethereum
    //    assets and misses almost everything native to this chain. Address-keyed
    //    only - symbols are not unique here.
    const pfUrl = plsfolioLogoUrl(cleanAddr)
    if (pfUrl && !candidates.includes(pfUrl)) candidates.push(pfUrl)

    // 6. TrustWallet Ethereum bridged asset
    if (cleanAddr && cleanAddr.startsWith('0x') && cleanAddr.length === 42) {
      const twUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${cleanAddr}/logo.png`
      if (!candidates.includes(twUrl)) candidates.push(twUrl)
    }

    setSources(candidates)
    setAttemptIndex(0)
    setHasError(candidates.length === 0)
  }, [symbol, address, customUrl])

  const handleError = () => {
    if (attemptIndex + 1 < sources.length) {
      setAttemptIndex((prev) => prev + 1)
    } else {
      setHasError(true)
    }
  }

  const currentSrc = sources[attemptIndex]
  const cleanSym = (symbol || 'PLS').toUpperCase().trim()
  const displayLetters = cleanSym.slice(0, 3)

  // Gradient background palette for initials fallback
  const getGradient = (str) => {
    const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const gradients = [
      'linear-gradient(135deg, #00ff9d 0%, #00c97b 100%)',
      'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
      'linear-gradient(135deg, #00e5ff 0%, #3b82f6 100%)',
      'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    ]
    return gradients[hash % gradients.length]
  }

  if (currentSrc && !hasError) {
    return (
      <img
        src={currentSrc}
        alt={`${symbol} logo`}
        className={`token-logo-img ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'block',
          flexShrink: 0,
        }}
        onError={handleError}
        loading="lazy"
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`token-logo-fallback ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: '50%',
        background: getGradient(cleanSym),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#000000',
        fontWeight: '800',
        fontSize: `${Math.max(8, Math.floor(size * 0.38))}px`,
        letterSpacing: '-0.5px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {displayLetters}
    </div>
  )
}
