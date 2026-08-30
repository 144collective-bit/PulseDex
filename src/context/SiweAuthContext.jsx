import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAccount, useConnect, useSignMessage, useConfig } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { buildSiweMessage } from '../utils/siwe'

const SiweAuthContext = createContext(null)

/** The wallet prompt was dismissed, rather than anything going wrong. */
const isRejection = (err) =>
  err?.code === 4001 ||
  err?.cause?.code === 4001 ||
  /user rejected|user denied|rejected the request|cancell?ed/i.test(err?.message || '')

/** wagmi refuses a connect call when that connector already holds a session. */
const isAlreadyConnected = (err) =>
  err?.name === 'ConnectorAlreadyConnectedError' ||
  /already connected/i.test(err?.message || '')

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
  const { address } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { signMessageAsync } = useSignMessage()
  const config = useConfig()

  const [status, setStatus] = useState(AUTH_STATUS.loading)
  const [account, setAccount] = useState(null)
  const [error, setError] = useState(null)

  /**
   * Restore the session on load, and re-check it when the tab comes back.
   *
   * Read once at mount, the UI kept claiming a signed-in account long after
   * the server had stopped agreeing - a session expiring on its seven-day
   * clock, a sign-out in another tab, or a rotated secret all leave the button
   * showing an address that no longer authenticates anything. Harmless while
   * nothing server-backed depends on it, and actively misleading the moment
   * something does.
   */
  useEffect(() => {
    let cancelled = false

    const sync = ({ initial = false } = {}) => {
      fetch('/api/auth/me', { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json() : { address: null }))
        .then((data) => {
          if (cancelled) return
          const next = data.address || null
          // Never overwrite a sign-in that is mid-flight.
          setStatus((current) =>
            [AUTH_STATUS.connecting, AUTH_STATUS.signing, AUTH_STATUS.verifying].includes(current)
              ? current
              : next
                ? AUTH_STATUS.signedIn
                : AUTH_STATUS.signedOut
          )
          setAccount((current) => (current === next ? current : next))
        })
        .catch(() => {
          // A failed check is not proof of being signed out; leave state alone
          // unless this is the first read, where signed-out is the safe start.
          if (!cancelled && initial) setStatus(AUTH_STATUS.signedOut)
        })
    }

    sync({ initial: true })

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  const signIn = useCallback(async () => {
    setError(null)

    try {
      // An existing connection is authoritative. Reading it from the store
      // rather than the hook avoids a re-connect while the hook value is still
      // catching up - which used to make wagmi refuse every connector and
      // report "no wallet connected" with a wallet plainly connected.
      let active = address || getAccount(config)?.address

      if (!active) {
        setStatus(AUTH_STATUS.connecting)

        /*
         * Only offer connectors whose provider actually resolves. The config
         * declares targets for Rabby, MetaMask, Internet Money and ZKX; for
         * someone running just one of them the rest resolve to nothing and
         * throw instantly, which previously burned through the list and ended
         * in a misleading error.
         */
        const available = []
        for (const connector of connectors) {
          const provider = await connector.getProvider().catch(() => undefined)
          if (provider) available.push(connector)
        }

        if (!available.length) {
          throw new Error(
            'No wallet extension detected. Install Rabby, MetaMask, Internet Money or ZKX, then try again.'
          )
        }

        for (const connector of available) {
          try {
            const result = await connectAsync({ connector })
            active = result?.accounts?.[0]
            if (active) break
          } catch (err) {
            // Declining is an answer. Trying the next connector would prompt
            // again, up to once per installed wallet.
            if (isRejection(err)) throw err
            if (isAlreadyConnected(err)) {
              active = getAccount(config)?.address
              if (active) break
            }
            continue
          }
        }

        if (!active) {
          throw new Error('Could not connect to your wallet. Please unlock it and try again.')
        }
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
      // Declining the wallet prompt is a decision, not a failure worth
      // shouting about - the button simply returns to its resting state.
      setError(isRejection(err) ? null : err?.message || 'Sign-in failed.')
      setStatus(AUTH_STATUS.signedOut)
      return null
    }
  }, [address, config, connectAsync, connectors, signMessageAsync])

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
