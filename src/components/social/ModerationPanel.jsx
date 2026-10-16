import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, ScrollText, ShieldAlert } from 'lucide-react'
import { fetchModerationLog, fetchReportQueue, setPostHidden } from '../../services/moderation'
import { describeAction, subjectLabel } from '../../utils/moderationLog'
import { formatAddress, formatTimeAgo } from '../../utils/formatters'
import { useIsModerator } from '../../hooks/useIsModerator'

/**
 * The report queue, and what has been done about it.
 *
 * Two things in one panel on purpose. The roadmap asked for "a report queue
 * with a review view, not a table nobody opens" and "an audit trail for every
 * moderator action", and they are the same screen: the reason a queue goes
 * unopened is that opening it tells you nothing about what has already been
 * handled, so every visit starts by re-reading reports somebody dealt with
 * last week.
 *
 * Everything here comes from two endpoints that answer 404 to anybody who is
 * not a moderator. The check below decides what to draw and nothing else - a
 * control that is not rendered is not a permission, it is a request somebody
 * can send without it.
 */
export default function ModerationPanel({ onOpenProfile, onOpenPost }) {
  const isModerator = useIsModerator()

  const [reports, setReports] = useState(null)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(() => new Set())
  const [showing, setShowing] = useState('queue')

  const load = useCallback(() => {
    if (!isModerator) return

    setError(null)

    /*
     * Both at once, and a failure in either is reported rather than swallowed.
     *
     * The opposite call from most of this codebase, where a failed decoration
     * degrades quietly - and the reason is that this panel IS the information.
     * A queue that renders empty because a request failed tells a moderator
     * there is nothing to do, which is the one wrong thing it could say.
     */
    Promise.all([fetchReportQueue(), fetchModerationLog({ limit: 50 })])
      .then(([queue, log]) => {
        setReports(queue)
        setEntries(log)
      })
      .catch((err) => {
        setReports([])
        setError(err.message)
      })
  }, [isModerator])

  useEffect(load, [load])

  const toggleHide = useCallback(
    async (id, on) => {
      if (busy.has(id)) return

      setBusy((current) => new Set(current).add(id))
      setError(null)

      try {
        await setPostHidden({ id, on })
        /*
         * Reloaded rather than patched in place, which is the opposite of the
         * optimism everywhere else in this app. A hide writes an audit entry,
         * and the point of the entry is that it says what actually happened -
         * so a panel showing the state it assumed, beside a log it did not
         * refetch, would be the one screen in the app allowed to disagree with
         * the record.
         */
        load()
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    },
    [busy, load],
  )

  if (!isModerator) {
    /*
     * The same sentence a stranger guessing the URL gets, and it does not say
     * that a moderation panel exists behind it - matching the 404 the
     * endpoints give rather than the 403 they could. The path is not the
     * control, but there is nothing to gain by confirming what is here.
     */
    return (
      <div className="social-signin">
        <ShieldAlert size={20} />
        <h2>Nothing here</h2>
        <p>This page is not available on this account.</p>
      </div>
    )
  }

  const queue = reports || []

  return (
    <div className="moderation-panel">
      <nav className="moderation-switch" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={showing === 'queue'}
          className={`xp-tab ${showing === 'queue' ? 'active' : ''}`}
          onClick={() => setShowing('queue')}
        >
          <ShieldAlert size={13} />
          <span>Reports{queue.length > 0 ? ` (${queue.length})` : ''}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showing === 'log'}
          className={`xp-tab ${showing === 'log' ? 'active' : ''}`}
          onClick={() => setShowing('log')}
        >
          <ScrollText size={13} />
          <span>What was done</span>
        </button>
      </nav>

      {error && <p className="chat-error" role="alert">{error}</p>}

      {showing === 'queue' && (
        <>
          {reports === null && <p className="chat-empty">Reading the queue…</p>}

          {reports !== null && queue.length === 0 && !error && (
            <p className="chat-empty">Nothing has been reported.</p>
          )}

          {queue.map((report) => (
            <article key={report.id} className="moderation-report">
              <header className="moderation-report-meta font-mono">
                <button
                  type="button"
                  className="chat-author"
                  onClick={() => onOpenProfile?.({ address: report.post?.address })}
                  title={report.post?.address || ''}
                >
                  {formatAddress(report.post?.address)}
                </button>
                <span className="chat-time">
                  reported {formatTimeAgo(Math.floor(Date.parse(report.createdAt) / 1000))}
                </span>

                {/*
                  What has already happened to it. Drawn before the body,
                  because it changes what a moderator is being asked - a post
                  the system hid an hour ago needs reading now, and a removed
                  one needs nothing.
                */}
                {report.post?.removed && <span className="moderation-flag">removed</span>}
                {!report.post?.removed && report.post?.hiddenAt && (
                  <span className="moderation-flag">
                    {report.post.hiddenBy ? 'hidden by a moderator' : 'hidden automatically'}
                  </span>
                )}
              </header>

              {/*
                The reporter's reason, if they gave one, marked as theirs.
                Unattributed it would read as a note the site had made about
                the post.
              */}
              {report.reason && <p className="moderation-reason">“{report.reason}”</p>}

              {/*
                The post itself, as text and never as markup. The same rule
                PostBody follows - this is a stranger's words, read here by
                somebody deciding what to do about them, which is not a reason
                to relax it.
              */}
              {report.post && !report.post.removed && (
                <p className="moderation-body">{report.post.body}</p>
              )}

              {report.post?.removed && (
                <p className="moderation-body is-gone">This post has been removed.</p>
              )}

              <div className="moderation-report-tools">
                {report.post && !report.post.removed && (
                  <>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => onOpenPost?.(report.postId)}
                    >
                      Open it
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      disabled={busy.has(report.postId)}
                      onClick={() => toggleHide(report.postId, !report.post.hiddenAt)}
                    >
                      {report.post.hiddenAt ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{report.post.hiddenAt ? 'Put it back' : 'Hide it'}</span>
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </>
      )}

      {showing === 'log' && (
        <>
          {entries.length === 0 && !error && (
            <p className="chat-empty">
              Nothing has been recorded yet. Every block, removal and hide from now on
              appears here.
            </p>
          )}

          <ol className="moderation-log">
            {entries.map((entry) => (
              <li key={entry.id} className="moderation-log-entry">
                <time className="chat-time font-mono" dateTime={entry.at}>
                  {formatTimeAgo(Math.floor(Date.parse(entry.at) / 1000))}
                </time>
                {/*
                  One sentence per row, built in src/utils/moderationLog.js
                  rather than here. A row reading "hide_post" beside an id is a
                  row somebody has to decode, and this list is read when
                  somebody is already trying to work out what happened.
                */}
                <span className="moderation-log-said">{describeAction(entry)}</span>
                {subjectLabel(entry) && (
                  <span className="moderation-log-subject font-mono">{subjectLabel(entry)}</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
