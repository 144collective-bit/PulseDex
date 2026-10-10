import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Loader2, Users } from 'lucide-react'
import PersonCard from './PersonCard'
import { fetchFollowees, fetchFollowers } from '../../services/followGraph'
import { useFollowSet } from '../../hooks/useFollowSet'
import { formatAddress } from '../../utils/formatters'

/**
 * Who follows somebody, or who they follow.
 *
 * A page rather than a panel inside the profile, reachable at
 * /u/<who>/followers and /u/<who>/following. The counts on a profile header
 * have been there since 0008 and have never been pressable, which made them
 * trivia: a number you cannot open is a number you cannot act on, and the
 * whole point of a follower list on a site like this is that it is how you
 * find the next person worth reading.
 *
 * Two URLs rather than a tab, for the reason docs/navigation-roadmap.md gives
 * for everything else here - "look who follows this account" is a thing
 * somebody sends to somebody else, and state inside a component cannot be
 * sent, cannot be gone Back out of, and cannot be linked.
 *
 * The follow state for everybody on screen is fetched once for the page, not
 * once per row. That is not an optimisation, it is the difference between
 * this rendering and this hanging: a hook per row meant three queries per
 * row, twenty people came to sixty requests, and a browser runs six at a
 * time. See useFollowSet, and PersonCard's note about how it learned.
 */
export default function FollowList({ subject, list, onOpenProfile }) {
  const [people, setPeople] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const address = subject?.address || null
  const followers = list === 'followers'
  const fetchPage = followers ? fetchFollowers : fetchFollowees

  const follow = useFollowSet(people.map((p) => p.address))

  useEffect(() => {
    if (!address) return undefined

    let alive = true
    setStatus('loading')
    setPeople([])

    fetchPage(address)
      .then((page) => {
        if (!alive) return
        setPeople(page.people)
        setHasMore(page.hasMore)
        setStatus('ready')
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message)
        setStatus('failed')
      })

    return () => {
      alive = false
    }
  }, [address, fetchPage])

  const loadOlder = useCallback(async () => {
    const last = people[people.length - 1]
    if (!last || loadingOlder) return

    setLoadingOlder(true)
    setError(null)
    try {
      const page = await fetchPage(address, { before: last.followedAt })
      setPeople((current) => {
        /*
         * Merged by address rather than appended.
         *
         * The cursor is a timestamp and two follows can share one, so the
         * boundary row can come back in both pages. Appending would draw
         * somebody twice and React would warn about the key; merging is one
         * Set and the duplicate simply does not land.
         */
        const seen = new Set(current.map((p) => p.address))
        return [...current, ...page.people.filter((p) => !seen.has(p.address))]
      })
      setHasMore(page.hasMore)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingOlder(false)
    }
  }, [address, fetchPage, loadingOlder, people])

  const name = subject?.handle ? `@${subject.handle}` : formatAddress(address)
  const title = followers ? `Following ${name}` : `${name} follows`

  return (
    <section className="follow-list">
      <h2 className="discover-title font-mono">
        <Users size={12} />
        {title}
      </h2>

      {(error || follow.error) && (
        <p className="chat-error" role="alert">
          {error || follow.error}
        </p>
      )}

      {status === 'loading' && (
        <p className="chat-notice">
          <Loader2 size={15} className="chat-spin" />
          <span>Loading people</span>
        </p>
      )}

      {status === 'failed' && (
        <p className="chat-notice">
          <AlertTriangle size={15} />
          <span>{error || 'That list could not be loaded.'}</span>
        </p>
      )}

      {status === 'ready' && people.length === 0 && (
        /*
         * Said, and said differently for each direction, because the two
         * emptinesses mean different things. Nobody following you is a state
         * you are in; following nobody yourself is a thing you can fix, and
         * the sentence says where.
         */
        <p className="chat-empty">
          {followers
            ? 'Nobody follows this account yet.'
            : 'This account does not follow anyone yet. Discover is where people are found.'}
        </p>
      )}

      {status === 'ready' &&
        people.map((profile) => (
          <PersonCard
            key={profile.address}
            profile={profile}
            onOpenProfile={onOpenProfile}
            following={follow.isFollowing(profile.address)}
            canFollow={follow.canFollow(profile.address)}
            busy={follow.isBusy(profile.address)}
            onToggle={follow.toggle}
          />
        ))}

      {hasMore && (
        <button
          type="button"
          className="chat-older font-mono"
          onClick={loadOlder}
          disabled={loadingOlder}
        >
          {loadingOlder ? <Loader2 size={12} className="chat-spin" /> : <ChevronDown size={12} />}
          {loadingOlder ? 'Loading' : 'Load more'}
        </button>
      )}

      {/*
        Said once, at the bottom of the list rather than as a warning at the
        top of it.

        0008 made the follow graph public deliberately, and wrote down why:
        counts are on every profile, so following somebody here is an act
        others can see rather than a private bookmark. This page is the moment
        that becomes obvious to anybody who had not thought about it, and
        finding out by seeing your own name on a stranger's list is a worse way
        to learn it than being told.
      */}
      <p className="follow-list-note">
        Follows are public here. Anyone can see this list.
      </p>
    </section>
  )
}
