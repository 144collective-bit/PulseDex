import { describe, expect, it } from 'vitest'
import {
  ACTION_WORDS,
  REVERSIBLE,
  actorLabel,
  describeAction,
  stillHidden,
  subjectLabel,
} from './moderationLog'

const MODERATOR = '0x' + '1'.repeat(40)

describe('actorLabel', () => {
  it('shortens a moderator’s address', () => {
    expect(actorLabel(MODERATOR)).toBe('0x1111…1111')
  })

  /*
   * Null is the system, and that is the distinction the log exists to keep:
   * "three accounts reported this" and "a moderator read this" are different
   * facts about the same hidden post.
   */
  it('calls a null actor the system', () => {
    expect(actorLabel(null)).toBe('The system')
    expect(actorLabel(undefined)).toBe('The system')
  })

  it('does not present anything unaddress-shaped as a moderator', () => {
    for (const value of ['', 'admin', '0xnope', 42, {}, '0x' + '1'.repeat(39)]) {
      expect(actorLabel(value)).toBe('The system')
    }
  })
})

describe('describeAction', () => {
  it('reads as a sentence for every action the database allows', () => {
    for (const action of Object.keys(ACTION_WORDS)) {
      const sentence = describeAction({ actor: MODERATOR, action })
      expect(sentence.startsWith('0x1111…1111 ')).toBe(true)
      expect(sentence.endsWith('.')).toBe(true)
    }
  })

  /*
   * The action list lives in a check constraint in 0021. If somebody adds a
   * value there and not here, this is the test that says so - and the
   * fallback below is what keeps that from being a blank row.
   */
  it('covers exactly the actions 0021 permits', () => {
    expect(Object.keys(ACTION_WORDS).sort()).toEqual(
      [
        'archive_room',
        'auto_hide_post',
        'block',
        'edit_room_gate',
        'hide_post',
        'remove_images',
        'remove_message',
        'remove_post',
        'revoke_claim',
        'unblock',
        'unhide_post',
      ].sort(),
    )
  })

  it('still renders an action it has never heard of, rather than throwing', () => {
    const sentence = describeAction({ actor: MODERATOR, action: 'shadowban' })
    expect(sentence).toMatch(/shadowban/)
    expect(sentence).toMatch(/^0x1111…1111 /)
  })

  it('says something for a row with nothing on it', () => {
    expect(describeAction(null).length).toBeGreaterThan(5)
    expect(describeAction({}).length).toBeGreaterThan(5)
  })

  /*
   * The count is the whole reviewability of an automatic hide: "hid this post
   * automatically" invites "on what basis", and the answer has to be what the
   * system saw at the time.
   */
  it('gives the basis for an automatic hide', () => {
    expect(describeAction({ actor: null, action: 'auto_hide_post', evidence: 3 })).toBe(
      'The system hid this post automatically after 3 established accounts reported it.',
    )
  })

  it('counts one established account in the singular', () => {
    expect(describeAction({ actor: null, action: 'auto_hide_post', evidence: 1 })).toMatch(
      /1 established account reported it/,
    )
  })

  // "3 reports" would send a reviewer looking for three rows in the queue and
  // find eight: the number is the ones that passed the wallet-age gate.
  it('says established rather than implying a report count', () => {
    const sentence = describeAction({ actor: null, action: 'auto_hide_post', evidence: 4 })
    expect(sentence).toMatch(/established/)
  })

  it('leaves the count off an action it does not explain', () => {
    const sentence = describeAction({ actor: MODERATOR, action: 'hide_post', evidence: 3 })
    expect(sentence).not.toMatch(/\d established/)
  })

  it('leaves the count off an automatic hide that has none recorded', () => {
    for (const evidence of [null, undefined, 'three']) {
      const sentence = describeAction({ actor: null, action: 'auto_hide_post', evidence })
      expect(sentence).toBe('The system hid this post automatically.')
    }
  })
})

describe('subjectLabel', () => {
  it('names a post', () => {
    expect(subjectLabel({ subject_post_id: 412 })).toBe('Post 412')
  })

  it('names a room', () => {
    expect(subjectLabel({ subject_room: 'pulse' })).toBe('Room pulse')
  })

  it('names an account', () => {
    expect(subjectLabel({ subject_address: MODERATOR })).toBe('0x1111…1111')
  })

  it('prefers the post, which is the more specific of the two', () => {
    expect(subjectLabel({ subject_post_id: 7, subject_address: MODERATOR })).toBe('Post 7')
  })

  /*
   * `remove_message` records the room and not the message: messages are
   * removed by an id in a table this log has no foreign key to, and an id with
   * no room beside it is not something anybody can go and look at.
   */
  it('is null when the entry names nothing anybody could open', () => {
    expect(subjectLabel({})).toBeNull()
    expect(subjectLabel(null)).toBeNull()
    expect(subjectLabel({ subject_post_id: 0, subject_room: '', subject_address: '' })).toBeNull()
  })
})

describe('stillHidden', () => {
  it('is true when the newest entry is a hide', () => {
    expect(stillHidden([{ action: 'hide_post' }, { action: 'remove_images' }])).toBe(true)
    expect(stillHidden([{ action: 'auto_hide_post' }])).toBe(true)
  })

  /*
   * A hide followed by an unhide is two rows, and a panel offering "put it
   * back" on the first would be offering to undo something already undone.
   */
  it('is false once an unhide came after it', () => {
    expect(stillHidden([{ action: 'unhide_post' }, { action: 'hide_post' }])).toBe(false)
  })

  it('ignores entries it cannot read, rather than letting one decide', () => {
    expect(stillHidden([{ action: 'shadowban' }, { action: 'hide_post' }])).toBe(true)
  })

  it('is false for nothing at all', () => {
    expect(stillHidden([])).toBe(false)
    expect(stillHidden(null)).toBe(false)
    expect(stillHidden('hide_post')).toBe(false)
  })

  it('only offers to reverse a hide', () => {
    expect([...REVERSIBLE].sort()).toEqual(['auto_hide_post', 'hide_post'])
  })
})
