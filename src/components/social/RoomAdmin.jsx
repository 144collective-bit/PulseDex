import { useState } from 'react'
import { Loader2, Settings2, Trash2 } from 'lucide-react'
import { editGroup, archiveGroup } from '../../services/rooms'
import { useIsModerator } from '../../hooks/useIsModerator'
import { roomGate } from '../../utils/gate'

/**
 * Changing what a group requires, and taking it down.
 *
 * Only drawn for a moderator, and the endpoint checks the same thing again -
 * a control that is not rendered is not a permission, it is a button somebody
 * else can send the request without.
 *
 * Groups only. The five fixed rooms live in src/config/rooms.js and arrive in
 * a commit; a token room belongs to whoever is talking about that token and
 * has no rule to set. Neither is a moderator's to edit from here, and the
 * endpoint refuses both.
 *
 * Collapsed until asked for, like NewGroup beside it. This is a control
 * somebody touches once a month sitting on a page they read every day.
 */
export default function RoomAdmin({ room, onChanged }) {
  const isModerator = useIsModerator()

  const [open, setOpen] = useState(false)
  const [gateToken, setGateToken] = useState('')
  const [minBalance, setMinBalance] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  if (!isModerator || !room || room.kind !== 'group') return null

  const current = roomGate(room)

  /** Fill the form from what the room requires now, so opening it and saving
   *  without touching anything is not a way to accidentally remove a gate. */
  function start() {
    setGateToken(room.gate_token || room.gateToken || '')
    setMinBalance('')
    setError(null)
    setOpen(true)
  }

  if (!open) {
    return (
      <button type="button" className="social-head-link font-mono" onClick={start}>
        <Settings2 size={11} />
        Manage
      </button>
    )
  }

  async function save(event) {
    event.preventDefault()
    setWorking(true)
    setError(null)

    try {
      const group = await editGroup({
        slug: room.slug,
        /*
         * Sent as typed. An empty token is a request to remove the gate and
         * open the room, which the endpoint records like any other change -
         * opening a room is as much a change to who may speak in it as
         * closing one.
         */
        gateToken: gateToken.trim(),
        minBalance: minBalance.trim(),
      })
      setOpen(false)
      onChanged?.(group)
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  async function takeDown() {
    /*
     * Confirmed, and named. A room is a place people are in, and "are you
     * sure" without saying which room is how the wrong one gets taken down
     * from a list of eight that all look alike.
     */
    const ok = window.confirm(
      `Take down ${room.name || room.slug}? It leaves the sidebar and nobody can post in it. ` +
        'What was said stays readable.',
    )
    if (!ok) return

    setWorking(true)
    setError(null)
    try {
      await archiveGroup(room.slug)
      setOpen(false)
      onChanged?.(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <form className="room-new-form room-admin" onSubmit={save}>
      {/* What it requires now, so a change is made against something stated
          rather than remembered. */}
      <p className="room-new-note">
        {current ? `Now: holders of ${current}` : 'Now: open to everybody.'}
      </p>

      <label className="room-new-field">
        <span className="font-mono">Holders only</span>
        <input
          className="room-new-input"
          value={gateToken}
          onChange={(e) => setGateToken(e.target.value)}
          placeholder="Token address, or empty to open the room"
          spellCheck={false}
        />
      </label>

      {gateToken.trim() && (
        <label className="room-new-field">
          <span className="font-mono">Minimum</span>
          <input
            className="room-new-input"
            value={minBalance}
            onChange={(e) => setMinBalance(e.target.value)}
            placeholder="1000"
            inputMode="decimal"
          />
        </label>
      )}

      {error && (
        <p className="room-new-error" role="alert">
          {error}
        </p>
      )}

      {/*
        Said before it is done, not after. Everybody already in the room is
        told what changed - see the notice RoomPanel draws from
        `room_gate_changes` - and a moderator should know that going in.
      */}
      <p className="room-new-note">
        Every change is recorded and shown in the room, with who made it.
      </p>

      <div className="room-new-actions">
        <button type="submit" className="chat-send" disabled={working}>
          {working && <Loader2 size={12} className="chat-spin" />}
          Save
        </button>

        <button
          type="button"
          className="room-new-cancel font-mono"
          onClick={() => setOpen(false)}
          disabled={working}
        >
          Cancel
        </button>

        {/* Last, and apart. The destructive control should not sit where the
            eye lands on its way to Save. */}
        <button
          type="button"
          className="room-admin-remove font-mono"
          onClick={takeDown}
          disabled={working}
        >
          <Trash2 size={11} />
          Take down
        </button>
      </div>
    </form>
  )
}
