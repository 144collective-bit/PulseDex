import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink, ImageOff, Loader2, Settings2, CalendarDays, PenLine } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import FeedPanel from './FeedPanel'
import { fetchPublicProfile, fetchProfileByHandle, removeAvatar } from '../../services/profile'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { fetchPostCount } from '../../services/posts'
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
export default function ProfilePage({ route, onOpenProfile, onClose, onEditProfile }) {
  const isModerator = useIsModerator()
  const { account } = useSiweAuth()

  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [postCount, setPostCount] = useState(null)

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

  /*
   * The post count, asked for separately and by address.
   *
   * It cannot ride along with the profile row - a count of one table filtered
   * by a column in another is not something the profile query can answer - and
   * it is not worth blocking the page on. So it arrives when it arrives, and
   * the number simply appears.
   */
  const shownAddress = profile?.address || address
  useEffect(() => {
    if (!shownAddress) return undefined

    let active = true
    fetchPostCount(shownAddress).then((count) => {
      if (active) setPostCount(count)
    })

    return () => {
      active = false
    }
  }, [shownAddress])

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

  // Whether the reader is looking at their own page, which changes what this
  // offers: an invitation to fill it in rather than a report on somebody else.
  const isMine = Boolean(account) && shown?.address === account.toLowerCase()

  // An own page with nothing on it is the state this feature most needs to
  // handle well - it is what every new account sees, and "nothing here" is a
  // dead end where a prompt is a next step.
  const isBare = isMine && !shown?.bio && !shown?.links?.length && !shown?.avatarUrl

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

          <div className="profile-public-stats font-mono">
            {postCount !== null && (
              <span className="profile-public-stat">
                <PenLine size={11} />
                {postCount} {postCount === 1 ? 'post' : 'posts'}
              </span>
            )}

            {shown.createdAt && (
              <span
                className="profile-public-stat"
                title={new Date(shown.createdAt).toLocaleString()}
              >
                <CalendarDays size={11} />
                joined {formatJoined(shown.createdAt)}
              </span>
            )}
          </div>

          {/*
            Shown on everybody's page including your own. A reader checking a
            stranger needs it; you seeing it on your own page is how you learn
            that this is what strangers see, which is worth knowing before you
            decide what to put here.
          */}
          <p className="chat-profile-warning">
            <AlertTriangle size={11} />
            Anyone can write anything here. Check the address, not the name.
          </p>

          {isMine && (
            <button type="button" className="profile-public-edit font-mono" onClick={onEditProfile}>
              <Settings2 size={11} />
              Edit profile
            </button>
          )}

          {/* A next step rather than a blank space. Every new account lands
              here with nothing on it, and "nothing here" is a dead end. */}
          {isBare && (
            <p className="profile-public-prompt">
              This is your page, and it is empty. Add a picture, a line about
              yourself and up to three links in profile settings - then post
              something below and it stays here.
            </p>
          )}

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

/**
 * When somebody joined, as a month and year.
 *
 * Not a full date and not "3 months ago". The exact day is on the tooltip for
 * anyone who wants it; on the page it is a rough vintage, which is what the
 * number is actually read for - whether this account has been around.
 */
function formatJoined(iso) {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return 'recently'
  return new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
