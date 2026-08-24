import { useState } from 'react'
import { X, Search, Check, Globe } from 'lucide-react'
import { SUPPORTED_CHAINS } from '../config/libertySwap'

export default function ChainSelectorModal({
  isOpen,
  onClose,
  selectedChainId,
  onSelectChain,
  title = 'Select Network',
  disabledChainId = null,
}) {
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const filteredChains = SUPPORTED_CHAINS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.shortName.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="modal-backdrop-overlay" onClick={onClose}>
      <div
        className="modal-container chain-modal-container glass-panel animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-pulse-cyan" />
            <h3 className="modal-title font-mono">{title}</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="chain-search-box">
          <Search size={15} className="search-icon text-muted" />
          <input
            type="text"
            placeholder="Search network name or chain ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="chain-search-input font-mono"
            autoFocus
          />
        </div>

        {/* Chain List */}
        <div className="chain-list-wrapper">
          {filteredChains.map((chain) => {
            const isSelected = chain.id === selectedChainId
            const isDisabled = chain.id === disabledChainId

            return (
              <button
                key={chain.id}
                type="button"
                disabled={isDisabled}
                className={`chain-select-item ${isSelected ? 'selected' : ''} ${
                  isDisabled ? 'disabled opacity-40 cursor-not-allowed' : ''
                }`}
                onClick={() => {
                  if (!isDisabled) {
                    onSelectChain(chain)
                    onClose()
                  }
                }}
              >
                <div className="chain-item-left">
                  <div
                    className="chain-icon-wrap"
                    style={{
                      borderColor: isSelected ? chain.color : 'rgba(255,255,255,0.1)',
                      boxShadow: isSelected ? `0 0 12px ${chain.color}44` : 'none',
                    }}
                  >
                    <img
                      src={chain.icon}
                      alt={chain.name}
                      className="chain-icon-img"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                  <div className="chain-name-group text-left">
                    <div className="chain-main-name font-mono flex items-center gap-1.5">
                      <span>{chain.name}</span>
                      {chain.id === 369 && (
                        <span className="badge badge-green text-[10px]">Native</span>
                      )}
                    </div>
                    <span className="chain-sub-meta font-mono text-muted text-xs">
                      Chain ID: {chain.id} • {chain.symbol}
                    </span>
                  </div>
                </div>

                <div className="chain-item-right">
                  {isSelected && (
                    <span className="chain-check-badge">
                      <Check size={14} className="text-pulse-green" />
                    </span>
                  )}
                  {isDisabled && (
                    <span className="text-[11px] font-mono text-muted">Same as Source</span>
                  )}
                </div>
              </button>
            )
          })}

          {filteredChains.length === 0 && (
            <div className="p-6 text-center text-muted font-mono text-xs">
              No networks found matching &quot;{search}&quot;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
