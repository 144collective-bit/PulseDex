import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Search, Users } from 'lucide-react'
import PersonCard from './PersonCard'
import { searchProfiles, fetchActiveProfiles } from '../../services/discover'
import { useFollowSet } from '../../hooks/useFollowSet'

/**
 * Finding people.
 *
 * The problem this solves is specific and easy to miss: a new account signs
 * in, opens the Following feed, and it is empty - with nothing on the page
 * saying who exists or how to change that. Following only works once there is
 * somewhere to find people to follow.
 *
 * Two ways in, and no ranking. Search for a name, or look at who has been
 * posting. A "top accounts" list on a site this young is a list of whoever
 * arrived first, and putting it on the discovery page is how that becomes
 * permanent.
 */
export default function DiscoverPanel({ onOpenProfile, initialTerm = null, onUsedInitialTerm }) {
  /*
   * A term handed over from somewhere else - today, from a room filter that
   * matched no rooms, where somebody had plainly typed a person's name.
   *
   * Seeded into state rather than kept as a prop, because the moment it is on
   * screen it belongs to whoever is typing. A controlled value that a parent
   * could change underneath them is how a search box starts fighting the
   * person using it.
   */
  const [term, setTerm] = useState(() => (typeof initialTerm === 'string' ? initialTerm : ''))
  const [results, setResults] = useState(null)
  const [active, setActive] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  /*
   * Whoever is on screen, so the follow state for all of them is one query.
   * Results when a search is showing, the active list otherwise - the two are
   * never shown together, so this is always exactly what is rendered.
   */
  const shown = results !== null ? results : active
  const follow = useFollowSet(shown.map((p) => p.address))

  useEffect(() => {
    let alive = true

    fetchActiveProfiles()
      .then((people) => {
        if (!alive) return
        setActive(people)
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
  }, [])

  /*
   * Searched when asked rather than on every keystroke.
   *
   * A query per character would be a query per character - and a search that
   * fires while somebody is still typing shows them results for half a word,
   * which reads as "no such person" right up until it does not.
   */
  const search = useCallback(
    async (event) => {
      event.preventDefault()

      if (!term.trim()) {
        setResults(null)
        return
      }

      setError(null)
      try {
        setResults(await searchProfiles(term))
      } catch (err) {
        setError(err.message)
      }
    },
    [term],
  )

  /*
   * Run the handed-over search once, on arrival.
   *
   * Without this the box is filled in and nothing has happened, which reads
   * as a search that found nobody - the exact wrong answer to "looking for a
   * person?". The parent is told it has been used so the term is not handed
   * over again the next time this panel mounts.
   */
  const handedOver = useRef(false)
  useEffect(() => {
    if (handedOver.current || !initialTerm?.trim()) return
    handedOver.current = true

    let alive = true
    searchProfiles(initialTerm)
      .then((people) => alive && setResults(people))
      .catch((err) => alive && setError(err.message))

    onUsedInitialTerm?.()

    return () => {
      alive = false
    }
  }, [initialTerm, onUsedInitialTerm])

  return (
    <div className="discover">
      <form className="discover-search" onSubmit={search}>
        <Search size={14} className="discover-search-icon" aria-hidden="true" />
        <input
          className="discover-input"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            // Clearing the box clears the results, so an empty search box
            // never sits above somebody else's search.
            if (!e.target.value.trim()) setResults(null)
          }}
          placeholder="Search names"
          aria-label="Search for people by name"
          maxLength={32}
        />
        <button type="submit" className="chat-send">
          Search
        </button>
      </form>

      {(error || follow.error) && (
        <p className="chat-error" role="alert">
          {error || follow.error}
        </p>
      )}

      {results !== null ? (
        <section className="discover-section">
          <h2 className="discover-title font-mono">
            <Search size={12} />
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </h2>

          {results.length === 0 ? (
            /* Said rather than shown as emptiness, and it names the reason:
               only handles are searched, so somebody who never set one cannot
               be found this way. */
            <p className="chat-empty">
              Nobody by that name. Only accounts that have set a display name can
              be found here.
            </p>
          ) : (
            results.map((profile) => (
              <PersonCard
                key={profile.address}
                profile={profile}
                onOpenProfile={onOpenProfile}
                following={follow.isFollowing(profile.address)}
                canFollow={follow.canFollow(profile.address)}
                busy={follow.isBusy(profile.address)}
                onToggle={follow.toggle}
              />
            ))
          )}
        </section>
      ) : (
        <section className="discover-section">
          <h2 className="discover-title font-mono">
            <Users size={12} />
            Recently active
          </h2>

          {status === 'loading' && (
            <p className="chat-notice">
              <Loader2 size={15} className="chat-spin" />
              <span>Looking for people</span>
            </p>
          )}

          {status === 'failed' && (
            <p className="chat-notice">
              <AlertTriangle size={15} />
              <span>{error || 'Could not load anyone right now.'}</span>
            </p>
          )}

          {status === 'ready' && active.length === 0 && (
            <p className="chat-empty">
              Nobody has posted yet. Be the first and you will show up here.
            </p>
          )}

          {status === 'ready' &&
            active.map((profile) => (
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
        </section>
      )}
    </div>
  )
}
