import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import FeedPanel from './FeedPanel'
import FollowList from './FollowList'
import HoldingsPanel from './HoldingsPanel'
import PinnedPost from './PinnedPost'
import PostList from './PostList'
import ProfileHeader from './ProfileHeader'
import {
  fetchPinnedPost,
  fetchProfileByHandle,
  fetchPublicProfile,
  removeAvatar,
  removeBanner,
  setPinnedPost,
} from '../../services/profile'
import { useIsModerator } from '../../hooks/useIsModerator'
import { useSiweAuth } from '../../context/SiweAuthContext'
import { fetchBookmarks, fetchPostCount, fetchReactedPosts } from '../../services/posts'
import { useBookmarks } from '../../hooks/useBookmarks'
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
 * it. /u/<who>/followers and /u/<who>/following are the same surface showing
 * one of the two lists instead of the posts - see FollowList for why those are
 * URLs rather than tabs.
 *
 * Read entirely over the anon key. Nothing here is behind a sign-in, because
 * nothing here is private - a profile that only members could see would be a
 * profile nobody discovers.
 */
export default function ProfilePage({
  route,
  onOpenProfile,
  onClose,
  onOpenToken,
  /** Opens one post's page, for a press on a quote card. Optional: this page
   *  renders inside the social section too, which routes posts its own way. */
  onOpenPost,
  embedded = false,
}) {
  const isModerator = useIsModerator()
  const { account } = useSiweAuth()

  /* Only for the count on the Saved tab. The list itself is fetched when that
     tab is opened, because most visits to a profile never open it. */
  const bookmarks = useBookmarks()

  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [postCount, setPostCount] = useState(null)
  const [pinned, setPinned] = useState(null)
  const [tab, setTab] = useState('posts')

  const { address, handle, list } = route

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

  /*
   * The pinned post, fetched by id once the profile says there is one.
   *
   * Separate rather than embedded in the profile query, and the reason is in
   * src/config/queries.js: `profiles` reaches `posts` two ways now, so an
   * embed would need a foreign key hint, and "unless it has been removed" is
   * not a condition PostgREST expresses well inside one. By id, through the
   * ordinary post path, a removed pin comes back as null and the page simply
   * has no pin - which is what it should look like.
   */
  const pinnedId = profile?.pinnedPostId || null
  useEffect(() => {
    if (!pinnedId || !profile) {
      setPinned(null)
      return undefined
    }

    let active = true
    fetchPinnedPost(profile).then((post) => {
      if (active) setPinned(post)
    })

    return () => {
      active = false
    }
    /*
     * Keyed on the id and the address rather than on `profile`, which is a new
     * object on every load of the page and would re-fetch the same post for
     * no reason. Both, because the id alone would not notice the page moving
     * to a different person who happens to have pinned the same post - which
     * cannot happen, since a pin must be your own post, but the dependency
     * being right should not rest on that.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedId, profile?.address])

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
   * Pin or unpin, from the control on your own post.
   *
   * The profile in state is moved first so the label and the block at the top
   * of the page agree immediately, and put back if the write fails - the same
   * shape as the follow button, and for the same reason: a pin that takes a
   * round trip to appear reads as a control that did not work.
   */
  const onTogglePin = useCallback(
    async (postId) => {
      const before = profile?.pinnedPostId ?? null
      setError(null)
      setProfile((prev) => (prev ? { ...prev, pinnedPostId: postId } : prev))

      try {
        await setPinnedPost(postId)
      } catch (err) {
        setProfile((prev) => (prev ? { ...prev, pinnedPostId: before } : prev))
        setError(err.message)
      }
    },
    [profile?.pinnedPostId],
  )

  /*
   * The two loaders the non-feed tabs use.
   *
   * Memoised, and that is load-bearing rather than tidiness: PostList runs its
   * fetch in an effect keyed on the loader, so a new function every render
   * would be a fetch every render. The address is the only thing either
   * depends on.
   */
  const loadReacted = useCallback(
    async () =>
      (await fetchReactedPosts(shownAddress)).map(({ post, emoji }) => ({
        post,
        // Which reaction, because there is no single "like" here and the tab
        // would otherwise claim an endorsement nobody gave.
        badge: `reacted ${emoji}`,
      })),
    [shownAddress],
  )

  const loadSaved = useCallback(
    async () => (await fetchBookmarks({ limit: 50 })).posts.map((post) => ({ post })),
    [],
  )

  /** Open one of the two follow lists, as a URL. */
  const onOpenList = useCallback(
    (which) => {
      onOpenProfile?.({ address: profile?.address || address, handle, list: which })
    },
    [onOpenProfile, profile?.address, address, handle],
  )

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
        onOpenToken={onOpenToken}
        profile={profile}
        address={shown.address}
        postCount={postCount}
        replyCount={null}
        isMine={isMine}
        isModerator={isModerator}
        onRemovePicture={onRemovePicture}
        tab={tab}
        onTab={setTab}
        onOpenList={onOpenList}
        savedCount={isMine ? bookmarks.count : null}
        /*
         * The tabs are hidden while a follow list is showing. They would be
         * switching a feed that is not on the screen, and pressing one and
         * watching nothing happen is how a tab strip teaches people it is
         * decoration.
         */
        showTabs={!list}
      />

      {/* A next step rather than a blank space. Every new account lands here
          with nothing on it, so this is the version of the page most people
          see first, and "nothing here" is a dead end. */}
      {isBare && !list && (
        <p className="profile-public-prompt">
          This is your page, and it is empty. Add a picture, a line about
          yourself and up to three links in profile settings - then post
          something below and it stays here. Pin the one you want read first.
        </p>
      )}

      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}

      {list ? (
        <FollowList
          subject={{ address: shown.address, handle: shown.handle }}
          list={list}
          onOpenProfile={onOpenProfile}
        />
      ) : (
        <>
          {/*
            Holdings, when and only when this account has asked for them to be
            shown. Off for everybody until they say otherwise - the reasoning
            is in 0019_profile_depth.sql and in HoldingsPanel itself.
          */}
          {profile?.showHoldings && <HoldingsPanel address={shown.address} isMine={isMine} />}

          {/* Above the tabs, because a pin is part of who this account is
              rather than the first item of their timeline. */}
          <PinnedPost
            post={pinned}
            isOwn={isMine}
            onOpenProfile={onOpenProfile}
            onTogglePin={isMine ? onTogglePin : undefined}
            /* A pinned post removed from here leaves the page with no pin,
               which is what the database will say on the next read anyway -
               `on delete set null` does not fire on a soft delete, so
               fetchPinnedPost is what turns it into no pin. */
            onRemoved={() => setPinned(null)}
          />

          {/*
            Three of the five tabs are a feed with a filter on it; two are a
            fixed set fetched once. Which is why they are different
            components rather than one with a mode: `useFeed` carries a
            realtime subscription and a cursor, both of which exist for a
            timeline that grows from the top, and neither of which means
            anything for "the posts I saved".
          */}
          {tab === 'reacted' ? (
            <PostList
              load={loadReacted}
              loading="Loading reactions"
              empty={
                isMine
                  ? 'You have not reacted to anything yet.'
                  : 'This account has not reacted to anything yet.'
              }
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
            />
          ) : tab === 'saved' ? (
            <PostList
              load={loadSaved}
              loading="Loading your saved posts"
              empty="Nothing saved yet. The bookmark on a post saves it here, and only you can see this."
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
            />
          ) : (
            /* Keyed by the tab, so switching rebuilds the list rather than
               merging replies into the posts already held. */
            <FeedPanel
              key={tab}
              author={shown.address}
              replies={tab === 'replies'}
              media={tab === 'media'}
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
              pinnedPostId={profile?.pinnedPostId || null}
              onTogglePin={isMine ? onTogglePin : undefined}
            />
          )}
        </>
      )}
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
