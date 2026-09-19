import { useEffect, useState } from 'react'
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
export function useRoomPresence(room) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const unsubscribe = subscribeToPresence({ room, onCount: setCount })
    return unsubscribe
  }, [room])

  return count
}
