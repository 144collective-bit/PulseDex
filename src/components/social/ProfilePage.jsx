import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import FeedPanel from './FeedPanel'
import XLink from './XLink'
import { fetchPublicProfile, fetchProfileByHandle, removeAvatar } from '../../services/profile'
import { useIsModerator } from '../../hooks/useIsModerator'
import { formatAddress } from '../../utils/formatters'

/**
 * Somebody's page: who they are, and everything they have posted.
 *
 * This is what the feature is for. A chat gives you a name beside a line of
 * text; this is the thing a name can lead somewhere, which is the difference
 * between a room and a place people have accounts on.
 *
 * Reachable at /u/@handle or /u/0x..., and it resolves whichever it is given.
 * Both spellings exist deliberately: the handle is what anyone would paste
 * into a conversation, and the address is what still works after they change
 * it.
 *
 * Read entirely over the anon key. Nothing here is behind a sign-in, because
 * nothing here is private - a profile that only members could see would be a
 * profile nobody discovers.
 */
export default function ProfilePage({ route, onOpenProfile, onClose }) {
  const isModerator = useIsModerator()

  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const { address, handle } = route

  useEffect(() => {
    let active = true
    setStatus('loading')
    setProfile(null)

    const lookup = handle ? fetchProfileByHandle(handle) : fetchPublicProfile(address)

    lookup
      .then((found) => {
        if (!active) return
        setProfile(found)
        setStatus(found ? 'ready' : 'missing')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setStatus('failed')
      })

    return () => {
      active = false
    }
  }, [address, handle])

  const onRemovePicture = useCallback(async () => {
    if (!profile) return
    const ok = window.confirm(`Remove ${formatAddress(profile.address)}'s profile picture?`)
    if (!ok) return

    setError(null)
    try {
      await removeAvatar(profile.address)
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev))
    } catch (err) {
      setError(err.message)
    }
  }, [profile])

  /*
   * An address-spelled URL for somebody with no profile row still shows a
   * page, because the address is real whether or not they have filled anything
   * in - and anyone who has posted has a row anyway. A handle that matches
   * nobody is different: there is no address to fall back to, so there is
   * genuinely nothing to show.
   */
  const shown = profile || (address ? { address, handle: null, links: [] } : null)

  if (status === 'loading') {
    return (
      <Frame onClose={onClose}>
        <p className="chat-notice">
          <Loader2 size={15} className="chat-spin" />
          <span>Loading profile</span>
        </p>
      </Frame>
    )
  }

  if (status === 'failed' || !shown) {
    return (
      <Frame onClose={onClose}>
        <p className="chat-notice">
          <AlertTriangle size={15} />
          <span>{error || `Nobody here goes by @${handle}.`}</span>
        </p>
      </Frame>
    )
  }

  return (
    <Frame onClose={onClose}>
      <header className="profile-public-head">
        <ChatAvatar
          address={shown.address}
          avatarUrl={shown.avatarUrl}
          avatarId={shown.avatarId}
          size={72}
        />

        <div className="profile-public-names">
          <h1 className="profile-public-handle">
            {shown.handle || formatAddress(shown.address)}
          </h1>
          {/* Selectable and shown in full, because the reason to show it is so
              somebody can compare it against one they already have. Half an
              address with an ellipsis is exactly as forgeable as a name. */}
          <p className="profile-public-address font-mono">{shown.address}</p>

          {shown.bio && <p className="profile-public-bio">{shown.bio}</p>}

          {/* Above the links, because a proven handle is a stronger claim than
              anything somebody typed into a URL box themselves. */}
          <XLink x={shown.x} />

          {shown.links?.length > 0 && (
            <ul className="chat-profile-links">
              {shown.links.map((link) => (
                <li key={link.url}>
                  {/*
                   * The host is the label, always. Letting an account supply
                   * its own text is how a link reading "pulsex.com" arrives
                   * somewhere that is not pulsex.com - and on a site about
                   * which tokens to buy, that is the whole game.
                   *
                   * noopener because the opened page can otherwise reach back
                   * through window.opener and navigate this one; noreferrer
                   * because a stranger's link does not need to be told which
                   * profile its reader came from.
                   */}
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="chat-profile-link font-mono"
                  >
                    <ExternalLink size={11} />
                    {link.host}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="chat-profile-warning">
            <AlertTriangle size={11} />
            Anyone can write anything here. Check the address, not the name.
          </p>

          {isModerator && shown.avatarUrl && (
            <button type="button" className="chat-profile-moderate font-mono" onClick={onRemovePicture}>
              <ImageOff size={11} />
              Remove picture
            </button>
          )}

          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </header>

      <FeedPanel author={shown.address} onOpenProfile={onOpenProfile} />
    </Frame>
  )
}

/** The page around it, including the way back. Somebody who arrived on a
 *  pasted link has no history to go back through, so this is a link home
 *  rather than a call to history.back(). */
function Frame({ onClose, children }) {
  return (
    <div className="social-view profile-public">
      <button type="button" className="chat-older font-mono profile-public-back" onClick={onClose}>
        <ArrowLeft size={12} />
        Back to PulseDex
      </button>
      {children}
    </div>
  )
}
