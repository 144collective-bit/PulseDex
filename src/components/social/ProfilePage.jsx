import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import FeedPanel from './FeedPanel'
import ProfileHeader from './ProfileHeader'
import { fetchPublicProfile, fetchProfileByHandle, removeAvatar, removeBanner } from '../../services/profile'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { fetchPostCount } from '../../services/posts'
import { formatAddress } from '../../utils/formatters'
/*
 * The stylesheet, imported here as well as in SocialView.
 *
 * These are the two ways into this component family, and Vite attaches a
 * stylesheet to the chunk that imports it - so with the import only on
 * SocialView, /u/<address> opened directly loaded the page's code and none of
 * its styles. The shell above it was styled, everything below it was browser
 * defaults, and it only looked right if you happened to arrive via Chat with
 * SocialView's chunk already fetched. Imported from both entry points, the
 * stylesheet becomes a shared asset each of them pulls in.
 */
import '../../styles/social.css'

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
export default function ProfilePage({ route, onOpenProfile, onClose, embedded = false }) {
  const isModerator = useIsModerator()
  const { account } = useSiweAuth()

  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [postCount, setPostCount] = useState(null)
  const [tab, setTab] = useState('posts')

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
    const ok = window.confirm(
      `Remove ${formatAddress(profile.address)}'s profile picture and banner?`,
    )
    if (!ok) return

    setError(null)
    try {
      /*
       * Both, and in parallel. A moderator reaching for this has decided the
       * images are the problem; taking one down and leaving the other - the
       * full-width one, usually - would be doing most of nothing.
       */
      await Promise.all([removeAvatar(profile.address), removeBanner(profile.address)])
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null, bannerUrl: null } : prev))
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
      <Frame onClose={onClose} embedded={embedded}>
        <p className="chat-notice">
          <Loader2 size={15} className="chat-spin" />
          <span>Loading profile</span>
        </p>
      </Frame>
    )
  }

  if (status === 'failed' || !shown) {
    return (
      <Frame onClose={onClose} embedded={embedded}>
        <p className="chat-notice">
          <AlertTriangle size={15} />
          <span>{error || `Nobody here goes by @${handle}.`}</span>
        </p>
      </Frame>
    )
  }

  return (
    <Frame onClose={onClose} embedded={embedded}>
      <ProfileHeader
        profile={profile}
        address={shown.address}
        postCount={postCount}
        replyCount={null}
        isMine={isMine}
        isModerator={isModerator}
        onRemovePicture={onRemovePicture}
        tab={tab}
        onTab={setTab}
      />

      {/* A next step rather than a blank space. Every new account lands here
          with nothing on it, so this is the version of the page most people
          see first, and "nothing here" is a dead end. */}
      {isBare && (
        <p className="profile-public-prompt">
          This is your page, and it is empty. Add a picture, a line about
          yourself and up to three links in profile settings - then post
          something below and it stays here.
        </p>
      )}

      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}

      {/* Keyed by the tab, so switching rebuilds the list rather than
          merging replies into the posts already held. */}
      <FeedPanel
        key={tab}
        author={shown.address}
        replies={tab === 'replies'}
        onOpenProfile={onOpenProfile}
      />
    </Frame>
  )
}

/** The page around it, including the way back. Somebody who arrived on a
 *  pasted link has no history to go back through, so this is a link home
 *  rather than a call to history.back(). */
function Frame({ onClose, embedded, children }) {
  /*
   * Inside a tab there is no page to go back to and no outer layout to
   * supply - the tab is already the page. So the embedded version is the
   * contents and nothing else.
   */
  if (embedded) return <div className="profile-embedded">{children}</div>

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
