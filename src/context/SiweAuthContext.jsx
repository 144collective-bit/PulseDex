import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAccount, useConnect, useSignMessage } from 'wagmi'
import { buildSiweMessage } from '../utils/siwe'

const SiweAuthContext = createContext(null)

/** How far through sign-in we are, so the button can say something useful. */
export const AUTH_STATUS = {
  loading: 'loading',
  signedOut: 'signedOut',
  connecting: 'connecting',
  signing: 'signing',
  verifying: 'verifying',
  signedIn: 'signedIn',
}

/**
 * Wallet sign-in.
 *
 * The wallet is the identity: no password to lose, leak or reset. Signing is
 * free and is not a transaction - it proves control of an address and nothing
 * more. The app never sees a private key and cannot move funds; connecting is
 * read-only, exactly as the portfolio tracker already is.
 *
 * The session itself lives in an httpOnly cookie the server sets, so no script
 * on the page - ours or anyone else's - can read it.
 */
export function SiweAuthProvider({ children }) {
  const { address, isConnected } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState(AUTH_STATUS.loading)
  const [account, setAccount] = useState(null)
  const [error, setError] = useState(null)

  // Restore an existing session on load.
  useEffect(() => {
    let cancelled = false

    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { address: null }))
      .then((data) => {
        if (cancelled) return
        setAccount(data.address || null)
        setStatus(data.address ? AUTH_STATUS.signedIn : AUTH_STATUS.signedOut)
      })
      .catch(() => {
        if (!cancelled) setStatus(AUTH_STATUS.signedOut)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async () => {
    setError(null)

    try {
      let active = address

      if (!isConnected || !active) {
        setStatus(AUTH_STATUS.connecting)
        // Every discovered wallet is tried, not just the first: a non-dominant
        // extension would otherwise throw ProviderNotFoundError.
        let connected = null
        for (const connector of connectors) {
          try {
            connected = await connectAsync({ connector })
            break
          } catch {
            continue
          }
        }
        active = connected?.accounts?.[0]
        if (!active) throw new Error('No wallet connected.')
      }

      setStatus(AUTH_STATUS.signing)

      const res = await fetch('/api/auth/nonce', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Could not start sign-in.')
      const { nonce } = await res.json()

      const now = new Date()
      const message = buildSiweMessage({
        domain: window.location.host,
        address: active,
        uri: window.location.origin,
        nonce,
        issuedAt: now.toISOString(),
        expirationTime: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      })

      const signature = await signMessageAsync({ message, account: active })

      setStatus(AUTH_STATUS.verifying)

      const verified = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message, signature }),
      })

      const data = await verified.json().catch(() => ({}))
      if (!verified.ok) throw new Error(data.error || 'Could not verify signature.')

      setAccount(data.address)
      setStatus(AUTH_STATUS.signedIn)
      return data.address
    } catch (err) {
      // A rejected signature is a decision, not a failure worth shouting about.
      const rejected = /reject|denied|cancel/i.test(err?.message || '')
      setError(rejected ? null : err?.message || 'Sign-in failed.')
      setStatus(AUTH_STATUS.signedOut)
      return null
    }
  }, [address, isConnected, connectAsync, connectors, signMessageAsync])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {})
    setAccount(null)
    setError(null)
    setStatus(AUTH_STATUS.signedOut)
  }, [])

  return (
    <SiweAuthContext.Provider
      value={{
        status,
        account,
        error,
        signIn,
        signOut,
        isSignedIn: status === AUTH_STATUS.signedIn,
        isBusy: [
          AUTH_STATUS.connecting,
          AUTH_STATUS.signing,
          AUTH_STATUS.verifying,
        ].includes(status),
      }}
    >
      {children}
    </SiweAuthContext.Provider>
  )
}

export function useSiweAuth() {
  const ctx = useContext(SiweAuthContext)
  if (!ctx) throw new Error('useSiweAuth must be used inside SiweAuthProvider')
  return ctx
}
