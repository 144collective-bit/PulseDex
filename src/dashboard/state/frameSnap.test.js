import { describe, it, expect } from 'vitest'
import { bestFrame, fitsFrame, overlapArea, planFrameMove } from './frameSnap'

/*
 * Moving a module between fixed holders.
 *
 * The rule the whole feature rests on is that the set of frames never changes
 * when something moves - a drop reassigns which module is in which rectangle
 * and nothing else. These pin that, including the cases where the honest
 * answer is to refuse and leave the board alone.
 */

/** Layout items are `i` plus a rect; frames are the rect on its own. */
const item = (i, x, y, w, h) => ({ i, x, y, w, h })
const rect = (x, y, w, h) => ({ x, y, w, h })

/** Everything fits everywhere unless a test says otherwise. */
const anySize = () => ({ min: { w: 1, h: 1 } })

describe('overlapArea', () => {
  it('measures the shared cells', () => {
    expect(overlapArea(rect(0, 0, 4, 4), rect(2, 2, 4, 4))).toBe(4)
  })

  it('is zero for rectangles that only touch', () => {
    expect(overlapArea(rect(0, 0, 2, 2), rect(2, 0, 2, 2))).toBe(0)
  })

  it('is zero for rectangles apart', () => {
    expect(overlapArea(rect(0, 0, 2, 2), rect(8, 8, 2, 2))).toBe(0)
  })
})

describe('bestFrame', () => {
  it('picks the frame the body of the module is over, not the one it merely clips', () => {
    const dragged = rect(3, 0, 4, 4)
    const barely = rect(0, 0, 4, 4) // one column of overlap
    const mostly = rect(4, 0, 4, 4) // three columns of overlap

    expect(bestFrame(dragged, [barely, mostly])).toBe(mostly)
  })

  it('returns nothing when the module is over no frame at all', () => {
    expect(bestFrame(rect(20, 20, 2, 2), [rect(0, 0, 4, 4)])).toBeNull()
  })

  it('breaks a tie on centre distance rather than array order', () => {
    // Equal overlap with both; the second shares the dragged rect's centre.
    const dragged = rect(2, 0, 4, 2)
    const left = rect(0, 0, 4, 2)
    const centred = rect(2, 0, 4, 2)

    expect(bestFrame(dragged, [left, centred])).toBe(centred)
    expect(bestFrame(dragged, [centred, left])).toBe(centred)
  })
})

describe('fitsFrame', () => {
  it('accepts a frame at least the minimum in both directions', () => {
    expect(fitsFrame(rect(0, 0, 4, 3), { w: 4, h: 3 })).toBe(true)
  })

  it('rejects a frame short in either direction', () => {
    expect(fitsFrame(rect(0, 0, 4, 2), { w: 4, h: 3 })).toBe(false)
    expect(fitsFrame(rect(0, 0, 3, 3), { w: 4, h: 3 })).toBe(false)
  })

  it('rejects a frame larger than the module says it can be', () => {
    // A module takes its frame whole, so too big is a misfit too - and the grid
    // engine holds the same maximum and would clamp it back behind our backs.
    expect(fitsFrame(rect(0, 0, 12, 8), { w: 2, h: 3 }, { w: 12, h: 5 })).toBe(false)
    expect(fitsFrame(rect(0, 0, 12, 5), { w: 2, h: 3 }, { w: 12, h: 5 })).toBe(true)
  })

  it('has no upper bound when the module declares none', () => {
    expect(fitsFrame(rect(0, 0, 12, 40), { w: 1, h: 1 })).toBe(true)
  })
})

describe('planFrameMove and maxima', () => {
  it('refuses a bay bigger than the module is allowed to be', () => {
    const next = planFrameMove({
      movedId: 'a',
      movedTo: rect(8, 0, 12, 9),
      layout: [item('a', 0, 0, 3, 3)],
      bays: [rect(8, 0, 12, 9)],
      limitsOf: () => ({ min: { w: 2, h: 3 }, max: { w: 12, h: 5 } }),
    })

    expect(next).toBeNull()
  })
})

