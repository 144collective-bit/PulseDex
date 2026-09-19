import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Search, Users } from 'lucide-react'
import PersonCard from './PersonCard'
import { searchProfiles, fetchActiveProfiles } from '../../services/discover'

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
export default function DiscoverPanel({ onOpenProfile }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState(null)
  const [active, setActive] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

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

      {error && (
        <p className="chat-error" role="alert">
          {error}
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
              <PersonCard key={profile.address} profile={profile} onOpenProfile={onOpenProfile} />
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
              <PersonCard key={profile.address} profile={profile} onOpenProfile={onOpenProfile} />
            ))}
        </section>
      )}
    </div>
  )
}
