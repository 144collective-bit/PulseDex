import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, ImageOff, Loader2, UserRound, X } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { fetchPublicProfile, removeAvatar } from '../../services/profile'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { formatAddress } from '../../utils/formatters'

/**
 * One person, as far as the chat knows them.
 *
 * Opened by clicking the face beside a message. It exists because the picture,
 * the bio and the links would otherwise be write-only: somebody could fill
 * them in from Profile settings and nobody would ever be shown them, which
 * makes the whole of this feature a form that saves into a void.
 *
 * Everything here is public - it is read with the anon key that ships in the
 * bundle, the same one anybody could use directly - so there is no question of
 * this revealing something a visitor could not otherwise get. What it does is
 * put it in front of them, which is the point.
 *
 * The address is shown in full and is not optional. A handle can be changed, a
 * picture can be copied, and a chat about what to buy is a place where being
 * mistaken for somebody trusted is worth money. The address is the part that
 * cannot be borrowed.
 */
export default function ChatProfileCard({ address, canModerate, onClose, onOpenFullProfile }) {
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [removing, setRemoving] = useState(false)

  useEscapeKey(true, onClose)

  useEffect(() => {
    let active = true
    setStatus('loading')

    fetchPublicProfile(address)
      .then((found) => {
        if (!active) return
        setProfile(found)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setStatus('failed')
      })

    return () => {
      active = false
    }
  }, [address])

  const onRemovePicture = useCallback(async () => {
    /*
     * Confirmed, like blocking and unlike removing a message. This deletes
     * bytes somebody uploaded and there is no undo: the file is gone from the
     * bucket, and only they can put another one back.
     */
    const ok = window.confirm(`Remove ${formatAddress(address)}'s profile picture?`)
    if (!ok) return

    setError(null)
    setRemoving(true)
    try {
      await removeAvatar(address)
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev))
    } catch (err) {
      setError(err.message)
    } finally {
      setRemoving(false)
    }
  }, [address])

  return (
    /*
     * The backdrop closes on click, and the card stops the click from reaching
     * it - which is why the handler is here rather than on a transparent
     * sibling. Not a keyboard control: Escape is what closes this without a
     * mouse, and a clickable div in the tab order would be a stop that reads
     * as nothing.
     */
    <div className="chat-profile-backdrop" onClick={onClose}>
      <div
        className="chat-profile-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Profile for ${profile?.handle || formatAddress(address)}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="chat-profile-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>

        {status === 'loading' ? (
          <p className="chat-profile-note">
            <Loader2 size={14} className="chat-spin" />
            Loading
          </p>
        ) : (
          <>
            <div className="chat-profile-head">
              <ChatAvatar
                address={address}
                avatarUrl={profile?.avatarUrl}
                avatarId={profile?.avatarId}
                size={64}
              />

              <div className="chat-profile-names">
                <p className="chat-profile-handle">
                  {profile?.handle || formatAddress(address)}
                </p>
                {/* Selectable, and monospaced, because the reason to show it
                    is so somebody can compare it with one they already have. */}
                <p className="chat-profile-address font-mono">{address}</p>
              </div>
            </div>

            {profile?.bio && <p className="chat-profile-bio">{profile.bio}</p>}

            {profile?.links?.length > 0 && (
              <ul className="chat-profile-links">
                {profile.links.map((link) => (
                  <li key={link.url}>
                    {/*
                     * The host is the label, always, because it is the part
                     * that decides where the click lands. Letting an account
                     * supply its own text is how a link reading "pulsex.com"
                     * goes somewhere that is not pulsex.com.
                     *
                     * noopener because the opened page can otherwise reach
                     * back through window.opener and navigate this one;
                     * noreferrer because a stranger's link does not need to be
                     * told which room its reader came from.
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

            {/* Said out loud rather than left to be inferred from an empty
                card, which reads as something failing to load. */}
            {!profile?.bio && !profile?.links?.length && (
              <p className="chat-profile-note">Nothing else here yet.</p>
            )}

            <p className="chat-profile-warning">
              <AlertTriangle size={11} />
              Anyone can write anything here. Check the address, not the name.
            </p>

            {/*
              The card is a glance - who is this, without losing your place in
              the room. Everything they have written lives on the page behind
              this button, which is a navigation away from the conversation
              and therefore something to choose rather than something that
              happens on a click.
            */}
            {onOpenFullProfile && (
              <button
                type="button"
                className="chat-profile-open font-mono"
                onClick={() => {
                  onClose()
                  onOpenFullProfile({ address, handle: profile?.handle || null })
                }}
              >
                <UserRound size={11} />
                View full profile
              </button>
            )}

            {canModerate && profile?.avatarUrl && (
              <button
                type="button"
                className="chat-profile-moderate font-mono"
                onClick={onRemovePicture}
                disabled={removing}
              >
                {removing ? <Loader2 size={11} className="chat-spin" /> : <ImageOff size={11} />}
                {removing ? 'Removing' : 'Remove picture'}
              </button>
            )}
          </>
        )}

        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