describe('planFrameMove', () => {
  const layout = [item('a', 0, 0, 4, 4), item('b', 4, 0, 4, 4)]

  it('moves a module into an empty bay and resizes it to fit', () => {
    const bays = [rect(8, 0, 4, 6)]

    const next = planFrameMove({
      movedId: 'a',
      movedTo: rect(8, 0, 4, 4),
      layout,
      bays,
      limitsOf: anySize,
    })

    // It takes the bay whole - 4x6, not the 4x4 it arrived as.
    expect(next.find((l) => l.i === 'a')).toEqual(item('a', 8, 0, 4, 6))
    // Nothing else is disturbed.
    expect(next.find((l) => l.i === 'b')).toEqual(item('b', 4, 0, 4, 4))
  })

  it('swaps two modules, each taking the other frame', () => {
    const next = planFrameMove({
      movedId: 'a',
      movedTo: rect(4, 0, 4, 4),
      layout: [item('a', 0, 0, 4, 4), item('b', 4, 0, 6, 5)],
      bays: [],
      limitsOf: anySize,
    })

    expect(next.find((l) => l.i === 'a')).toEqual(item('a', 4, 0, 6, 5))
    expect(next.find((l) => l.i === 'b')).toEqual(item('b', 0, 0, 4, 4))
  })

  it('leaves the board alone when the module is dropped on nothing', () => {
    expect(
      planFrameMove({
        movedId: 'a',
        movedTo: rect(40, 40, 4, 4),
        layout,
        bays: [],
        limitsOf: anySize,
      }),
    ).toBeNull()
  })

  it('leaves the board alone when a module is dropped back on its own frame', () => {
    expect(
      planFrameMove({
        movedId: 'a',
        movedTo: rect(0, 0, 4, 4),
        layout,
        bays: [],
        limitsOf: anySize,
      }),
    ).toBeNull()
  })

  it('refuses a bay the module cannot fit rather than growing it', () => {
    const bays = [rect(8, 0, 2, 2)]

    expect(
      planFrameMove({
        movedId: 'a',
        movedTo: rect(8, 0, 2, 2),
        layout,
        bays,
        limitsOf: () => ({ min: { w: 4, h: 4 } }),
      }),
    ).toBeNull()
  })

  it('refuses a swap when only one of the two would fit', () => {
    // 'a' fits b's large frame, but 'b' cannot fit a's small one, and half a
    // swap would leave them overlapping.
    const next = planFrameMove({
      movedId: 'a',
      movedTo: rect(4, 0, 8, 8),
      layout: [item('a', 0, 0, 2, 2), item('b', 4, 0, 8, 8)],
      bays: [],
      limitsOf: (id) => (id === 'b' ? { min: { w: 6, h: 6 } } : { min: { w: 1, h: 1 } }),
    })

    expect(next).toBeNull()
  })

  it('never changes how many frames the board has', () => {
    const before = [item('a', 0, 0, 4, 4), item('b', 4, 0, 4, 4)]
    const bays = [rect(8, 0, 4, 4)]

    const next = planFrameMove({
      movedId: 'a',
      movedTo: rect(8, 0, 4, 4),
      layout: before,
      bays,
      limitsOf: anySize,
    })

    const framesBefore = [...before.map(({ x, y, w, h }) => `${x},${y},${w},${h}`), '8,0,4,4'].sort()
    // After the move: the two module frames plus whatever is now empty. The
    // set of rectangles on the board has to be identical either way.
    const framesAfter = [
      ...next.map(({ x, y, w, h }) => `${x},${y},${w},${h}`),
      '0,0,4,4', // the frame 'a' vacated
    ].sort()

    expect(framesAfter).toEqual(framesBefore)
  })
})
