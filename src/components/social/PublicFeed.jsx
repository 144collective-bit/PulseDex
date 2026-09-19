import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import FeedPanel from './FeedPanel'
import { fetchFollowing } from '../../services/follows'
import { useSiweAuth } from '../../context/SiweAuthContext'

/**
 * The public feed, in two views.
 *
 * "For you" is everything anybody has posted, newest first. It is the default
 * and it is not personalised - the name is the one people expect rather than a
 * claim about ranking, and a site this size has no ranking worth making.
 *
 * "Following" is the posts of accounts you follow. Only offered signed in,
 * because signed out it would be an empty tab with no way to fill it.
 *
 * The list of who you follow is fetched here rather than inside the feed, so
 * switching tabs does not refetch it and the feed stays a component that takes
 * a set of authors and renders their posts.
 */
export default function PublicFeed({ onOpenProfile }) {
  const { account, isSignedIn } = useSiweAuth()

  const [tab, setTab] = useState('for-you')
  const [following, setFollowing] = useState(null)

  useEffect(() => {
    if (!isSignedIn || !account) {
      setFollowing(null)
      return undefined
    }

    let active = true
    fetchFollowing(account).then((addresses) => {
      if (active) setFollowing(addresses)
    })

    return () => {
      active = false
    }
  }, [isSignedIn, account])

  // Signing out with the Following tab open would otherwise leave somebody on
  // a tab that no longer exists, showing nothing and offering no way back.
  const active = isSignedIn ? tab : 'for-you'
  const loadingFollowing = active === 'following' && following === null

  return (
    <div className="feed-wrap">
      <nav className="xp-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'for-you'}
          className={`xp-tab ${active === 'for-you' ? 'active' : ''}`}
          onClick={() => setTab('for-you')}
        >
          For you
        </button>

        {isSignedIn && (
          <button
            type="button"
            role="tab"
            aria-selected={active === 'following'}
            className={`xp-tab ${active === 'following' ? 'active' : ''}`}
            onClick={() => setTab('following')}
          >
            Following
          </button>
        )}
      </nav>

      {loadingFollowing ? (
        <p className="chat-notice">
          <Loader2 size={15} className="chat-spin" />
          <span>Loading your feed</span>
        </p>
      ) : active === 'following' && following.length === 0 ? (
        /* Said rather than shown as an empty list, because an empty feed and
           a feed of nobody look identical and only one has an answer. */
        <p className="chat-empty">
          You are not following anyone yet. Open somebody&apos;s profile from the feed
          and follow them, and their posts will show up here.
        </p>
      ) : (
        <FeedPanel
          /* Keyed, so switching tabs rebuilds rather than merging one feed's
             posts into the other's list. */
          key={active}
          authors={active === 'following' ? following : null}
          onOpenProfile={onOpenProfile}
        />
      )}
    </div>
  )
}
