import { useEffect, useRef, useState } from 'react'
import { subscribeToPresence } from '../services/chat'

/**
 * How many people have this room open.
 *
 * Starts at zero and becomes at least one the moment the channel joins, since
 * this tab counts itself. That is deliberate - a room reading "1 here" is
 * honest, where hiding your own presence would make a room you are demonstrably
 * in claim nobody is.
 *
 * @param {string} room
 */
export function useRoomPresence(room, { name = null } = {}) {
  const [state, setState] = useState({ count: 0, typing: [] })

  /*
   * The setter, held in a ref so the subscription does not rebuild when the
   * name arrives.
   *
   * A profile loads a moment after the room does, so `name` goes from null to
   * a handle on the second render. With it in the dependency list that would
   * tear the channel down and build a new one - and every other tab in the
   * room would see somebody leave and immediately rejoin, a second after they
   * arrived.
   */
  const nameRef = useRef(name)
  nameRef.current = name

  const [api, setApi] = useState({ setTyping: () => {} })

  useEffect(() => {
    const channel = subscribeToPresence({
      room,
      name: nameRef.current,
      onState: setState,
    })
    setApi({ setTyping: channel.setTyping })
    return () => {
      channel.stop()
      setApi({ setTyping: () => {} })
    }
  }, [room])

  return { count: state.count, typing: state.typing, setTyping: api.setTyping }
}
