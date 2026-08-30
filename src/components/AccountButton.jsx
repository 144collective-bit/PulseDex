import { useEffect, useRef, useState } from 'react'
import { User, LogOut, Loader2, Copy, Check, ExternalLink, IdCard } from 'lucide-react'
import { useSiweAuth, AUTH_STATUS } from '../context/SiweAuthContext'
import { formatAddress } from '../utils/formatters'
import { avatarAccent } from '../utils/tokenImage'
import '../styles/account.css'

const LABEL = {
  [AUTH_STATUS.connecting]: 'Connecting…',
  [AUTH_STATUS.signing]: 'Check wallet…',
  [AUTH_STATUS.verifying]: 'Verifying…',
}

/**
 * The single account control in the header.
 *
 * Signed out it invites sign-in; signed in it becomes the identity and the way
 * into the profile. One button either way, because a header that offers both
 * "sign in" and "profile" is asking the user to work out which one they are.
 */
export default function AccountButton({ onOpenProfile }) {
  const { status, account, error, signIn, signOut, isBusy } = useSiweAuth()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copy = () => {
    if (!account) return
    navigator.clipboard.writeText(account)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (status === AUTH_STATUS.loading) {
    return <div className="account-btn is-placeholder" aria-hidden="true" />
  }

  if (!account) {
    return (
      <div className="account-wrap" ref={ref}>
        <button
          type="button"
          className="account-btn is-signin"
          onClick={signIn}
          disabled={isBusy}
        >
          {isBusy ? <Loader2 size={15} className="dex-spin" /> : <User size={15} />}
          <span>{LABEL[status] || 'Sign in'}</span>
        </button>
        {error && <span className="account-error">{error}</span>}
      </div>
    )
  }

  // avatarAccent returns one of six brand hex colours, not a hue angle - the
  // avatar is built from that colour directly rather than through hsl().
  const accent = avatarAccent(account)

  return (
    <div className="account-wrap" ref={ref}>
      <button
        type="button"
        className={`account-btn is-account ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {/* Derived from the address, so an account is recognisable at a glance
            before anyone has chosen a picture. */}
        <span
          className="account-avatar"
          style={{ '--avatar-accent': accent }}
          aria-hidden="true"
        />
        <span className="account-label">{formatAddress(account)}</span>
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <div className="account-menu-head">
            <span
              className="account-avatar is-lg"
              style={{ '--avatar-accent': accent }}
              aria-hidden="true"
            />
            <span className="account-menu-ident">
              <span className="account-menu-name">{formatAddress(account, 6, 4)}</span>
              <span className="account-menu-sub">Signed in with wallet</span>
            </span>
          </div>

          <button type="button" className="account-menu-item" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Address copied' : 'Copy address'}</span>
          </button>

          <button
            type="button"
            className="account-menu-item"
            onClick={() => {
              setOpen(false)
              onOpenProfile?.()
            }}
          >
            <IdCard size={14} />
            <span>Profile</span>
          </button>

          <a
            className="account-menu-item"
            href={`https://scan.pulsechain.com/address/${account}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
            <span>View on PulseScan</span>
          </a>

          <button
            type="button"
            className="account-menu-item is-danger"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}
