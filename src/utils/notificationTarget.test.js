import { describe, it, expect } from 'vitest'
import { notificationTarget } from './notificationTarget'

/*
 * Where each kind of notification goes.
 *
 * The case that matters is the one that is not clickable. Every row here is
 * about something that already happened, so a row drawn as a button and doing
 * nothing is worse than a row drawn as text - it reads as the site being
 * broken rather than as the thing being gone.
 */

const ACTOR = { address: '0x1111111111111111111111111111111111111111', handle: 'satoshi' }
const base = (over) => ({ id: 1, actor: ACTOR, postId: null, messageId: null, messageRoom: null, ...over })

describe('notificationTarget', () => {
  it('sends a follow to the profile of whoever followed', () => {
    expect(notificationTarget(base({ kind: 'follow' }))).toEqual({
      kind: 'profile',
      where: { address: ACTOR.address },
    })
  })

  it('sends a mention to the post', () => {
    expect(notificationTarget(base({ kind: 'mention', postId: 42 }))).toEqual({
      kind: 'post',
      where: { tab: 'post', post: 42 },
    })
  })

  it('sends a reply to the post too', () => {
    // The same destination, because the subject is the same kind of thing.
    expect(notificationTarget(base({ kind: 'reply', postId: 7 }))?.where).toEqual({
      tab: 'post',
      post: 7,
    })
  })

  it('sends a reaction to the message, in its room', () => {
    expect(
      notificationTarget(base({ kind: 'reaction', messageId: 9, messageRoom: 'lounge' })),
    ).toEqual({ kind: 'room', where: { tab: 'rooms', room: 'lounge', message: 9 } })
  })

  it('works for a token room and a group, not only the five', () => {
    const token = 'token-0xa1077a294dde1b09bb078844df40758a5d0f9a27'
    expect(
      notificationTarget(base({ kind: 'reaction', messageId: 3, messageRoom: token }))?.where.room,
    ).toBe(token)
    expect(
      notificationTarget(base({ kind: 'reaction', messageId: 3, messageRoom: 'group-whales' }))
        ?.where.room,
    ).toBe('group-whales')
  })

  describe('refuses to point at nothing', () => {
    it('a reaction with no room is not a location', () => {
      // An id alone does not say which room. This is what a deployment whose
      // query predates the room embed sends, and a dead link would be worse
      // than no link.
      expect(notificationTarget(base({ kind: 'reaction', messageId: 9 }))).toBeNull()
    })

    it('nor is a room that is not one', () => {
      expect(
        notificationTarget(base({ kind: 'reaction', messageId: 9, messageRoom: 'nonsense' })),
      ).toBeNull()
    })

    it('a mention with no post', () => {
      expect(notificationTarget(base({ kind: 'mention' }))).toBeNull()
    })

    it('a follow with no actor', () => {
      expect(notificationTarget({ kind: 'follow', actor: {} })).toBeNull()
      expect(notificationTarget({ kind: 'follow' })).toBeNull()
    })

    it('an id that is not one', () => {
      for (const postId of [0, -1, 1.5, '42', null, undefined, NaN, Number.MAX_VALUE]) {
        expect(notificationTarget(base({ kind: 'mention', postId }))).toBeNull()
      }
    })

    it('anything that is not a notification', () => {
      for (const value of [null, undefined, 42, 'mention', []]) {
        expect(notificationTarget(value)).toBeNull()
      }
    })

    it('a kind nobody has added yet', () => {
      // A fifth kind would arrive here before this file knew about it. With a
      // post it still opens the post; without one it is text, not a button.
      expect(notificationTarget(base({ kind: 'quote', postId: 5 }))?.where.post).toBe(5)
      expect(notificationTarget(base({ kind: 'quote' }))).toBeNull()
    })
  })

  it('a mention carrying a message goes to its post, not to the message', () => {
    // Both columns are nullable, so the schema permits this. The kind says
    // post, and following the message would open a room the reader was never
    // mentioned in.
    expect(
      notificationTarget(base({ kind: 'mention', postId: 4, messageId: 9, messageRoom: 'lounge' }))
        ?.kind,
    ).toBe('post')
  })
})
