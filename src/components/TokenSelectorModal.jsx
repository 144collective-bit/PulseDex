import { useState } from 'react'
import { X, Search, Check, Coins } from 'lucide-react'
import TokenLogo from './TokenLogo'

export default function TokenSelectorModal({
  isOpen,
  onClose,
  tokens = [],
  selectedToken,
  onSelectToken,
  chainName = 'Network',
}) {
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const filteredTokens = tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.address && t.address.toLowerCase().includes(search.toLowerCase()))
  )

  const handleQuickSelect = (token) => {
    onSelectToken(token)
    onClose()
  }

  return (
    <div className="modal-backdrop-overlay" onClick={onClose}>
      <div
        className="modal-container token-modal-container glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-pulse-green" />
            <h3 className="modal-title font-mono">Select Token ({chainName})</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="token-search-box">
          <Search size={15} className="search-icon text-muted" />
          <input
            type="text"
            placeholder="Search symbol, token name or 0x address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="token-search-input font-mono"
            autoFocus
          />
        </div>

        {/* Quick Chips */}
        <div className="token-quick-chips font-mono">
          {tokens.slice(0, 4).map((tok) => (
            <button
              key={tok.symbol}
              type="button"
              className={`token-quick-chip ${
                selectedToken?.symbol === tok.symbol ? 'active' : ''
              }`}
              onClick={() => handleQuickSelect(tok)}
            >
              <TokenLogo symbol={tok.symbol} address={tok.address} customUrl={tok.icon} size={16} />
              <span>{tok.symbol}</span>
            </button>
          ))}
        </div>

        {/* Token List */}
        <div className="token-list-wrapper">
          {filteredTokens.map((tok) => {
            const isSelected = selectedToken?.symbol === tok.symbol

            return (
              <button
                key={`${tok.symbol}-${tok.address || 'native'}`}
                type="button"
                className={`token-select-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleQuickSelect(tok)}
              >
                <div className="token-item-left">
                  <TokenLogo
                    symbol={tok.symbol}
                    address={tok.address}
                    customUrl={tok.icon}
                    size={32}
                  />
                  <div className="token-name-col text-left">
                    <div className="token-sym-row font-mono flex items-center gap-2">
                      <span className="token-sym-text font-bold text-white">{tok.symbol}</span>
                      {tok.isStable && (
                        <span className="badge badge-pulse text-[9px]">Stable</span>
                      )}
                    </div>
                    <span className="token-name-text text-muted text-xs font-mono truncate">
                      {tok.name}
                    </span>
                  </div>
                </div>

                <div className="token-item-right font-mono text-right">
                  {tok.address && tok.address !== '0x0000000000000000000000000000000000000000' && !tok.isNative ? (
                    <span className="token-addr-preview text-muted text-[10px]">
                      {tok.address.slice(0, 6)}...{tok.address.slice(-4)}
                    </span>
                  ) : (
                    <span className="badge badge-green text-[9px]">Native / Gas</span>
                  )}
                  {isSelected && (
                    <div className="mt-1 flex justify-end">
                      <Check size={14} className="text-pulse-green" />
                    </div>
                  )}
                </div>
              </button>
            )
          })}

          {filteredTokens.length === 0 && (
            <div className="p-6 text-center text-muted font-mono text-xs">
              No tokens found for &quot;{search}&quot;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
