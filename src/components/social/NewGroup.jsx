import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { createGroup } from '../../services/rooms'
import { useIsModerator } from '../../hooks/useIsModerator'

/**
 * Making a group, from the sidebar.
 *
 * Only drawn for a moderator, and the endpoint checks the same thing again -
 * a control that is not rendered is not a permission, it is a button somebody
 * else can send the request without.
 *
 * Collapsed until asked for. This sits under a navigation column that people
 * use constantly and a form they will touch once a month; open by default it
 * would be the largest thing in the sidebar.
 */
export default function NewGroup({ onCreated }) {
  const isModerator = useIsModerator()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [gateToken, setGateToken] = useState('')
  const [minBalance, setMinBalance] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  if (!isModerator) return null

  if (!open) {
    return (
      <button type="button" className="room-new font-mono" onClick={() => setOpen(true)}>
        <Plus size={12} />
        New group
      </button>
    )
  }

  async function submit(event) {
    event.preventDefault()
    if (working) return

    setWorking(true)
    setError(null)

    try {
      await createGroup({
        name,
        blurb,
        /*
         * Empty means ungated, and is sent as empty rather than omitted so
         * the endpoint's own "was a gate asked for" test has something
         * unambiguous to read.
         */
        gateToken: gateToken.trim(),
        minBalance: minBalance.trim(),
      })

      setName('')
      setBlurb('')
      setGateToken('')
      setMinBalance('')
      setOpen(false)
      onCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <form className="room-new-form" onSubmit={submit}>
      <label className="room-new-field">
        <span className="font-mono">Name</span>
        <input
          className="room-new-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="the-trenches"
          maxLength={40}
          autoFocus
        />
      </label>

      <label className="room-new-field">
        <span className="font-mono">About</span>
        <input
          className="room-new-input"
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          placeholder="One line, optional"
          maxLength={140}
        />
      </label>

      {/*
        The gate, optional, and both fields together or neither. Said in the
        hint rather than enforced by disabling one of them: a half-filled
        pair with an explanation is easier to correct than a field that has
        gone grey for a reason nobody stated.
      */}
      <label className="room-new-field">
        <span className="font-mono">Holders only</span>
        <input
          className="room-new-input"
          value={gateToken}
          onChange={(e) => setGateToken(e.target.value)}
          placeholder="Token address, optional"
          maxLength={42}
        />
      </label>

      {gateToken.trim() && (
        <label className="room-new-field">
          <span className="font-mono">Minimum</span>
          <input
            className="room-new-input"
            value={minBalance}
            onChange={(e) => setMinBalance(e.target.value)}
            placeholder="e.g. 1000"
            inputMode="decimal"
            maxLength={40}
          />
        </label>
      )}

      {error && (
        <p className="room-new-error" role="alert">
          {error}
        </p>
      )}

      <p className="room-new-note">
        {/* Said before anybody fills it in, because neither can be changed
            afterwards and both are visible to everyone. */}
        A group’s name and its holders-only rule are set once and cannot be
        edited yet.
      </p>

      <div className="room-new-actions">
        <button type="submit" className="chat-send" disabled={working || !name.trim()}>
          {working && <Loader2 size={12} className="chat-spin" />}
          {working ? 'Creating' : 'Create'}
        </button>
        <button type="button" className="room-new-cancel font-mono" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
